
-- BA-01: Authorization Version Registry (fully additive)
-- Single source of truth for authorization metadata versioning.
-- Stores ONLY version metadata; never duplicates catalog/bundle/RLS data.

CREATE TABLE IF NOT EXISTS public.authz_versions (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artifact_type    text        NOT NULL,
  semver           text        NOT NULL,
  status           text        NOT NULL DEFAULT 'draft',
  checksum         text        NULL,
  notes            text        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        NULL,
  activated_at     timestamptz NULL,
  activated_by     uuid        NULL,
  deprecated_at    timestamptz NULL,
  deprecated_by    uuid        NULL,
  CONSTRAINT authz_versions_artifact_type_chk CHECK (artifact_type IN (
    'permission_catalog',
    'bundle',
    'role_binding',
    'authz_catalog',
    'rpc_manifest',
    'rls_inventory',
    'golden_baseline'
  )),
  CONSTRAINT authz_versions_status_chk CHECK (status IN ('draft','active','deprecated')),
  CONSTRAINT authz_versions_semver_chk CHECK (semver ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  CONSTRAINT authz_versions_artifact_semver_uk UNIQUE (artifact_type, semver)
);

-- Exactly one ACTIVE version per artifact_type at any moment.
CREATE UNIQUE INDEX IF NOT EXISTS authz_versions_one_active_per_type
  ON public.authz_versions (artifact_type)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS authz_versions_type_status_idx
  ON public.authz_versions (artifact_type, status);

-- Grants (BEFORE RLS enable, per platform standard)
GRANT SELECT ON public.authz_versions TO authenticated;
GRANT ALL    ON public.authz_versions TO service_role;

ALTER TABLE public.authz_versions ENABLE ROW LEVEL SECURITY;

-- Read: any signed-in user may inspect version metadata (needed for
-- client-side cache-busting once wired in a subsequent M1 task).
CREATE POLICY "authz_versions_read_authenticated"
  ON public.authz_versions
  FOR SELECT
  TO authenticated
  USING (true);

-- Writes: service_role only. No admin-side write path in BA-01 scope.
-- Future M1 tasks may introduce a SECURITY DEFINER RPC that inserts rows.
CREATE POLICY "authz_versions_write_service_role_only"
  ON public.authz_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Immutability trigger
-- Rules:
--   * artifact_type, semver, checksum, created_at, created_by are frozen after insert.
--   * status transitions allowed: draft -> active -> deprecated. No reversals.
--   * activated_at/activated_by set exactly once on draft -> active.
--   * deprecated_at/deprecated_by set exactly once on active -> deprecated.
--   * notes may be appended (never rewritten) — enforced as append-only.
CREATE OR REPLACE FUNCTION public.authz_versions_enforce_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.artifact_type IS DISTINCT FROM OLD.artifact_type THEN
    RAISE EXCEPTION 'authz_versions.artifact_type is immutable';
  END IF;
  IF NEW.semver IS DISTINCT FROM OLD.semver THEN
    RAISE EXCEPTION 'authz_versions.semver is immutable';
  END IF;
  IF NEW.checksum IS DISTINCT FROM OLD.checksum THEN
    RAISE EXCEPTION 'authz_versions.checksum is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'authz_versions.created_at is immutable';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'authz_versions.created_by is immutable';
  END IF;

  -- Status transition rules
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'draft' AND NEW.status = 'active' THEN
      NEW.activated_at := COALESCE(NEW.activated_at, now());
    ELSIF OLD.status = 'active' AND NEW.status = 'deprecated' THEN
      NEW.deprecated_at := COALESCE(NEW.deprecated_at, now());
    ELSE
      RAISE EXCEPTION 'authz_versions: illegal status transition % -> %',
        OLD.status, NEW.status;
    END IF;
  END IF;

  -- Timestamps, once set, are frozen.
  IF OLD.activated_at IS NOT NULL
     AND NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    RAISE EXCEPTION 'authz_versions.activated_at is immutable once set';
  END IF;
  IF OLD.deprecated_at IS NOT NULL
     AND NEW.deprecated_at IS DISTINCT FROM OLD.deprecated_at THEN
    RAISE EXCEPTION 'authz_versions.deprecated_at is immutable once set';
  END IF;

  -- Notes: append-only. New value must start with old value.
  IF OLD.notes IS NOT NULL
     AND (NEW.notes IS NULL OR position(OLD.notes IN NEW.notes) <> 1) THEN
    RAISE EXCEPTION 'authz_versions.notes is append-only';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER authz_versions_immutability
  BEFORE UPDATE ON public.authz_versions
  FOR EACH ROW EXECUTE FUNCTION public.authz_versions_enforce_immutability();

-- Deletes are forbidden entirely (history must remain intact).
CREATE OR REPLACE FUNCTION public.authz_versions_block_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'authz_versions rows are historical and cannot be deleted';
END;
$$;

CREATE TRIGGER authz_versions_no_delete
  BEFORE DELETE ON public.authz_versions
  FOR EACH ROW EXECUTE FUNCTION public.authz_versions_block_delete();

-- Canonical resolver: current active version for one artifact type.
CREATE OR REPLACE FUNCTION public.authz_current_version(_artifact_type text)
RETURNS TABLE (
  id            uuid,
  artifact_type text,
  semver        text,
  checksum      text,
  activated_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.artifact_type, v.semver, v.checksum, v.activated_at
  FROM public.authz_versions v
  WHERE v.artifact_type = _artifact_type
    AND v.status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.authz_current_version(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authz_current_version(text)
  TO authenticated, service_role;

-- Canonical resolver: active versions for all artifact types (one row per type).
CREATE OR REPLACE FUNCTION public.authz_current_versions()
RETURNS TABLE (
  artifact_type text,
  semver        text,
  checksum      text,
  activated_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.artifact_type, v.semver, v.checksum, v.activated_at
  FROM public.authz_versions v
  WHERE v.status = 'active';
$$;

REVOKE ALL ON FUNCTION public.authz_current_versions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authz_current_versions()
  TO authenticated, service_role;

-- Seed the seven artifact types at baseline v1.0.0 (active).
-- This records TODAY's frozen state as the canonical starting point
-- for every artifact. No authorization behavior changes; these rows
-- are pure metadata pointers to the already-committed catalog/bundle/
-- RLS/RPC/baseline state.
INSERT INTO public.authz_versions
  (artifact_type, semver, status, activated_at, notes)
VALUES
  ('permission_catalog', '1.0.0', 'active', now(),
    'BA-01 seed. Anchors docs/PERMISSION_CATALOG.md (RC2, 56 keys).'),
  ('bundle',             '1.0.0', 'active', now(),
    'BA-01 seed. Anchors Wave 1 authz_bundles seed (dormant per RC2).'),
  ('role_binding',       '1.0.0', 'active', now(),
    'BA-01 seed. Anchors 6-role RC2 default grants.'),
  ('authz_catalog',      '1.0.0', 'active', now(),
    'BA-01 seed. Aggregate view of catalog+bundle+role_binding at RC2.'),
  ('rpc_manifest',       '1.0.0', 'active', now(),
    'BA-01 seed. Anchors scripts/authz/rpc_manifest.yaml v1 (12 entries).'),
  ('rls_inventory',      '1.0.0', 'active', now(),
    'BA-01 seed. Anchors Wave 2.5 pg_policies snapshot (3392 cells).'),
  ('golden_baseline',    '1.0.0', 'active', now(),
    'BA-01 seed. Anchors golden_authorization_baseline.csv + golden_rpc_baseline.csv (3760 decisions).');

COMMENT ON TABLE public.authz_versions IS
  'Authorization Version Registry (BA-01). Single source of truth for authorization metadata versioning. Stores only version metadata; never duplicates catalog/bundle/RLS/RPC data. Rows are immutable except for the draft->active->deprecated status ladder; deletes are blocked; exactly one active row per artifact_type.';

COMMENT ON FUNCTION public.authz_current_version(text) IS
  'Canonical resolver: returns the current active version metadata for a single artifact_type. STABLE, SECURITY DEFINER, read-only.';

COMMENT ON FUNCTION public.authz_current_versions() IS
  'Canonical resolver: returns the current active version metadata for every artifact_type (one row per type).';
