# ZMED-207: direct wallet authority protection

## Scope and Production provenance

An individually reviewed, human-approved database-only protection now requires Admin/system_owner authority for direct apply_wallet_tx calls. Existing payment/referral triggers retain their existing permission and branch checks. Trigger depth is trusted server context, not independent business authorization.

- Reviewed source: supabase/migrations/20261010185137_guard_direct_staff_wallet_mutations.sql.
- Source SHA256: 871308e9d43447a681e1526a361818c3cbef1bdc91a31c11f8a16a224e255774.
- Actual Production migration history: 20261010205023, guard_direct_staff_wallet_mutations.
- Pre/post wallet-definition MD5: ce34cf6d3df9b58c89694f52509dac6e → 58bb8ea81f6754d0e7ea484b386403c4.
- Owner, function ACL, SECURITY DEFINER and search_path unchanged; table grants/RLS/policies, wallet callbacks and audit callback unchanged.
- No financial DML, history repair, role grants, account creation, frontend or Edge Function release.

The source filename is not the hosted history timestamp. Do not reapply it to align CLI history, and never automatically push all migrations to Production.

## Verification boundaries

- Local actual receptionist JWT: 46 checks including raw HTTP wallet RPC reproduction/denial, regular triggered payment, Admin manual control and exact restoration. Reproduction checks demonstrate the old bug; they are not fixed-flow passes.
- Local native cancellation authority/branch matrix: 66 checks with the separately unshipped cancellation/reversal prerequisites. No complete Production cancellation certification is inferred.
- Local configured-authenticated referral regression: 17 checks for first reward, second invoice and repeated-status duplicate protection; rollback verified.
- Exact body/metadata prerequisite matrix: 39 checks; combined billing SQL: 62 checks.
- Production post-application: expected body/metadata/ACL/RLS/callbacks/history verified, four configured roleless negative calls deny at the new guard inside rollback. No real Production staff login or payment was performed.
- Security advisors: existing groups/counts unchanged; semantic findings unchanged after excluding observed_at timestamps. Existing notices still require separate investigation, not a clean-security claim.

## Remaining release controls

This commit records the already-applied207 source and its focused source tests. It does not publish196,200,201 or the remaining audit changes. Unshipped196/200 must accept only newly reviewed exact post207 prerequisite fingerprints while preserving the deployed direct-call protection. CI tests must not be described as hosted authenticated financial E2E.
