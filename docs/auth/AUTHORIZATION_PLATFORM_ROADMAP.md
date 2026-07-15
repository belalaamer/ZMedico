# Authorization Platform Roadmap

**Mode:** Documentation only. Every future version below is
**optional** and **non-breaking**. Nothing in this roadmap changes
current runtime behaviour, RLS, SECURITY DEFINER functions, Edge
Functions, feature flags, bundle evaluation, or permission decisions.

---

## Version 1 — Current Canonical Runtime (SHIPPED)

- Canonical `AuthorizationService` with legacy fallback.
- Bundle-based grants via `authz_bundles`,
  `authz_bundle_permissions`, `authz_bundle_implies`,
  `authz_role_bundles`.
- Universal, vendor-neutral permission taxonomy.
- Feature-flag rollout, admin bypass, shadow probes.
- Phase B validation complete; Phase C intentionally blocked.

Status: production default. No further work required for V1.

---

## Version 2 — Dynamic Bundle Management (OPTIONAL, NON-BREAKING)

Goal: let platform administrators create, edit, and compose bundles
through an in-app UI backed by the existing tables.

Scope:
- Admin UI over `authz_bundles`, `authz_bundle_permissions`,
  `authz_bundle_implies`.
- Change audit log via `audit`.
- Shadow-probe gate before publishing bundle edits.

Compatibility: no schema change beyond additive audit columns.
Runtime unchanged. Existing bundles remain valid.

Gate: Phase C complete + 30 clean days on V1.

---

## Version 3 — Tenant-Level Bundle Inheritance (OPTIONAL, NON-BREAKING)

Goal: tenants inherit the platform baseline and layer additive
overrides.

Scope:
- `tenant_id` column on `authz_role_bundles` (nullable = platform
  baseline).
- Effective bundles = baseline ∪ tenant additions.
- No tenant can remove baseline bundles.

Compatibility: additive column; NULL tenant_id = today's semantics.
Existing decisions preserved.

Gate: V2 stable for 60 days.

---

## Version 4 — Conditional Permissions (OPTIONAL, NON-BREAKING)

Goal: permissions that depend on row context (e.g. patient owner,
appointment time window, branch schedule) beyond `default_scope`.

Scope:
- Condition expression attached to bundle grants
  (SQL-safe DSL evaluated in `has_permission()` extension).
- Explicit ADR required — this is a **behavioural** extension.
- Opt-in per permission; unconditioned grants unchanged.

Compatibility: default = no condition = today's semantics. Existing
decisions preserved when no condition is attached.

Gate: dedicated ADR + adversarial security review.

---

## Version 5 — Delegated Administration (OPTIONAL, NON-BREAKING)

Goal: allow scoped administrators (branch manager, department lead)
to manage users and role assignments within their scope, without
platform-admin privilege.

Scope:
- New admin verbs already present (`users.manage`, `roles.manage`).
- Scope-aware delegation via V3 tenant/branch scoping.
- Explicit revocation UI.

Compatibility: no change to platform-admin path; delegates receive
strictly narrower capability sets.

Gate: V3 stable for 60 days.

---

## Version 6 — ABAC Support (OPTIONAL, NON-BREAKING)

Goal: attribute-based decisions layered on top of RBAC (time of day,
patient consent state, treatment plan status, insurance eligibility).

Scope:
- Attribute provider interface.
- Policy evaluated after RBAC pass; can only *narrow*, never widen.
- Opt-in per permission via V4 conditions.

Compatibility: attribute policies default absent -> today's
decisions. Never grants what RBAC denies.

Gate: V4 stable for 90 days + security review.

---

## Version 7 — Policy Engine (OPTIONAL, NON-BREAKING)

Goal: externalize decisions to a policy engine (OPA, Cedar, or
in-house) for cross-service reuse (edge functions, external
services, analytics).

Scope:
- Policy engine deployed alongside canonical runtime.
- Runtime remains authoritative; policy engine mirrors decisions.
- Shadow probes assert engine ≡ runtime for a full observation
  window before any traffic shift.

Compatibility: additive; runtime remains the source of truth until
a subsequent (out-of-scope) cutover ADR.

Gate: V6 stable for 90 days + policy-engine parity harness.

---

## Non-Breaking Guarantee

For every version V2–V7:

- Runtime behaviour with the version disabled = V1.
- Runtime behaviour with the version enabled and no tenant opt-in =
  V1.
- Runtime behaviour with the version enabled and tenant opt-in =
  strictly additive (never removes a grant that V1 would have
  produced) *unless* the tenant explicitly requests a narrowing
  policy (V6/V7) — in which case narrowing is scoped and auditable.

Every version ships with a shadow-probe parity harness proving the
above before enablement.

---

## What This Roadmap Is Not

- Not a commitment. Each version requires its own charter, ADR, and
  business trigger.
- Not sequenced by calendar. Sequence is governance-gated.
- Not a Phase C prerequisite. Phase C proceeds strictly on the
  criteria in `LEGACY_RETIREMENT_CRITERIA.md`, independent of this
  roadmap.
