# Commercial Readiness Report

Read-only assessment of the platform's fitness to be sold as a commercial SaaS to healthcare providers.

## 1. Readiness Scorecard

| Dimension | Score /100 | Status |
|-----------|-----------|--------|
| Core operational feature depth | 90 | Already Excellent |
| Authorization & security posture | 92 | Already Excellent |
| Data isolation / RLS | 90 | Already Excellent |
| Multi-language | 88 | Already Excellent (AR/EN) |
| Multi-currency | 55 | Improvement Opportunity |
| Multi-country tax/regulatory | 45 | Future Enhancement |
| Multi-tenant provisioning (self-serve) | 30 | Future Enhancement |
| Subscription billing (tenant→vendor) | 15 | Future Enhancement |
| White-label / branding | 55 | Improvement Opportunity |
| Custom fields / configurability | 40 | Future Enhancement |
| Workflow / automation engine | 40 | Future Enhancement |
| Reporting engine | 65 | Improvement Opportunity |
| Public API / webhooks | 20 | Future Enhancement |
| Marketplace / plugin architecture | 15 | Future Enhancement |
| Compliance (HIPAA/GDPR) surface | 60 | Improvement Opportunity |
| Onboarding UX (Setup Wizard) | 25 | Future Enhancement |
| Mobile experience | 80 | Already Excellent |
| Observability & audit | 75 | Improvement Opportunity |
| Support & documentation | 85 | Already Excellent (internal docs deep) |
| Pricing & packaging model | N/A | Not yet defined |

**Weighted commercial readiness:** **62 / 100 — Ready for design-partner sales, not yet ready for open self-serve SaaS.**

## 2. Go-to-Market Readiness

| Segment | Readiness | Notes |
|---------|-----------|-------|
| Solo practitioner | High with simplified profile | `Small Clinic Only` toggle set |
| SME single-branch clinic | Ready | Setup wizard + hide advanced modules |
| Multi-branch clinic chain | Ready | Branch model in place |
| Multi-specialty medical center | Partial | Needs custom fields + specialty modules |
| Franchise / group | Not ready | Needs org tier above branches |
| Small hospital | Partial | Needs coding standards, e-sign, controlled meds |
| Radiology center | Partial | Needs PACS/DICOM plugin |
| Laboratory | Partial | Needs LIS bridge, result panels |

## 3. Commercial Blockers vs Non-Blockers

**Blockers to open self-serve SaaS:**
1. Tenant provisioning & lifecycle (create, suspend, delete, export)
2. Subscription billing + plan gating
3. Per-tenant feature flag surface
4. Setup wizard
5. Branding editor
6. Legal surface (BAAs, DPAs, ToS, retention UI)

**Non-blockers (can ship without, add later):**
- Public API, workflow builder, marketplace, coding standards, PACS, LIS bridges.

## 4. Verdict

**Design-Partner Ready.** Suitable for sale via managed onboarding to 1–20 clinics per quarter. Self-serve public SaaS launch requires the six blockers above (see `SAAS_ROADMAP.md`).

No authorization or runtime change is proposed.
