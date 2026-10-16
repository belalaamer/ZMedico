# ZMED-260 — Scope portal account state to patient and staff

P1. Frontend-only correction based on main0b1755a. No SQL, Edge, roles, grants or provider activation.

The patient profile's portal card retained temporary credentials after patientId changed and accepted late account/credential responses after navigation. Query errors were displayed as a missing account; thrown requests left loading/busy unresolved. Incomplete function responses could announce success, and a confirmed reset did not refresh mandatory-password status.

Ten initial controlled-dependency component tests failed against published source; the same ten passed after correction. Expanded cases also cover inactive accounts, malformed credentials, preserving confirmed credentials when a follow-up read fails, and ignoring mutation completion after unmount. One expanded test initially queried a background button while the real credential modal intentionally hid it from accessibility; the test now inspects confirmed credentials and closes the modal before querying Retry. This was a test expectation issue, not an application failure.

The keyed inner card clears state on patient/staff changes; lifetime/sequence guards discard stale replies. Explicit read-error UI offers retry. Mutation requests have a synchronous single-flight guard, catch/finally and explicit response/credential validation. Confirmed reset refreshes status, and inactive accounts cannot be reset through this UI. No automatic mutation retry is introduced. Remote outcome can remain unknown after a lost response, and the UI says so.

Verification is component/source scoped. These tests do not prove native Auth/API, real browser patient switching, invitation concurrency or cross-service password-reset recovery. ZMED-063 and the remaining portal lifecycle gates stay open. Final full regression/type/build/hosted results must be checked before release; no deployment is claimed by this document.
