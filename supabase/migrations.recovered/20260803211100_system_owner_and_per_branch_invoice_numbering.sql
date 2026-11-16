-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260803211100
-- name: system_owner_and_per_branch_invoice_numbering
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Two owner decisions from 2026-08-03.

-- =====================================================================
-- 1. Assign system_owner to the clinic owner.
--
-- The role existed in the app_role enum and has_role() already treats it as a
-- superset of every other role, but ZERO users held it. Granted explicitly by
-- name at the owner's request: belalaamer@outlook.com.
--
-- The existing 'admin' row is deliberately KEPT. system_owner already implies
-- admin, so it is redundant for access, but it means an accidental removal of
-- the system_owner row cannot lock the owner out of his own system.
-- =====================================================================
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'system_owner'::public.app_role
FROM public.profiles p
WHERE p.email = 'belalaamer@outlook.com'
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 2. Per-branch invoice numbering.
--
-- Decision: each branch gets its own invoice series. Branch code: MAIN.
--
-- Why the branch code must appear IN the number: invoice_number carries a
-- UNIQUE constraint. If two branches each ran their own 1..N series with the
-- old INV-<year>-<seq> format, both would generate INV-2026-0024 and the second
-- insert would fail. The code disambiguates them.
--
-- New format:  INV-<BRANCH_CODE>-<YEAR>-<NNNN>   e.g. INV-MAIN-2026-0024
--
-- IMPORTANT AND DELIBERATE: renumber_active_invoices() already re-derives the
-- number of EVERY active invoice on every insert/update/delete of any invoice
-- (see triggers trg_invoice_renumber_after_*). Invoice numbers in this system
-- were therefore never immutable. As a result the 23 existing invoices will be
-- renumbered from INV-2026-0001..0023 to INV-MAIN-2026-0001..0023 the next time
-- any invoice changes. Sequence and order are preserved; only the prefix gains
-- the branch code.
-- =====================================================================

-- 2a. Give the existing branch its code.
UPDATE public.branches SET code = 'MAIN' WHERE is_main_branch = true AND code IS NULL;

-- 2b. Counters become per (branch, year) instead of per year.
ALTER TABLE public.invoice_counters ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

UPDATE public.invoice_counters c
SET branch_id = (SELECT b.id FROM public.branches b WHERE b.is_main_branch = true LIMIT 1)
WHERE c.branch_id IS NULL;

ALTER TABLE public.invoice_counters DROP CONSTRAINT IF EXISTS invoice_counters_pkey;
ALTER TABLE public.invoice_counters ADD PRIMARY KEY (branch_id, year);

-- 2c. Resolve a branch's code, with a deterministic fallback so numbering can
--     never collide even if someone creates a branch without setting a code.
CREATE OR REPLACE FUNCTION public.branch_invoice_code(_branch uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(upper(regexp_replace(b.code, '[^A-Za-z0-9]', '', 'g')), ''),
    'B' || upper(left(replace(_branch::text, '-', ''), 4))
  )
  FROM public.branches b
  WHERE b.id = _branch;
$$;

-- 2d. Sequential numbering, now segmented per branch and year.
CREATE OR REPLACE FUNCTION public.renumber_active_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  k TEXT;
  n INT;
  new_num TEXT;
  counts JSONB := '{}'::jsonb;
  code TEXT;
  y INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoices_invoice_number'));

  -- Pass 1: park every active invoice on a temporary unique number so the
  -- desired final numbers are free.
  UPDATE public.invoices SET invoice_number = 'TMP-' || id::text WHERE deleted_at IS NULL;

  -- Pass 2: assign final numbers, counting separately per (branch, year).
  FOR r IN
    SELECT id, branch_id, invoice_date, created_at
    FROM public.invoices
    WHERE deleted_at IS NULL
    ORDER BY branch_id NULLS FIRST, invoice_date ASC, created_at ASC, id ASC
  LOOP
    y    := EXTRACT(YEAR FROM r.invoice_date)::int;
    code := COALESCE(public.branch_invoice_code(r.branch_id), 'NA');
    k    := code || '-' || y::text;

    n := COALESCE((counts ->> k)::int, 0) + 1;
    counts := jsonb_set(counts, ARRAY[k], to_jsonb(n), true);

    new_num := 'INV-' || code || '-' || y::text || '-' || lpad(n::text, 4, '0');

    -- A soft-deleted invoice may still be holding this number; move it aside.
    UPDATE public.invoices
      SET invoice_number = 'OLD-' || id::text
      WHERE invoice_number = new_num AND deleted_at IS NOT NULL;

    UPDATE public.invoices SET invoice_number = new_num WHERE id = r.id;
  END LOOP;

  -- Keep the counters in step with what was actually assigned.
  FOR r IN
    SELECT i.branch_id, EXTRACT(YEAR FROM i.invoice_date)::int AS y, count(*)::int AS v
    FROM public.invoices i
    WHERE i.deleted_at IS NULL AND i.branch_id IS NOT NULL
    GROUP BY i.branch_id, EXTRACT(YEAR FROM i.invoice_date)::int
  LOOP
    INSERT INTO public.invoice_counters(branch_id, year, last_value)
      VALUES (r.branch_id, r.y, r.v)
      ON CONFLICT (branch_id, year) DO UPDATE SET last_value = EXCLUDED.last_value;
  END LOOP;
END;
$$;

-- 2e. Keep the standalone generator consistent with the new scheme.
CREATE OR REPLACE FUNCTION public.generate_invoice_number(_branch uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM current_date)::int;
  n INT;
  code TEXT := COALESCE(public.branch_invoice_code(_branch), 'NA');
BEGIN
  INSERT INTO public.invoice_counters (branch_id, year, last_value)
  VALUES (_branch, y, 1)
  ON CONFLICT (branch_id, year)
    DO UPDATE SET last_value = public.invoice_counters.last_value + 1
  RETURNING last_value INTO n;

  RETURN 'INV-' || code || '-' || y::text || '-' || lpad(n::text, 4, '0');
END;
$$;
