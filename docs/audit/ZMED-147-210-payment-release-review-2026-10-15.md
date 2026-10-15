# ZMED-147/210: reviewed invoice payment guard

Single-function backend change; no client, Edge, balances, business rows, RLS policies or migration-history repair.

The release migration pins the current Production guard and seven neighboring financial definitions, requires the enabled insert trigger/RLS/index and private helper ACL, and fails closed on drift. The payment validation body was tested unchanged against eight exact Production function definitions in owned isolated local QA.

Behavioral evidence:9 configured-role real-trigger batch checks;19 signed-JWT rollback-native batch checks;25 committed two-Auth-session payment race checks;44 committed invoice-edit/refund race/replay checks;26 native accountant/receptionist/doctor/roleless and same-JWT removed-branch checks;9 wrapper/preflight/negative/rollback checks. All passed in their documented scope. Committed synthetic payments were reversed through authorized user APIs, owned treasuries returned to zero, patients/invoices archived, branches inactivated; immutable audit/ledger evidence retained. No Production financial write.

41 related source/unit tests passed locally (including7 new source-only release contracts); these are not substituted for behavioral evidence. Payment/invoice policy hash matches Production:48d5f5cf91e01998ac420ca268d7aa5b. Full local prior suite retained1166passed/2timeout failures, isolated unchanged branch retry7passed; no retroactive green full-suite claim.

Release file SHA256:0818d3a29f2c2eb7294c12857ad4f5ff16200a5becc3b11ca242ca1949a23b04. Old guard definition MD5:e07fa070143bcc2136430ee8222c06c4. Expected new MD5:eb1682f58d3ee2a5c0e1d5b9eade3a3d.

Apply only this individually reviewed migration after approval and fresh preflight. Verify target hash, ACL/owner/config, trigger, unchanged policies/dependencies and advisor delta afterward. Record actual returned migration version; no blanket db push/history synchronization. Do not test by creating Production payments. Do not automatically restore the vulnerable guard on an unexpected result.

Existing security advisor warnings and ZMED-249 historical/source divergence remain separate. No complete browser financial lifecycle, all custom role combinations, load/capacity or whole-system readiness claim.
