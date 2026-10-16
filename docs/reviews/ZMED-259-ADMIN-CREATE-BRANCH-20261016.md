# ZMED-259 — Bound privileged user creation to the caller's branch authority

## Scope and reproduction

Three-file Edge-only candidate: handler, nine regression tests and this review. No SQL migration, grant/RLS/catalog change, frontend update or existing account mutation.

Fresh read-only Production retrieval: admin-create-user version14, ACTIVE, verify_jwt=true, bundleSHA c4dcb2f7554c2633fc4b8d097fb5c8d5cb253258b63bb87e2459d973f03efb1c. Handler and all three relative helper contents match main0b1755ab5aaa66365e486797d9b30810dfd126f1 byte for byte. Baseline handlerSHA25636a05ccacd8f156733defa903d6f82374fa0baa58008d9a2d14a1d6e4a30f8d2.

Actual unmodified Deno handler accepted an authenticated ordinary branch admin's doctor-creation request with a branch belonging to a different owned tenant. HTTP200 and real Auth/role/linked-staff creation observed. Baseline62checks including cleanup; no Production request or provider/email call. Missing authorization existed before service-role allowlist/Auth/staff writes, not in JWT validation.

## Fix

Validate supplied branch UUID. Call existing `user_has_branch_access(_branch)` through the **caller JWT client**, require explicittrue, deny403 on false/null, fail503 on dependency/transport error. Gate precedes signup authorization and Auth writes. Canonical helper retains explicit System Owner global access. Branchless admin provisioning remains unchanged.

Candidate handlerSHA256866eed8ed99be44a80f47910a3a21e3c1ee9ca64e3007a5407caddf26b1b6fdb. No import or relative helper changes:

- employee-id.ts: b09d339409803815564635549de1a6429eb4f9588aaa505e961c381a62cd7c4a
- active-session.ts: 1eb23d02ea78d1bdf967f2b0b98505b90d7c609b6b694e961af93dd71773a27d
- cors.ts: 20d9de788228aebccf8137b944aec16679658642d6d9b4aed4eb6e53aa9766d6

## Evidence

- Before fix:8of9new focused tests failed; actual native Deno baseline foreign-tenant creation succeeded.
- After fix:9new+15adjacent admin Edge tests pass; new test lint, app/tooling TypeScript and frozen/cached Deno typecheck pass.
- Actual Deno2.9.6 handler, pinned supabase-js2.57.4, native Supabase Auth/Data APIs: final**91checks including cleanup/security advisor** pass. This combines the updated handler with pending canonical/staff SQL to prove compatibility with the stricter authenticated role-table closure; that SQL is **not** included in this PR.
- Authorized doctor/HR creation, real login/canonical permissions, ordinary actor denial, malformed/missing/foreign-tenant branch denial, banned/expired/revoked session denial, and explicit System Owner foreign-branch provisioning pass.
- Concurrent same-email requests: exactly one complete identity and one rejected duplicate. Concurrent doctor/HR creation: both complete, distinct employee IDs.
- Forced staff-profile insert failure: actual HTTP500, compensation removes the new Auth/profile/signup authorization; complete profile/role/staff/membership fingerprints return exactly to their prior state. Employee number reservation intentionally retained, never reused.
- Adjacent link/replace/unlink, unchanged-JWT access removal, adoption race, audit rollback, owner-preserving canonical race and last-owner rejection also pass in that run. Installed-candidate security advisor: no issues found.
- Final owned branch04c81b7c-93f7-430a-bf1b-4b86edab93c2. Twelve synthetic identities retained banned; all owned sessions/roles/staff links/memberships/signup authorizations removed; local patient removed, branches/foreign tenant inactivated, immutable audits retained, original SQL definitions/ACLs/policies restored exactly. Owned Deno listener stopped.

Local test-counter initialization matched Production's existing id1row; it did not fix or invoke the Production allocator, and does not close known beyond9999caseZMED-158. Initial lock/cache and empty-counter failures were distinguished from application defects; existing QA runtime lock reused frozen, neither repository lock rewritten.

Hosted full regression/build/CodeQL remain independent gates until terminal receipts. These are real Deno handler/native Auth/API tests, not full Supabase hosted gateway/bundle, browser provisioning or every compensation-failure scenario. No external message/charge/test-identity creation in Production.

## Release controls

Obtain scoped approval; refetch version/verify_jwt and all four source fingerprints; confirm existing caller helper and active-session dependencies/ACLs. Deploy only this handler with its three unchanged helpers and verify_jwt=true. Retrieve and compare deployed source/version; reject anonymous invocation without creating users, and compare unchanged Production account/role/link/membership fingerprints. Do not invoke Production account creation as a test shortcut. Staff-link/258SQL release remains separately authorized; this patch does not require applying either SQL candidate.
