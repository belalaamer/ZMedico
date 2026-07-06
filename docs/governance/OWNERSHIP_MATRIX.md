# Permission Ownership Matrix

Groups map 1:1 to N1 taxonomy. Every group carries eight governance fields.

Legend:
- **Business Owner** — accountable for whether the permission reflects real clinic operations
- **Technical Owner** — accountable for the RLS/frontend implementation
- **Approval Authority** — required chair(s) for C2+ changes
- **Lifecycle** — default lifecycle stage assumption for keys in this group
- **Risk** — Low / Medium / High (blast radius × sensitivity)
- **Regulatory** — HIPAA (clinical PHI), GDPR (PII), PCI-DSS (payments), SOX (financials), None
- **Backward Compat** — window & requirements when changing existing keys
- **Deprecation Strategy** — how keys retire in this group

| Group | Business Owner | Technical Owner | Approval Authority | Lifecycle | Risk | Regulatory | Backward Compat | Deprecation Strategy |
|---|---|---|---|---|---|---|---|---|
| appointments | Head of Clinic Ops | Backend Lead | Business + Technical | Steady-state | Medium | HIPAA/GDPR | 60d dual-write; both `has_role` and `has_permission` paths OK during window | Announce → mark deprecated → 30d passive → retire |
| patients | Head of Clinic Ops | Backend Lead | Business + Technical + DPO | Steady-state | High | HIPAA/GDPR | 90d; requires DPO sign-off | Full quorum; 90d window |
| medical_records | Chief Medical Officer | Backend Lead | Business + Technical + DPO | Steady-state | High | HIPAA | 90d | Full quorum; 90d window |
| dental | Chief Medical Officer | Backend Lead | Business + Technical | New | Medium | HIPAA | 60d | Standard |
| diagnoses | Chief Medical Officer | Backend Lead | Business + Technical + DPO | New | High | HIPAA | 90d | Full quorum |
| procedures | Chief Medical Officer | Backend Lead | Business + Technical | New | Medium | HIPAA | 60d | Standard |
| vitals | Chief Medical Officer | Backend Lead | Business + Technical | Planned | Medium | HIPAA | 60d | Standard |
| prescriptions | Chief Medical Officer | Backend Lead | Business + Technical + DPO | New | High | HIPAA, controlled-substance rules | 90d + audit trail must remain intact | Full quorum; hard freeze during any pharmacy audit |
| treatment_plans | Chief Medical Officer | Backend Lead | Business + Technical | Planned | Medium | HIPAA | 60d | Standard |
| physio | Chief Medical Officer | Backend Lead | Business + Technical | New | Medium | HIPAA | 60d | Standard |
| documents | DPO (co-owner Clinic Ops) | Backend Lead | Business + DPO + Technical | New | High | HIPAA/GDPR (attachments contain PHI/PII) | 90d | Full quorum; log every retirement |
| invoices | Head of Finance | Backend Lead | Finance + Technical | Steady-state | High | SOX-analogue, PCI-DSS-adjacent | 90d; finalized invoices must remain immutable | Full quorum |
| payments | Head of Finance | Backend Lead | Finance + DPO + Technical | New | **Critical** | PCI-DSS | 90d; payment-refund path requires dual approval | Full quorum + written finance memo |
| expenses | Head of Finance | Backend Lead | Finance + Technical | New | High | SOX-analogue | 90d | Full quorum |
| treasury | Head of Finance | Backend Lead | Finance + Technical | Steady-state | High | SOX-analogue | 90d | Full quorum |
| patient_wallet | Head of Finance | Backend Lead | Finance + DPO + Technical | New | High | SOX + consumer-protection | 90d | Full quorum |
| coupons | Head of Marketing | Backend Lead | Finance + Technical | Steady-state | Medium | None | 60d | Standard |
| insurance | Head of Finance | Backend Lead | Finance + Technical | New | High | Payer contracts | 90d | Full quorum |
| loyalty | Head of Marketing | Backend Lead | Finance + Technical | New | Low | None | 30d | Standard |
| inventory | Head of Ops | Backend Lead | Business + Technical | Steady-state | Medium | None | 60d | Standard |
| products | Head of Ops | Backend Lead | Business + Technical | New | Low | None | 30d | Standard |
| purchase_orders | Head of Finance | Backend Lead | Finance + Technical | New | Medium | SOX-analogue | 60d | Standard |
| services | Head of Clinic Ops | Backend Lead | Business + Technical | New | Low | None | 30d | Standard |
| hr | Head of People | Backend Lead | Business + Technical | Steady-state | High | GDPR + labor law | 90d | Full quorum |
| hr_leave | Head of People | Backend Lead | Business + Technical | New | Medium | Labor law | 60d | Standard |
| payroll | Head of People + Head of Finance | Backend Lead | Finance + Business + Technical | New | **Critical** | Tax + SOX + PII | 90d; changes require joint sign-off | Full quorum + payroll-cycle freeze window |
| performance | Head of People | Backend Lead | Business + Technical | New | Medium | Labor law | 60d | Standard |
| attendance | Head of People | Backend Lead | Business + Technical | New | Medium | Labor law | 60d | Standard |
| queue | Head of Clinic Ops | Frontend Lead | Business + Technical | New | Low | None | 30d | Standard |
| communication | DPO + Head of Clinic Ops | Backend Lead | Business + DPO + Technical | New | High | GDPR (marketing consent), TCPA-analogue | 90d; opt-in state must remain intact | Full quorum |
| notifications | Head of Clinic Ops | Frontend Lead | Business + Technical | New | Low | None | 30d | Standard |
| reports | Head of Clinic Ops | Backend Lead | Business + Technical | **Deprecating** | Medium | None | Umbrella — dual-active with `reports_<domain>` for 60d then retire | Announce now; retire after Wave 3H |
| reports_finance | Head of Finance | Backend Lead | Finance + Technical | Steady-state | Medium | SOX-analogue | 60d | Standard |
| reports_hr | Head of People | Backend Lead | Business + Technical | Planned | Medium | GDPR | 60d | Standard |
| reports_inventory | Head of Ops | Backend Lead | Business + Technical | Planned | Low | None | 30d | Standard |
| reports_medical | Chief Medical Officer | Backend Lead | Business + DPO + Technical | Planned | High | HIPAA | 90d | Full quorum |
| reports_operational | Head of Clinic Ops | Backend Lead | Business + Technical | Planned | Low | None | 30d | Standard |
| audit | DPO | Backend Lead | DPO + Technical | New | High | HIPAA/GDPR/SOX | 90d; audit log integrity is non-negotiable | Full quorum; append-only forever |
| settings | Head of Engineering | Backend Lead | Technical (business notified) | Steady-state | High | Depends on setting | 60d | Full quorum |
| saas_billing | CEO / Platform PM | Backend Lead | CEO/PM + Technical | New | High | SOX + PCI-DSS | 90d; tenant-billing keys must never appear in tenant bundles | Full quorum |
