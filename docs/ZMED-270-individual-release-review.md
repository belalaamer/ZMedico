# ZMED-270 — Preserve a System Owner across privileged role writers

Status: Fixed and verified in isolation; not deployed. P1.

Published main c250a552d41d01c9ebf6456b1f48bf58fcd5b880 and ACTIVE admin-delete-user v9 were inspected. The local baseline used the byte-identical handler with pending ZMED-258 and ZMED-191 installed. Two independently authenticated synthetic System Owners passed the separate count checks, then both actual Edge deletes returned 200: zero owned owner roles and zero owned Auth users remained. Run bda84f2f-54b4-47fb-9e92-3a1c64ddbe7d. No production business call was made.

The SQL change serializes all role-table statements before row locks using the canonical administrative lock. A private, RLS-protected count row tracks owner changes; a deferred constraint verifies at least one owner and exact agreement with role rows. This permits canonical DELETE/INSERT owner reaffirmation, rejects loss on privileged deletes, and forces stale REPEATABLE READ updates to retry. TRUNCATE is denied. No existing account/role is changed; the new private row is seeded from existing roles. Empty-owner databases fail preflight and require a separately reviewed recovery decision.

The Edge change returns a specific 409 only for the owner constraint from user_roles cleanup. Other cleanup failures remain failures. Actor identity is retained inside the pre-deletion audit payload, including when Auth deletion clears an audit foreign key. The audit describes a request, not a completed deletion.

## Individual release requirements

Sensitive production migration: specific approval required; never db push/history replay. Apply the reviewed ZMED-258 dependency first, after its own review. Verify canonical MD5 e14edc923706705b7c6cbc43865f1e80, private schema, existing owner count, user_roles triggers/RLS/grants and exact source/deployment drift immediately before applying this single migration in a transaction. lock_timeout=2s, statement_timeout=30s; failure rolls back rather than waiting indefinitely. Do not repair customer data to satisfy preflight.

After commit, verify count equals owner role count, private ACL/RLS, statement/row/deferred trigger definitions, no role changes and restored normal authorization. Deploy the reviewed Edge handler separately with JWT verification preserved; verify its source and non-mutating live health. Production destructive deletion testing is not authorized. Any rollback removing the guard requires separate review because it reopens the reproduced race; no blind down migration.

## Limits

This is role cardinality protection, not proof of a usable owner after ban/suspension, nor atomicity of the entire multi-request deletion saga. Broader session revocation, retries/unknown outcomes, deletion failure recovery and all staff lifecycle schedules remain open. Unit tests exercise actual handler response paths with mocks; native loopback Auth/Edge races and SQL isolation tests are distinct evidence. No browser deletion claim, no production verification, no full lifecycle closure.

## Verification receipt

Final run58513a87-beba-4de4-aa63-ed8f010121c0:20 labelled checks, actual independent Auth callers and real candidate Deno handler, plus explicitly separate SQL isolation/invariant checks. Replies200/409, one owner role/account retained. Exact actor audit payloads checked. All146 original public table rows unchanged; metadata restored with only three explicitly allowlisted recreated policy OIDs.33 owned audit rows retained, no audit deletion/data repair. Independent postflight across5 runs confirmed missing accounts were owned deletion targets, all remaining accounts banned, zero access remnants, scopes and zero treasuries retired, candidate objects absent and original role/session functions restored. Focused actual-handler source tests9/9, frozen Deno check, app/tooling types and production build pass. Full regression pending.
