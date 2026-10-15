# Clinical queue release candidate — not approved for Production

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
