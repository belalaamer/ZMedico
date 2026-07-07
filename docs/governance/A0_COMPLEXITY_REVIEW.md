# Sprint A0 — Authorization Complexity Review

**Status:** Documentation only. No SQL, no code, no migrations.
**Question:** Is the current authorization model over-engineered for a
multi-branch clinic on a growth path toward a medium-sized healthcare
organization (not a hospital network, not a SaaS IAM platform)?

---

## 0. Ground truth vs. framing

The brief cites **157 permissions / 28 bundles / 17 roles**. The live
database tells a different story:

| Metric | Brief | Live count | Source |
|---|---|---|---|
| Permission keys | 157 | **67** | `SELECT count(*) FROM authz_permissions` |
| Bundles | 28 | **8** | `SELECT count(*) FROM authz_bundles` — one per role |
| Roles (enum) | 17 | **8** | `pg_enum` on `app_role` — admin, manager, doctor, nurse, receptionist, hr, accountant, staff |

**The framing overstates the live footprint by ~2×.** The 157/28/17
figures come from the aspirational catalogs in `docs/normalization/N1`
and the pattern surveys in `docs/wave3d`, not from what is deployed.
The rest of this review is written against the live model *and* the
implied trajectory of the N-series docs, so recommendations remain
useful either way.

### Live permission taxonomy (67 keys)

11 business domains × 5 verbs (`view`, `create`, `edit`, `delete`,
`export`) = 55, plus 6 report domains × 2 verbs (`view`, `export`) =
12. That's the entire catalog. It is regular, predictable, and small.

### Live role bundles (8)

Every bundle is `bundle.role.<role>` — one 1:1 mapping per role. No
composite bundles ("front-office", "back-office"), no persona
bundles, no environment bundles. The "bundle" abstraction currently
adds one layer of indirection with zero routing value.

---

## 1. Per-subsystem verdict

| Subsystem | Necessary? | Justified by *current* need? | Justified only by *future* scale? | Simplifiable without reducing security? |
|---|---|---|---|---|
| **Roles (8)** | Yes | Yes — clinic personas match real job titles. | No | **Marginally.** `staff` is a null role today; either delete it or repurpose as "authenticated-but-unassigned". |
| **Bundles (8, all 1:1 with roles)** | **No, as currently used.** | No — pure indirection. | Partly — the layer is only worth keeping if composite bundles (e.g. `front_office = receptionist + nurse.view`) actually appear. | **Yes.** Collapse into `role → permissions` directly *or* keep the table and start using it for real composites. Pick one. |
| **Permission catalog (67 keys)** | Yes | Yes — 11 domains × 5 verbs is the minimum honest surface for a clinic (patients, appointments, invoices, inventory, HR, treasury, medical records, etc.). | No | **Modestly.** See §2. Estimated realistic floor is ~52 keys. |
| **Scope model** (`user_has_branch_access_via_*`) | Yes | Yes — multi-branch is the actual product requirement. | No | Not further. The scope helpers are already the minimum needed for tenant-safe RLS. |
| **Ownership model** (`is_tenant_owner`, `created_by`) | Yes | Yes — audit and self-service (edit-own) require it. | No | No — already minimal. |
| **Approval model** (leave requests, target bonuses, PO receive) | Yes | Yes — regulator and audit expectation. | No | No — narrower than industry norm already. |
| **Governance layer** (`docs/governance/*`, PERMISSION_STATUS_REGISTER, IMPLEMENTATION_PRIORITY) | **Partially.** | Only the charter and ownership matrix are load-bearing. | **Mostly future-scale.** Product decision registers, waves, batch trackers = process debt for a 8-role model. | **Yes — collapse to one page.** See §4. |
| **Compliance framework** (S2 checker + Standard v1) | Yes | Yes — prevents regression of the two hotfixes. | No | No — already the leanest form of enforcement (one script + one doc). Keep. |

---

## 2. Permission granularity — where to prune

The current 5-verb split (`view / create / edit / delete / export`)
applied uniformly to every domain is a signature of an unfinished
catalog, not a business requirement. Two concrete simplifications:

1. **Merge `create` + `edit` → `write`** for every domain where the
   UI and RLS treat them identically (all of them today — no domain
   distinguishes create-only from edit-only actors). Savings: 11
   keys.
2. **Drop `export` as a permission axis** for domains that don't
   actually surface an export button (`vitals`, `medical_records`,
   `treatment_plans`, `coupons`, `settings`, `treasury` — six
   domains). Keep `export` only where a real export exists
   (`patients`, `invoices`, `inventory`, `hr`, `appointments`,
   plus the six report domains). Savings: 6 keys.

Combined floor: **67 → 50 keys** (~25% reduction) with no security
loss because every removed key currently maps to the same bundle set
as the surviving key next to it.

The five-key `.approve` verb pattern implied by the N-series docs
should be *rejected*, not adopted. Approval is a workflow attribute
(state transition guarded by role in the trigger), not an
authorization axis. Adding it would inflate the catalog to ~90+ for
no security benefit.

---

## 3. Bundles — merge or delete

The eight bundles are 1:1 with roles today. Two coherent futures:

**Option A — Delete the bundle layer.**
Move `role → permission` directly. `authz_bundles` and
`authz_role_bundles` collapse into a single `role_permissions` table.
`has_permission` becomes a single lookup. Framework code (S2 checker,
Standard v1) is unaffected because it never mentions bundles.

**Option B — Keep bundles, start using them.**
Introduce 3–4 composite bundles that reflect actual workflows:
`front_office` (receptionist + nurse view), `clinical`
(doctor + nurse), `back_office` (accountant + hr view), `admin_ops`
(manager view). Roles then compose bundles instead of enumerating
permissions.

**Recommendation: Option A** for a multi-branch clinic. Composite
personas exist in enterprise IAM because staff routinely wear
multiple hats across departments; in a clinic each staff member has
exactly one job title. The indirection is unpaid rent.

---

## 4. Roles — reduce to 6

| Current | Verdict | Action |
|---|---|---|
| `admin` | Keep | Owner / super-user. |
| `manager` | Keep | Branch manager. |
| `doctor` | Keep | Clinical. |
| `nurse` | Keep | Clinical support. |
| `receptionist` | Keep | Front desk. |
| `accountant` | Keep | Finance. |
| `hr` | **Merge into `manager`** (via a `manages_hr` boolean on
  `staff_profiles`, or keep only if the clinic has a dedicated HR
  hire — most clinics under 30 employees don't). | Optional collapse. |
| `staff` | **Delete** or repurpose as
  "authenticated-but-unassigned" landing role. It grants nothing in
  the current bundle set. | Cleanup. |

Realistic target: **6 roles** (`admin, manager, doctor, nurse,
receptionist, accountant`), with `hr` a conditional 7th if the
clinic actually staffs an HR person.

---

## 5. Long-term maintenance cost

Rough estimate over a 12-month horizon, expressed as governance /
review hours per quarter:

| Area | Current model | Optimized model |
|---|---|---|
| Permission catalog churn (rename, add, retire) | ~6 h/q (67 keys, N-series backlog implies more) | ~3 h/q (~50 keys, no `.approve` axis) |
| Bundle maintenance | ~2 h/q (bookkeeping only — no real composites) | 0 h/q (deleted) |
| Role reviews | ~2 h/q (8 roles, one dormant) | ~1 h/q (6 roles) |
| Governance docs (waves, batches, registers) | ~8 h/q (current cadence) | ~2 h/q (single ARCHITECTURE.md + PERMISSION_STATUS_REGISTER.md) |
| SECURITY DEFINER compliance (S2 checker) | ~1 h/q | ~1 h/q (unchanged — keep) |
| **Total** | **~19 h/q** | **~7 h/q** |

**Estimated maintenance reduction: ~60%.** Risk profile is unchanged
because the removed effort is documentation cadence and empty
abstractions, not security controls.

---

## 6. Scores

| Dimension | Current | Optimized target | Justification |
|---|---|---|---|
| **Complexity** (1 low – 10 high) | **7** | **4** | Live footprint is moderate; N-series aspirations push it toward 9. The optimized model deletes the bundle layer and prunes 25% of keys. |
| **Security** (1 – 10) | **8** | **8** | Standard v1 + S2 checker already provide the load-bearing safeguards. Simplification preserves them. |
| **Maintainability** (1 – 10) | **5** | **8** | Fewer moving parts, one canonical registry, no dormant abstractions. |
| **Enterprise readiness** (1 – 10) | **6** | **5** | Optimizing *reduces* enterprise-IAM readiness (fewer composites, fewer approval hooks) — a deliberate trade for the stated target market. Add composite bundles back the day the product genuinely serves a hospital network. |

---

## 7. Recommended target architecture

```text
              ┌──────────────────────────────────────────┐
              │  6 roles  (admin, manager, doctor,        │
              │            nurse, receptionist, accountant)│
              └──────────────────────────────────────────┘
                                │
                                │ role_permissions
                                ▼
              ┌──────────────────────────────────────────┐
              │  ~50 permission keys                      │
              │  domain.verb    verbs ∈ {view,write,      │
              │                  delete, export}          │
              │  (`write` = create + edit merged;         │
              │   `export` only where UI exposes it)      │
              └──────────────────────────────────────────┘
                                │
                                │ has_permission(auth.uid(), key)
                                ▼
              ┌──────────────────────────────────────────┐
              │  Single authorization gate                │
              │  (Standard v1, enforced by S2 checker)    │
              └──────────────────────────────────────────┘
                                │
                                ▼
              ┌──────────────────────────────────────────┐
              │  RLS + user_has_branch_access_via_*       │
              │  (unchanged — this is the correct scope)  │
              └──────────────────────────────────────────┘
```

Explicitly **kept**: multi-branch scope helpers, ownership model,
approval triggers, SECURITY DEFINER Standard v1, S2 compliance
checker.
Explicitly **dropped**: bundle indirection layer, `.approve` verb
axis (never adopt), dormant `staff` role, wave/batch process docs.
Explicitly **deferred**: composite bundles, environment/tenant
roles, delegated administration. Reintroduce only when a concrete
customer requires them.

---

## 8. Estimated reductions (no security loss)

| Dimension | Current | Optimized | Delta |
|---|---|---|---|
| Roles | 8 | 6 | −25% |
| Bundles | 8 | 0 (layer deleted) | −100% |
| Permission keys | 67 | ~50 | −25% |
| Governance documents actively maintained | ~30 | ~5 | −83% |
| Maintenance effort (h/q) | ~19 | ~7 | −60% |
| Security controls (Standard v1 + RLS + scope helpers) | 3 | 3 | **0 (preserved)** |

---

## 9. Stop condition

Review complete. No SQL, no code, no migration issued. Next actionable
step (out of scope for A0) would be a **Sprint A1 Simplification
Plan** that (a) rewrites the permission catalog to the ~50-key floor,
(b) collapses `authz_bundles`/`authz_role_bundles` into a single
`role_permissions` table, and (c) retires the wave/batch governance
docs into a single `AUTHORIZATION_ARCHITECTURE.md`. That plan must be
ratified before any migration lands, because it is a
breaking-signature change to `has_permission`'s data model.
