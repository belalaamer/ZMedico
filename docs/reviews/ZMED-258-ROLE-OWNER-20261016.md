# ZMED-258 — Canonical role assignment: native session and owner concurrency

SQL-only candidate. No Production application or frontend/staff-link release is included.

## Reproduced defect

Fresh Production `settings_assign_user_role(uuid,app_role,uuid)` MD5 is `84b09a776c838d5f2cf55648ab7f2adb`. In an owned local sandbox with no preexisting owners, two genuine authenticated sessions concurrently cleared the two owned owner roles. Both real HTTP requests were observed blocked after preconditions on separately held row locks; after release both returned success and the owner count became zero. Original local definition and all owned access fixtures were restored. Baseline43assertions including cleanup succeeded in reproducing the defect.

## Change

Require actual API role authenticated plus authoritative private live session; take shared administrative transaction lock `(20781001,1)` before role reads/counts; recheck live state/actor authority after waiting. Prioritize an existing System Owner in multi-role targets. Empty function search_path; retain branch rules, allocation, canonical role mutation and atomic audit. No role/branch/balance data or RLS/ACL change at deployment.

Bounded migration preflights reject unexpected canonical/session function hashes. Private session dependency expected MD5 `4a77243167edf154de0192c7105f8bde`.

## Evidence

- Clean source baseline main `0b1755ab5aaa66365e486797d9b30810dfd126f1`.
- Full local suite: **813 tests / 87 files passed**; app and tooling TypeScript checks passed. Five new regression tests pass.
- Native combined corrected canonical writer plus pending full staff-link SQL (including authenticated role-DML closure): **59 checks including cleanup passed**. Seven independent real Auth identities; banned/expired/revoked sessions, ordinary role and foreign branch/tenant denials, link/reaffirm/replace/unlink, same-target two-session race, forced-audit rollback, direct-role-write denial and canonical/read compatibility.
- Corrected owner race accepts exactly one demotion and preserves one owner. Native last-owner self-demotion rejected23514 with unchanged role/audit.
- Old account's unchanged native JWT loses access to a real synthetic patient after replacement; unlinked replacement's JWT also sees no patient despite retained membership.
- Owned patient removed locally; identities banned; owned sessions/roles/links/memberships removed, branches/foreign tenant inactivated, immutable audit retained. Original local function bodies/owners/ACL/config, table ACL,13staff policies and core contracts restored exactly. Last run branch `43bb2cd0-94ee-4a7a-8714-ec6a27591bf4`.
- Seven adjacent staff source tests passed in the separate unpublished candidate checkout. That checkout and its UI/migration are deliberately **not** included in this PR.
- A fresh final repeat passed60checks including cleanup and the local security advisor while all candidates were installed: no issues found. Final synthetic branch `395fce88-7ad3-4fb4-83bf-2bf7340c1c86`; exact restoration verified again.

These are Auth/API/database and source tests, not staff browser or actual Deno Edge provisioning acceptance. Hosted CI remains a separate final gate.

## Ordering / scope limitations

The pending staff-link function must take the same lock before staff/profile locks when it is eventually reviewed and released; its updated local source has that order. Do not release its older lock order.

This lock serializes this canonical RPC and participating staff RPC only. Service-role Edge deletion/provisioning and direct role-table writes do not automatically acquire it; global owner preservation across those paths is still a separate requirement. No global ZMED-185/role-lifecycle closure or whole-system readiness claim.

## Release procedure

1. Exact reviewed source and final checks; obtain scoped Production approval.
2. Fresh read-only dependency, function owner/ACL, role/link/membership/policy fingerprints.
3. Apply this one migration transaction; never db push or replay migration history.
4. Verify exact new body, original ACL/owner, unchanged role/link/membership/policy fingerprints and intended session/branch rules. Do not mutate real Production roles to simulate a test.
5. Stop and review on drift/failure; no unsafe rollback by automatic overwrite.

Rollback, if specifically approved after investigation, restores the reviewed original function definition only; it reopens the known race/session gap. No automatic role restoration, data deletion or history repair.
