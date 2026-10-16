# ZMED-250 — isolated self-permission candidate

P1: canonical security-invoker effective-permission view cannot traverse four restrictive owner-only authorization catalogs. A native local receptionist gets an empty grant set despite seeded role bundles. Production policies/view confirmed read-only; no Production staff login claimed.

## Boundary

The public no-argument, invoker RPC validates the existing active-session assertion. Its private empty-search-path definer helper rechecks live session, derives auth.uid(), requires the existing non-terminated self staff link except for admin bootstrap, and traverses only that user's role bundles. The helper is deliberately privileged only to read otherwise owner-only configuration; it does not expose the configuration or business data. Existing views, policies and role mappings remain unchanged. Anonymous and service-role RPC execution are revoked. No supplied user/branch arguments exist.

Client canonical failures now deny rather than falling through to legacy default grants. Successful empty grants remain empty; malformed and foreign-identity responses are rejected.

## Evidence

- 23/23 focused unit/component tests passed, including stale identity responses and failure/empty-grant behavior.
- 35/35 local native-Auth/authenticated-SQL checks passed including cleanup: separate receptionist, doctor and accountant sessions; exact self grants, original invoker-view failure, all four catalogs remain inaccessible, removed role empty, terminated/unlinked staff rejected, banned/expired/revoked sessions rejected, ACL and no identity-taking overload checked.
- The SQL probe used actual issued session claims and SET LOCAL ROLE authenticated. Candidate schema and local-only issuer adaptation lived inside BEGIN/ROLLBACK. Original policy fingerprint restored; temporary schema absent; owned sessions/roles/staff absent. Test Auth identities retained banned for audit provenance. No financial/clinical or Production writes.
- This is NOT HTTP RPC or browser acceptance. Remaining roles, recursive catalog edge cases, security advisor review, complete typecheck/build and independent release review remain gates.

## 2026-10-16 follow-up, supersedes earlier pending HTTP/browser wording

-72/72native HTTP checks passed across9distinct Auth identities, including manager/HR/nurse/admin/owner/no-role, exact self-only grants, private schema and anon/service-role denial, live-session/role revocation, original policies/table ACLs unchanged and cleanup verified.
-86/86combined HTTP/browser checks passed after companion251fix: native browser receptionist and doctor Queue permission/refresh and loading-table completion; roleless account rejected by the existing staff-shell boundary. Actual self-RPC200responses observed for staff, not inferred from rendered headings. This is not clinical/financial CRUD acceptance. Screenshots are in the external audit outputs, not part of deployable source.
- Browser caught companion251: optional import.meta env lookup bypassed Vite's transform and selected legacy despite canonical=true. Direct static access fixed;8flag tests plus previous23tests all passed (31/31). Actual served module now contains injected flag; production localStorage override remains ignored.
- Prior250full typecheck/build passed (2891modules); complete post251rebuild remains pending until its terminal result is captured. Do not substitute the earlier build for the revised candidate.
- Local CLI security advisors reported no warnings/errors while candidate RPC existence was checked before AND after the review. This is automated local evidence, not independent review or a Production advisor result.
- OpenAPI presence was insufficient readiness: PGRST202 occurred before cache caught up. Release must validate the actual STABLE read-only RPC. No business-write retry introduced. A sorting-only comparison failure and no-role expected-message mismatch were harness defects, corrected without widening grants; incomplete runs excluded and cleanup verified.
- Production canonical runtime selection is unproven from tracked .env alone. Earlier impact inference from config is conditional; SQL/view restrictive-policy evidence remains valid. Activating251may change effective UI permissions globally, so it requires separate explicit risk review and250endpoint-first rollout. No Production activation authorized here.
- Fresh Production read-only preflight on2026-10-16: candidate RPC/private schema absent; session guard/assertion/has_role definitions match reviewed hashes; original view remains security-invoker and all4catalog policies remain restrictive owner-only. `docs/ZMED-250-release-preflight.sql` preserves repeatable prerequisite checks, not deployment authorization. Recheck exact policy predicates/ACLs before any separately approved migration.
- Expanded local transaction probe39/39passed including cyclic implication/dedup/deprecated-key and rollback restoration checks. Not a Production SQL test.
- Combined post251full application/tooling typecheck and production build passed (2891modules; bundling1m16s). Six additional actual Vite production-artifact executions verify enabled/disabled flags and ignored browser overrides; helper cannot write override in production. Full suite final result is separate and not implied by these focused results.

## Completed full regression and remaining publication boundary

Combined250/251candidate full suite **735/735passed across77files**,0failed/0pending, exit0,588.54s. Focused lint and diff checks passed. The31focused tests are part of735, not an additional count. Local source verification is complete for the documented self-read/flag scopes; no all-screen or financial workflow claim.

Production read-only compatibility review used actual71legacy role-permission rows plus exact per-module fallback behavior against actual canonical keys. No legacy key removed for manager/doctor/nurse/receptionist/accountant/HR. Manager gains inventory.tx.write/purchase_orders.receive/treasury.daily_close.view; receptionist gains invoices.coupon.apply; accountant gains invoices.coupon.apply/treasury.daily_close.view. No permissions were changed to perform the comparison. Review and accept manager stock adjustment/transfer/PO receiving paths and remaining delta semantics before global frontend activation. Keep individually approved endpoint deployment separate; no Production change authorized/performed by this document.

Full audit receipts and role matrix live in the task's external outputs. A source-pattern follow-up252for other optional environment readers remains Investigating and is not bundled into this candidate.

## Release

Keep separate from clinical PR181. Apply migration individually only after approved review of the exact file and current session dependency definitions; never db push or weaken catalog RLS. Publish database endpoint before switching the frontend caller. A frontend rollback may reintroduce the original empty-view defect and legacy error fallback; assess that explicitly. Do not delete the endpoint while deployed clients depend on it. This document is not authorization to deploy.
