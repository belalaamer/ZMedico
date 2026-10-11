# ZMED-185 phase-one database deployment receipt

Human approval: phase one only, database only. Applied individually on11October2026; no db push.

Source: `supabase/migrations/20261011160004_assert_active_edge_caller_session.sql`.
SHA256: `593bdf5295cb30c0495c1ac54f026f5c74671905faa63277041806f60bd3a0e1`.
Hosted history: `20261011164710`, name `assert_active_edge_caller_session`.

| Routine | Mode / owner | Definition MD5 | Execution |
|---|---|---|---|
| public.assert_active_session() | invoker / postgres | cd7553f3ade0585ecbe09631d1140bb2 | authenticated only; anon/service denied |
| zmedico_security.session_is_active() | private definer / postgres | 4a77243167edf154de0192c7105f8bde | authenticated only; anon/service denied |

Both use empty search_path. Private schema USAGE is authenticated-only. The helper reads protected Auth metadata only for the validated native caller/session pair and exposes no session/user data or arbitrary actor arguments. Public assertion takes no arguments and returns void.

## Before/after verification

- Original public-function definitions/ACLs/owner/config/security-mode hash unchanged: `5efffe8f65e3375494d2401028aa833d` (excluding only the newly added assertion).
- Original public table ACL/RLS hash unchanged: `4194fcbf21b250dc756fa1767a6a8739`.
- Original policy hash unchanged: `cd3d3a2c82450db0d6377faf32472e48`.
- Original public-trigger hash unchanged: `3e0849789019030b0fe92f60c0b77647`.
- Original role/database-setting hash unchanged: `143a5eab6f77e57ba9a9004db6f80911`.
- Security advisor results semantically unchanged, excluding only observed_at timestamps. Existing findings remain; this is not a clean-security certification.
- Six configured authenticated SQL negatives deny with generic42501, all under rollback: nonexistent user/session, malformed session, malformed user, expired/malformed expiry and foreign issuer. No real user/session, account ban, patient read or financial target used.
- Actual hosted public-anon RPC returns401/42501. Private RPC with Content-Profile zmedico_security returns406/PGRST106, proving that private schema is not exposed. OpenAPI-root profile probing was not a valid schema-selection test; its failed assertion is retained as a diagnostic, not counted as a pass.

## Local supporting evidence and limits

88combined checks passed using actual owned local Auth/RPC,12checked-in registration bridges and a genuine isolated Edge-runtime probe with frozen SDK2.117.2/shared helper.14local advisor/metadata/reapplication/restoration checks and52later native assertion/timing checks passed. Ten local HTTP samples: median19.50ms/p9535.25ms, including gateway/VM/HTTP overhead, NOT hosted performance. Seven candidate source-contract tests pass. Full dirty-audit source final regression983tests/94files, both TypeScript configurations and Vite2896module build pass; this does not certify every screen or Production workflow.

## Strict release boundary

This deploys the new database assertion ONLY. It does not wire callers, alter existing RLS/permissions, change financial balances/history, install a global pre-request hook, deploy frontend/Edge functions, or upgrade PostgreSQL. Existing native hosted positive-session/business-handler/role/branch checks remain unverified because no dedicated Production test account was provisioned.

The12protected Edge source changes remain unpublished and need their own review/acceptance/authorization. Whole ZMED-185 remains Open for Data API/RLS/definer RPC, Storage/Realtime/signed-URL and broad session/caller coverage. New assertion availability alone does not revoke sensitive direct-table access.
