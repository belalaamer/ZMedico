# Authorization Governance Charter

**Version:** 1.0 (draft — awaiting sign-off)
**Effective:** Upon approval by the Approval Authority Board (§4).
**Owner of this charter:** Head of Engineering (technical) + Head of Clinic Operations (business).

---

## 1. Purpose
Establish accountable, auditable, and reversible control over every authorization change in the clinic platform. The Permission Catalog is the single source of truth; this charter defines *who* may change it, *how*, and *under what evidence*.

## 2. Scope
Applies to:
- `authz_permissions`, `authz_bundles`, `authz_bundle_permissions`, `authz_bundle_implies`, `authz_role_bundles`
- `app_role` enum
- Every RLS policy that calls `has_role()` or `has_permission()`
- Frontend `hasPermission()` call sites and route guards
- Edge-function permission checks

Out of scope: authentication (sign-in/session), RESTRICTIVE branch-isolation predicates (structural), infrastructure counters (Pattern P11).

## 3. Governing Principles
1. **Least privilege** — every permission grant must be justified against a documented Business Operation.
2. **Single source of truth** — RLS and frontend both consult `has_permission()`; no independent role lists.
3. **Reversibility** — every change ships with a rollback script and a Golden Baseline diff.
4. **Traceability** — every permission key carries a Business Owner, Technical Owner, and rationale.
5. **Zero silent drift** — the Authorization Regression Harness must be green before *and* after every merge.
6. **Deprecate, never delete-first** — keys retire through Draft → Approved → Deprecated → Retired.

## 4. Approval Authority Board
| Role | Seat | Decision rights |
|---|---|---|
| **Head of Clinic Operations** | Business chair | Approves new permission families in clinical & ops domains |
| **Head of Finance** | Finance chair | Approves finance, payroll, insurance, wallet, coupons |
| **Data Protection Officer (DPO)** | Compliance chair | Vetoes any change with regulatory impact (HIPAA, GDPR, PCI-DSS analogue) |
| **Head of Engineering** | Technical chair | Approves technical shape (naming, migration plan, rollback) |
| **Product Manager (Platform)** | Standing member | Sequencing & release planning |

Quorum: 3 seats including at least one of Business/Finance and the Technical chair. DPO holds an explicit veto on Risk = HIGH / Regulatory ≠ None.

## 5. Change Classes
| Class | Examples | Path |
|---|---|---|
| **C0 — Naming/description-only** | rename `display_name`, add description | Technical chair alone |
| **C1 — Additive** | new permission key with no bundle grant | Business + Technical chairs |
| **C2 — Grant/binding** | add key to bundle, bind bundle to role | Full quorum |
| **C3 — RLS substitution** | replace `has_role` with `has_permission` | Full quorum + Golden Baseline evidence |
| **C4 — Semantic** | change what a key allows | Full quorum + DPO sign-off |
| **C5 — Deletion/retirement** | drop key or bundle | Full quorum + 30-day deprecation window |

## 6. Required Evidence per Change Class
- **C0/C1**: PR description, taxonomy conformance check.
- **C2**: Coverage matrix delta, downstream RLS impact statement.
- **C3**: Semantic-equivalence proof, Golden Baseline diff (0), rollback script, harness run.
- **C4**: All C3 evidence + DPO memo + user-communication plan.
- **C5**: All C4 evidence + usage report showing zero call sites for ≥30 days.

## 7. Cadence
- **Weekly** Authz standup: catalog delta review, harness health.
- **Monthly** Board review: risk register, deprecation queue, coverage score.
- **Quarterly** Full audit: compare live catalog vs `docs/normalization` snapshot; regenerate Golden Baseline.

## 8. Escalation
Any drift detected by the harness or any C4/C5 change may be triggered as an incident by the DPO or Technical chair. Freeze on merges in affected group until root cause documented and remediated.

## 9. Amendment
This charter is amended by full-quorum vote. Amendments recorded in `docs/governance/CHARTER_HISTORY.md`.
