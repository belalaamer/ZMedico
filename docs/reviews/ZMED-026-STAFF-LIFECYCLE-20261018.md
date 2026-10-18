# ZMED-026/027: transactional staff-account lifecycle

18 October 2026. P1. Fixed locally / selected Auth, API, Deno and browser operations Verified / NOT Deployed. This packet does not close the whole staff/user lifecycle or production audit.

## Problem and result

Staff Detail and User Management perform link, role and audit writes in separate requests. A failed role operation can leave a changed employee link; moving an account clears one employee before assigning another. A stale dialog has no observed-version check. The existing-employee path in Create User assigns a role without actually establishing the account link.

The candidate replaces these client sequences with `hr_manage_staff_user_link`: one database transaction checks the observed employee link/version, optional source employee/version, current caller session/permission/scope and target eligibility, then changes links, selected role and audits together. The two screens share one checked acknowledgement helper and duplicate-submit guard. Late reads/writes are fenced by identity, branch, record and capability generation. Explicit links take precedence over legacy id-based branch metadata. The existing-employee picker refreshes at dialog opening after role changes.

## Database dependency and release order

Requires the independently reviewed ZMED-258 canonical role writer from PR186 BEFORE this migration. It shares advisory lock `(20781001,1)` and uses the canonical writer for role revocation/assignment and last-owner protection. The dependency migration is not duplicated in this packet.

`20261018084224_atomic_staff_account_lifecycle.sql`:

- Refuses unexpected canonical writer (`e14edc923706705b7c6cbc43865f1e80`), private live-session guard (`4a77243167edf154de0192c7105f8bde`) or role-table ACL; refuses an already-existing lifecycle or older unversioned staff endpoint.
- Requires the actual API role `authenticated` and live native session; rechecks authority and both employee branch scopes after row waits.
- Locks both employee rows in UUID order after the shared administrative lock; compares link and `updated_at`, including both sides of a move.
- Denies suspended/terminated destination employment, deleted/banned Auth targets, foreign-tenant account adoption, duplicate active links and non-owner adoption of a System Owner account.
- Moves the old link, replaces/revokes roles and writes both audit records atomically. Membership retention remains the established contract; unlink does not delete branch memberships or Auth identities.
- Adds an invoker trigger blocking direct authenticated link-column writes while preserving other profile edits and server provisioning; closes authenticated role-table DML and its three legacy write policies.

There is no existing-account, financial or historical audit data correction. The new endpoint grants EXECUTE only to `authenticated` and its owner; privileged provisioning continues through its existing direct server path. Do not use the role/link closure as a substitute for auditing every server writer.

Required order after separate sensitive-production approvals: ZMED-258 database migration → this individually reviewed database migration → matching frontend. No db push, bulk migration replay, frontend-first release or automatic merge/apply.

## Exact selected acceptance

Final combined run `c5f2e8c7-1ddb-48c9-b6da-d8a31bbe52c6` exited0:

| Layer | Evidence |
| --- | --- |
| Native Auth/API | 37 labelled checks including fixture readiness/sign-ins: link, reaffirm, replace, move+role, unlink; stale destination/source; ordinary actor, foreign tenant, banned target, suspended employee, protected owner account; closed direct role/link writes; observed same-account adoption race; forced audit rollback; branch withdrawal during an observed target-profile wait; two independent owner demotions leaving one owner and last-owner self-demotion denial; banned/expired/revoked actual caller sessions; installed local security advisor WARN/ERROR |
| Real browser | 12 checks, actual independent admin UI login, eight lifecycle RPC writes, zero direct link/role writes and zero page errors. Detail link→reload→replace→unlink→relink; User Management move with selected Doctor role→reload→unlink; existing employee enablement→reload→unlink. Actual persisted state/roles checked after actions. English desktop1366×900; not all roles/viewports |
| Actual Deno handler | 7 checks with native caller JWT and frozen cached SDK2.57.4, loopback networking only: ordinary and foreign-tenant requests denied before Auth/signup writes; concurrent doctor/HR provisioning, distinct employee IDs, real password login and canonical permission resolution while the candidate link trigger and role ACL closure were installed. Handler is the separate reviewed ZMED-259 candidate SHA866eed8e, not an included Edge deployment |
| Frontend regression | 837 tests /89 files PASS,260.22s;22 focused helper/component/scope checks overlap that total. Final app/tooling TypeScript and Vite build PASS. New helper/test lint and diff checks PASS; existing page-wide `any` lint debt is not a clean-lint claim |

Counts overlap and are not unique end-to-end business scenarios. The native summary's coarse inherited browser:false flag is superseded by the detailed actual browser PASS receipt; its future logger was corrected without changing tested business behavior.

## Data and metadata integrity

The final run compared all146public tables and global function/relation/ACL/RLS/policy/constraint/trigger metadata. All original non-allocator public rows were unchanged. The only permitted original-row change was exactly two monotonic employee-number reservations from the real successful provisioning calls; they were retained, not rewound. New retained rows were positively owned:8profiles,2inactive tenants,3inactive branches/retired zero-balance treasuries,67audit rows and25shadow observations.

Candidate routines/triggers were removed; original canonical writer/session guard, table ACLs and policy definitions were restored. The three deliberately dropped/recreated role policies necessarily have new OIDs: only those three OIDs are excluded from exact metadata identity, while their complete definitions/roles/commands and all other metadata remain compared. No catalog repair, original-row restoration, audit deletion or allocator reset was used.

Independent postflight checks verify banned owned identities, zero Auth sessions/roles/staff/memberships, inactive scopes and zero retired treasury balances. Earlier failed attempts are retained as failures: receiver binding, late-permission loading, stale eligible-employee list and branch-withdrawal gate were corrected. The first corpus check incorrectly demanded old recreated-policy OIDs; that lost original snapshot is not retrospectively claimed as a full corpus pass.

## Remaining release and whole-lifecycle gates

- Hosted final-tree CI/CodeQL and scoped production approvals; source/main and live definitions must be rechecked immediately before any approved application.
- Actual account deletion and other privileged/service writers versus role changes/last-owner invariant; the canonical race test is not a universal writer guarantee.
- Broader default/custom-role, branch/tenant and lifecycle matrix; managed Auth/platform compatibility, natural deadlines, additional lock/deadlock schedules, partial/failed server compensation and error-audit durability.
- Lost committed HTTP response, offline/retry and UI cancellation/same-identity session competition; unit generation tests are not all browser schedules.
- Actual new-account creation UI, invitations, password reset/portal and disabled-account workflows beyond the selected cases above.

ZMED-269/PR190 is a separate treasury-scope approval. No production change, customer-data request to reproduce access, deployment, external provider/message or paid call occurred in this packet.
