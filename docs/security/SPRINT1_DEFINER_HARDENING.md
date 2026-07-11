# Sprint 1 — SECURITY DEFINER Defense-in-Depth Hardening

**Status:** Applied. Single migration executed successfully.
**Scope:** LOW-priority recommendations from `docs/security/SECURITY_DEFINER_AUDIT.md` §7 (items 1 and 2). Nothing else touched.
**Date:** 2026-07-11

---

## 1. Functions modified

| Function | Signature | Change |
|---|---|---|
| `public._get_cron_secret()` | `() → text` | Explicit `REVOKE` from `PUBLIC`, `anon`, `authenticated`; `GRANT EXECUTE` re-asserted to `service_role` only. |
| `public._set_cron_secret(text)` | `(p_secret text) → void` | Same explicit REVOKE + `service_role`-only GRANT. |
| `public.authz_current_state()` | `() → jsonb` | Body prepended with `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;`. Rest of body byte-for-byte identical to prior version. |
| `public.authz_current_versions()` | `() → TABLE(artifact_type text, semver text, checksum text, activated_at timestamptz)` | Converted from `LANGUAGE sql` to `LANGUAGE plpgsql` so the auth guard can raise. Return columns, types, and query unchanged. |
| `public.authz_current_version(text)` | `(_artifact_type text) → TABLE(id uuid, artifact_type text, semver text, checksum text, activated_at timestamptz)` | Same treatment: `sql → plpgsql`, guard added, underlying query unchanged. |

No other functions were altered. No RLS policies, bundles, permission catalog entries, or grants outside the five functions above were touched.

## 2. SQL changes (as applied)

```sql
-- Cron secret helpers: explicit least-privilege
REVOKE ALL ON FUNCTION public._get_cron_secret()           FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._get_cron_secret()        TO service_role;
REVOKE ALL ON FUNCTION public._set_cron_secret(text)       FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._set_cron_secret(text)    TO service_role;

-- Authorization version RPCs: add auth.uid() null guard
-- (authz_current_versions, authz_current_version, authz_current_state)
-- Each body now starts with:
--     IF auth.uid() IS NULL THEN
--       RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
--     END IF;
-- The two former SQL-language functions are re-declared as plpgsql
-- (RETURN QUERY <same SELECT>). Signatures, return types, volatility
-- (STABLE), SECURITY DEFINER context, and search_path are preserved.
```

Full statements are in the migration file created at approval time; see the migration timestamp for the exact copy.

## 3. Security impact

| Concern | Before | After |
|---|---|---|
| Cron secret helpers exposed if a future GRANT widens ACL | ACL held only `postgres` / `service_role` (and internal `sandbox_exec`) but no explicit `REVOKE` was recorded, so a stray `GRANT` could silently widen it | Explicit `REVOKE ALL … FROM PUBLIC, anon, authenticated` documents intent; future review of GRANTs is trivial |
| Read-only authz version RPCs callable by unauthenticated JWTs | Depended on Supabase gateway rejecting anon; no in-body check | In-body `auth.uid() IS NULL → 42501` blocks any accidental exposure (custom JWTs, `service_role` misuse, edge-function bugs) |
| Data returned to authenticated users | n/a | Unchanged. Return columns and query bodies are byte-identical. |
| Signatures / return types | n/a | Unchanged; `src/integrations/supabase/types.ts` requires no regeneration. |

No expansion of privileges. No new SECURITY DEFINER functions introduced (count remains 106 per §1 of the SECURITY_DEFINER_AUDIT).

## 4. Verification

| Check | Result |
|---|---|
| Function signatures unchanged (`pg_get_function_identity_arguments`) | ✅ verified pre/post — no change |
| Existing callers unchanged | ✅ `rg` for `_get_cron_secret`, `_set_cron_secret`, `authz_current_state`, `authz_current_versions`, `authz_current_version` — no frontend call-site edits required |
| Generated types (`src/integrations/supabase/types.ts`) | ✅ no drift — return columns and argument list identical, so regeneration is a no-op |
| RLS policies | ✅ none touched |
| Permission bundles | ✅ none touched |
| Permission catalog | ✅ none touched |
| Frontend code | ✅ none touched |
| Supabase linter | 40 findings reported after migration — **all pre-existing** (6 `security_definer_view` ERRORs on pre-existing views; 34 `authenticated_security_definer_function_executable` WARNs on the pre-existing authenticated-callable RPC set). No new finding introduced by this migration. |

## 5. Rollback SQL

```sql
-- 1. Cron secret helpers: drop explicit REVOKE annotations
--    (Since the prior state had no explicit REVOKE, the safest rollback is
--    a no-op — the current REVOKEs are equivalent to the historical default.
--    If you must literally restore the prior ACL text:)
GRANT EXECUTE ON FUNCTION public._get_cron_secret()        TO service_role;
GRANT EXECUTE ON FUNCTION public._set_cron_secret(text)    TO service_role;

-- 2. authz_current_versions: restore SQL-language body
CREATE OR REPLACE FUNCTION public.authz_current_versions()
 RETURNS TABLE(artifact_type text, semver text, checksum text, activated_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT v.artifact_type, v.semver, v.checksum, v.activated_at
  FROM public.authz_versions v
  WHERE v.status = 'active';
$$;

-- 3. authz_current_version(text): restore SQL-language body
CREATE OR REPLACE FUNCTION public.authz_current_version(_artifact_type text)
 RETURNS TABLE(id uuid, artifact_type text, semver text, checksum text, activated_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT v.id, v.artifact_type, v.semver, v.checksum, v.activated_at
  FROM public.authz_versions v
  WHERE v.artifact_type = _artifact_type
    AND v.status = 'active'
  LIMIT 1;
$$;

-- 4. authz_current_state: remove the auth guard by re-issuing the pre-hardening
--    body (unchanged aside from removing the leading IF auth.uid() IS NULL block).
--    The full pre-hardening body is preserved in git history and in
--    docs/security/SECURITY_DEFINER_AUDIT.md context.
```

Rollback is safe to apply at any time; it does not touch RLS or grants beyond the two cron helpers.

## 6. Regression risk

- **Behavioural risk for authenticated users:** none. All three authz RPCs return the exact same rows for any request that carries a valid Supabase JWT.
- **Behavioural risk for unauthenticated callers:** intentional. Any call without `auth.uid()` now raises `42501 authentication required`. No known caller uses these RPCs without a JWT (Supabase gateway already blocked such calls); this is a defence-in-depth net.
- **Cron pipeline:** `_get_cron_secret` / `_set_cron_secret` are invoked only by `postgres` (during migration) and `service_role` (via `pg_cron`). The explicit REVOKE is a no-op against those principals.
- **Type regeneration:** not required. Function argument lists and return column lists are byte-identical to their prior definitions.
- **Regression harness (`scripts/authz/run_all.sh`):** no baseline change expected — the static analyzer keys on decision output for role-holders, and all authenticated calls still return the same rows.

## 7. Items already satisfied (not re-applied)

None of the two LOW recommendations were already implemented — both required this migration to close them. No duplication.

---

**Sprint 1 Hardening Task 2 complete.** The two LOW findings from `SECURITY_DEFINER_AUDIT.md` §7 items 1–2 are closed. Remaining audit items (`patient_wallet` permission re-key, shadow-migration overload retirement) are out of scope for this batch per the sprint plan.