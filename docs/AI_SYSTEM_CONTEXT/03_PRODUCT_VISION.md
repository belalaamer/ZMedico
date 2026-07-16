# 03 — Product Vision

## North star
Become the default operating system for small-to-mid healthcare clinics globally, with an authorization and data model strong enough to be re-sold as a white-label or extended via plugins.

## Evolution waves (from `docs/product/SAAS_ROADMAP.md`)
1. Harden current single-clinic experience (done).
2. Multi-branch operations (done — see `branches`, `staff_branches`).
3. Canonical authorization runtime (done — Phase B validated).
4. Legacy authorization retirement (blocked pending observation).
5. Self-serve tenant onboarding (future).
6. Plugin/marketplace architecture (design only — see `docs/product/PLUGIN_ARCHITECTURE.md`).
7. Specialty packs (dental, physio, derma…) as installable modules.
8. HL7/FHIR interop layer (future).
9. Full billing automation & consumption metering (future).

## Guardrails on vision
- Runtime behavior must remain byte-identical during doc/architecture reviews.
- No breaking API changes without a governed lifecycle (`docs/governance/LIFECYCLE_POLICY.md`).
- Vendor-neutral core; specialty behavior belongs in plugins.
