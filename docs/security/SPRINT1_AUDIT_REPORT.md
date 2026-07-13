# Sprint 1 — Enterprise Security Hardening Audit Report

**Status:** Phase 1 (Audits) complete. Phase 2 (LOW-risk fixes) applied — see §6.
**Scope:** Documentation-only audit of the four Sprint 1 domains against the V8–V14 architecture corpus.
**Date:** 2026-07-13
**Baseline:** React 18 + Vite + TypeScript · Supabase/Lovable Cloud · ~110 tables · 106 SECURITY DEFINER functions · 7 Edge Functions.

---

## 1. Executive summary

| Domain | Objects reviewed | HIGH | MEDIUM | LOW | Verdict |
|---|---:|---:|---:|---:|---|
| SECURITY DEFINER functions | 106 | 0 | 0 | 2 | Compliant — hardening series already closed the historical gaps. |
| Edge Functions | 7 | 0 | 1 | 1 | Compliant — admin surface authorizes in-code; add defense-in-depth gateway JWT. |
| RLS policies | ~110 tables, 100% coverage | 0 | 1 | 2 | Compliant — every public table has RLS enabled; some dual-source policies remain. |
| Permission system | authz_bundles + role_permissions compat + usePermissions client | 0 | 1 | 0 | Compliant with documented compat layer; single-source migration deferred. |

**No HIGH findings. Zero blocking issues.** All findings are additive hardening or planned convergence work with an existing owning migration series.

## 2. SECURITY DEFINER function audit

### 2.1 Method
Full enumeration via `pg_proc` × `pg_namespace` for `nspname='public' AND prosecdef=true`. Cross-checked against `docs/security/SECURITY_DEFINER_AUDIT.md`, `S1_SECURITY_DEFINER_STANDARD_V1.md`, `S1_5_CONFORMANCE_AUDIT.md`, and the compliance harness `scripts/authz/compliance_definer.py`.

### 2.2 Structural findings

| Check | Result |
|---|---|
| Total SECURITY DEFINER functions in `public` | **106** |
| Functions with explicit `SET search_path` | **106 / 106** (100%) |
| Functions owned by `postgres` (expected) | **106 / 106** |
| Functions callable by `anon` without in-body guard | 0 (auth guards added in `SPRINT1_DEFINER_HARDENING.md`) |
| Cron helpers with explicit least-privilege ACL | 2 / 2 (`_get_cron_secret`, `_set_cron_secret`) |

### 2.3 Findings

| ID | Severity | Function(s) | Finding | Recommendation |
|---|---|---|---|---|
| D-1 | LOW | 34 authenticated-callable DEFINER RPCs flagged by Supabase linter | Pre-existing. Each has an in-body `has_role`/`has_permission` guard or is a pure utility. | Track in `docs/security/S2_COMPLIANCE_REPORT.md`; convert opportunistically to SECURITY INVOKER + RLS. |
| D-2 | LOW | 6 `security_definer_view` linter ERRORs | Pre-existing views owned by `postgres`. | Convert to `security_invoker = on` in a dedicated migration once each view's caller-scope is validated. |

**No new HIGH/MEDIUM DEFINER findings.**

## 3. Edge Function audit

### 3.1 Inventory

| Function | Purpose | Trigger | `verify_jwt` (gateway) | In-code auth | Service-role | Audit log |
|---|---|---|---|---|---|---|
| `admin-create-user` | Provision user | Client (admin) | inherited default (off) | `getUser` + `has_role('admin')` | scoped | via chain |
| `admin-delete-user` | Cascade-delete user | Client (admin) | inherited default (off) | `getUser` + `has_role('admin')` | scoped | pre-delete insert |
| `admin-export` | Bulk table export | Client (admin) | inherited default (off) | `getUser` + `user_roles` check | scoped, whitelist of 6 tables | pre-read insert |
| `admin-reset-password` | Send recovery link | Client (admin) | inherited default (off) | `getUser` + `has_role('admin')` | scoped | yes |
| `detect-queue-alerts` | Cron | Scheduler | default (off) | cron secret | background | via `queue_alert_runs` |
| `enqueue-winback` | Cron | Scheduler | default (off) | cron secret | background | via `reminders` |
| `send-reminder` | Cron + admin | Scheduler + admin | default (off) | cron secret + rate-limit | background | via `reminders` |

### 3.2 Findings

| ID | Severity | Function(s) | Finding | Recommendation |
|---|---|---|---|---|
| E-1 | MEDIUM | 4 admin functions | Gateway does not verify JWT; each function performs its own `auth.getUser()` + `has_role('admin')` check. Correct, but relies on in-code enforcement only. | Add `verify_jwt = true` at gateway. Pure defense-in-depth — no behaviour change for legitimate callers. **Applied in Phase 2 (§6).** |
| E-2 | LOW | 3 cron functions | Legitimately use `SUPABASE_SERVICE_ROLE_KEY`; allow-listed in `guardrails_backend.py`. | No change. Track in R4 migration plan. |

No tenant-isolation gaps found.

## 4. RLS policy audit

### 4.1 Structural findings

| Check | Result |
|---|---|
| `public` tables with RLS enabled | **all** (0 tables with `relrowsecurity = false`) |
| Tables with at least one policy | 110 / 110 |
| Tables using `has_permission()` (V8 canonical) | ~80% of policy set |
| Tables still using `has_role()` in policy body | ~20% — tracked by shadow-parity harness |

### 4.2 Findings

| ID | Severity | Table(s) | Finding | Recommendation |
|---|---|---|---|---|
| R-1 | MEDIUM | `appointments`, `attendance`, `expenses`, `invoices`, `invoice_items`, `payments`, `medical_records`, `prescriptions`, `patient_documents`, `physio_*` | Dual policy sources: legacy `has_role(...)` predicates coexist with newer `has_permission(...)` predicates. Union-of-allows semantics is correct, but surface is larger than V8 canonical requires. | Continue slice-by-slice shadow-parity migration (see `docs/wave3*` and `src/lib/authz/*ShadowProbe.ts`). |
| R-2 | LOW | `notifications`, `audit_export_presets`, `dental_chart` | Overlapping SELECT policies (self-scope + admin-scope) create redundant `OR` evaluations. | Consolidate opportunistically. |
| R-3 | LOW | 5 counter tables | Writes performed only via DEFINER functions; RLS blocks direct writes. | No change — intended shape. |

No table exposes `PUBLIC` writes. No policy grants `anon` beyond intentionally public reference tables.

## 5. Permission system audit

### 5.1 Sources of authorization truth

| Layer | Source | Status |
|---|---|---|
| Database (authoritative) | `authz_bundles` × `authz_bundle_permissions` × `authz_role_bundles` × `authz_permissions` | Live, versioned via `authz_versions` |
| Database (compat) | `role_permissions` legacy table | Kept in sync; read by two internal RPCs |
| Client (compat) | `src/lib/rolePermissions.ts` | Kept in sync with bundles |
| Client (canonical) | `usePermissions` → `authz_has_permissions` RPC | Primary path for all completed slices |

### 5.2 Findings

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| P-1 | MEDIUM | Two representations (bundles + `role_permissions`) still coexist. | Retirement scheduled after all slices ratified. Tracked in `docs/normalization/N7_PERMISSION_DESIGN_REVIEW.md`. Not a Sprint 1 fix. |

No privilege-escalation vectors in the current bundle set.

## 6. Phase 2 — LOW-risk fixes applied

### 6.1 Change: gateway JWT verification for admin edge functions

**File:** `supabase/config.toml`
**Change:** Added four function-scoped blocks setting `verify_jwt = true` for `admin-create-user`, `admin-delete-user`, `admin-export`, `admin-reset-password`.

**Why safe:** Each function already calls `supabase.auth.getUser()` and rejects unauthenticated callers with 401, then rejects non-admins with 403. Enabling gateway JWT verification adds an outer layer that rejects the same unauthenticated requests one hop earlier. Authenticated callers experience zero behaviour change; unauthenticated callers still see 401 (from the gateway instead of the function body).

**Not touched:**
- Cron functions (`detect-queue-alerts`, `enqueue-winback`, `send-reminder`) remain default — they are cron-triggered and do not present a Supabase JWT.
- No function body was modified.
- No RLS, SQL, migration, or client code touched.

### 6.2 Verification

| Check | Result |
|---|---|
| `supabase/config.toml` still contains `project_id` | yes |
| Only four admin function blocks added | yes |
| Existing tests unaffected (no runtime API surface change) | yes |
| Frontend callers use `supabase.functions.invoke(...)` with the user's session token | yes — the same header the gateway will validate |
| Cron functions unchanged | yes |

### 6.3 Backward compatibility

- **Client-side:** every admin surface invokes admin functions through `supabase.functions.invoke()`, which auto-attaches `Authorization: Bearer <jwt>`. Gateway JWT verification is transparent.
- **Cron / background:** unaffected — not in the change set.
- **External integrations:** none.

### 6.4 Rollback

Revert `supabase/config.toml` to the prior single-line file:

```toml
project_id = "mmlnvypctowdlbvbesui"
```

No data or schema mutated; rollback is a text-file revert.

## 7. Deferred (require explicit approval — Sprint 2+)

- **R-1:** Bulk consolidation of `has_role`/`has_permission` dual policies — via shadow-parity harness slice-by-slice.
- **P-1:** Retirement of `role_permissions` and `src/lib/rolePermissions.ts`.
- **D-1 / D-2:** SECURITY DEFINER → INVOKER conversions and `security_invoker = on` for the six views.
- **E-2:** Migrate cron edge functions off `SUPABASE_SERVICE_ROLE_KEY` onto `has_permission()`-gated RPCs.

## 8. Compliance mapping

| Architecture spec | Requirement | Status |
|---|---|---|
| V8 Authorization | Bundle-driven `has_permission()` in hot path | enforced in all completed slices |
| V9 Identity | Session lifecycle + role assignment via `handle_new_user` | ok |
| V10 Zero Trust | Gateway-level authentication on admin endpoints | ok **after §6.1** |
| V11 Governance | ADR / change trail for every hardening step | this document + `SPRINT1_*` series |
| V12 Observability | Pre-action `audit_logs` writes on admin ops | ok |
| V13 Data | RLS on 100% of public tables | ok |
| V14 Reference Architecture | Single edge-function authorization pattern (in-code + gateway) | ok **after §6.1** |

## 9. Final statement

Sprint 1 Phase 1 (audits) confirms the platform meets the V8–V14 security bar with **zero HIGH findings**. Sprint 1 Phase 2 applied a single mechanical, reversible defense-in-depth change (gateway JWT verification for four admin edge functions). All MEDIUM/HIGH remediation deferred to Sprints 2+ awaits explicit approval per the execution rules.

**Backward compatibility: 100%. Runtime regressions: none expected.**
