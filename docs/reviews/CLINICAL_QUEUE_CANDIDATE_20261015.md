# Clinical queue release candidate — not approved for Production

## 2026-10-16 combined-source checkpoint (supersedes older pending claims below)

Released main6ef3fc7/250/251/253 merged into isolated candidate. Distinct native receptionist/doctor browser handoff and authorized admin audit acceptance now19/19including cleanup: receptionist does not create a record/change status; doctor one atomic request/no direct legacy writes, one correct encounter/status and reload; protected audit still denied to doctor, both admin readers show authoritative events. No RLS weakened for test success. First browser run timed out without a clinical response; another wrongly expected privileged audit for doctor; failed runs retained, each cleanup verified. No unsupported root-cause attribution.

New254baseline actually allowed banned doctor's old JWT to create a record/status200. Candidate now asserts existing live session before clinical handling;12/12native Auth/HTTP guard regression including cleanup verifies banned/expired/revoked/role-removed denial and valid doctor control.2source contracts added;31focused tests including original branch retry passed. Initial combined fullsuite760passed/1branch-timeout out of761failed; final complete regression/build still required, not replaced by focused retries. Application typecheck/scoped lint passed.

All3migrations now bound lock wait2s/statement30s. Current SHA256 replaces historical list below:

- relationship:d3c6d8fb9a644230aaf3c353de26ef3fda459f2501b92c5b6831588b0202bb44
- handoff+254:94c2e21179fd09a59264d793b4999ea6ee10d18e76ef8a7a333bcb8314ad6860
- audit:bd2815b4e4f891defece0b4bae9931e5773c115cf796a502b6002c847bf676c8

Separate specific Production approval requested; none of these3migrations/client is deployed by this checkpoint. Individual preflight/postflight/rollback review remains mandatory. No financial/provider/portal or all-screen/lifecycle readiness claim.

Scope: ZMED-177/178 appointment/patient/branch relationship, ZMED-179 atomic queue handoff and ZMED-180 server-authored audit. Based on main b4a5ba7334fb57fa0b74b989a0084bba16fac540. No portal/financial/settings or deployment configuration changes.

The three existing migration proposals must be reviewed/applied **individually**, before activating the matching client. Never db push, broad migration replay or migration-history repair. Do not reapply already-released clinical role policy183.

Migration SHA256:

- 20261008190746_enforce_medical_record_appointment_scope.sql: ad85d627948ccda60a1ce58b1788a0a271c561cdef7ff65b4a54743fa32c58eb
- 20261008225753_atomic_queue_consultation_handoff.sql: bb8d759a6c317d62d16af48e6c18c354068d6bedfb503fc2867d3519e9c118f1
- 20261008231710_server_owned_queue_audit.sql: df90870e121fa2e860c53fa7893be19301ed9f49fc255765c83c744ea2c943c9

Verified locally: application/tooling types and2893-module build exit0;29 helper/scope/audit-vocabulary tests pass. Exact-schema audit transaction probe15/15 verifies actor/branch, redaction, failure rollback and branch-transfer isolation. Prior combined local native API acceptance45checks and two separate actual receptionist/doctor browser identities prove receptionist read-only fallback, doctor single atomic encounter/state and reload. Those browser runs used the audit frontend, **not this isolated checkout**.

Initial isolated full suite720passed/8failed,76files. Unchanged branch7/7 and booking3/3 focused retries pass at original timeout. A final separate local full rerun was interrupted under severe host load; it is not a green gate. Preserve these distinctions; await independent CI.

Actual isolated-checkout browser attempt: receptionist authenticated but queue denied. Local runtime subsequently returned503 and database forwarding was interrupted; canonical permission provisioning versus application behavior remains unresolved. No permission/flag change used to force a pass. This acceptance gate remains open.

Fresh Production read-only preflight:38appointments/5medicalrecords/0linked mismatches; simpleFK remains; target RPC and queue-audit function absent. No Production write or live data repair.

Before release: exact current schema/dependency/RLS/ACL and audit-writer contract comparison; bounded lock/statement timeout deployment review and rollback plan; isolated actual doctor/receptionist/audit-reader acceptance; CI terminal success; individually scoped Production approval. AppointmentDetail remains on its pre-existing standalone encounter helper; this candidate does not certify all clinical entry points or lifecycle.

Removing the old unused browser audit writer does not remove the audit feature: the reviewed backend trigger owns durable attribution, both readers share its vocabulary including legacy read events. Never ship that client removal without its verified backend prerequisite.
