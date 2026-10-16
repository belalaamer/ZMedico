# ZMED-105 atomic cash transfer — candidate, not deployed

The user delegated the overdraft decision. Reject new transfers above locked source cash; return exact committed replay before checking the depleted balance. This is transfer-specific and does not change global expense/refund policy.

Replace two independent browser ledger writes with one authenticated atomic RPC. Preserve stable request UUID after uncertain response, suppress repeated submissions, disallow pending dismissal, validate currency and two-decimal finite positive amount. Server enforces authoritative live native session, current treasury.tx.write, both branches, currency, periods, deterministic row locks and replay/conflict checks. Never widen accountant/reception permissions.

Verified in isolated loopback QA:

- 18 focused UI/source tests; whole candidate781tests/84files pass.
- 44 native-issued claims/authenticated SQL checks including cleanup. Injected destination-credit failure leaves complete ledger/balance hash unchanged and no orphan debit.
- 14 actual native Auth/HTTP checks including cleanup: two independent sessions submit full-balance transfer simultaneously; exactly one fresh result, one replay and exactly two ledger legs. Exhausted-source replay succeeds; new overdraft, receptionist, conflicting key and removed branch access denied.
- Actual browser-inclusive rerun18/18 including cleanup: native login, Treasury dialog, own source/destination selection,0.25transfer with double click, exactly one atomic request/no direct ledger requests, exactly two persisted legs,99.75/0.25cash, reload without duplicate or uncaught errors. Earlier three harness failures were a strict heading locator matching bothh1/h2Treasury; fixed test tolevel1, no app or permission change. Cleanup/restoration passed each time.
- App/tooling TypeScript, scoped lint and production bundle pass. Existing utility/large-bundle warnings retained. Browser evidence is a specific admin cash-transfer flow, not all finance screens or launch signoff.

All original financial rows and function/ACL/owner contracts restored. Native successful test ledger kept immutable: own zero-balance treasuries soft-deleted after authorized reverse transfer and cleanup expense. Owned roles/memberships/sessions removed, synthetic identities banned. No Production writes.

ZMED-255 shared ledger finite-value guard is a distinct candidate/approval; its use in the local test does not deploy or authorize it. Do not publish this consumer before individual105database approval/application and final hosted checks. Local browser/source/build gates passed. No historical financial repair, broad migration replay or RLS change.
