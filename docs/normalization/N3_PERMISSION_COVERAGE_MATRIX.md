# N3 — Permission Coverage Matrix

**Status:** Read-only. Cross-references N1 taxonomy vs live RLS, frontend scan, and bundles.

Legend:
- **BO** — Business Operation exists (UI/API surface)
- **FE** — Referenced in frontend source
- **BE** — Referenced in edge functions / backend RPCs (heuristic: `has_permission()` calls in `supabase/functions`)
- **RLS** — Referenced in a `pg_policies.qual`/`with_check`
- **B** — Present in ≥1 bundle
- **Roles** — Roles granted the permission via any bundle
- **Status** — `USED` (BO+FE|RLS), `PLANNED` (BO exists, gates missing), `DEAD` (in catalog but no BO/FE/RLS), `NEW` (proposed in N1, not yet in catalog)

## 1. Full Matrix (v2 registry, 151 keys)

### Clinical
| Permission | BO | FE | BE | RLS | B | Roles | Status |
|---|---|---|---|---|---|---|---|
| appointments.view | ✓ | ✓ | – | – | ✓ | admin,accountant,doctor,manager,nurse,receptionist,staff | USED |
| appointments.create | ✓ | – | – | ✓ | ✓ | admin,doctor,manager,nurse,receptionist | USED |
| appointments.edit | ✓ | ✓ | – | ✓ | ✓ | admin,doctor,manager,nurse,receptionist | USED |
| appointments.delete | ✓ | – | – | – | ✓ | admin | PLANNED |
| appointments.export | ✓ | – | – | – | ✓ | admin,manager | PLANNED |
| appointments.configure | ✓ | – | – | – | – | – | NEW |
| patients.view | ✓ | ✓ | – | – | ✓ | admin,accountant,doctor,manager,nurse,receptionist | USED |
| patients.create | ✓ | ✓ | – | ✓ | ✓ | admin,manager,receptionist | USED |
| patients.edit | ✓ | – | – | ✓ | ✓ | admin,manager,receptionist | USED |
| patients.delete | ✓ | ✓ | – | – | ✓ | admin | PLANNED |
| patients.export | ✓ | – | – | – | ✓ | admin,manager | PLANNED |
| medical_records.view | ✓ | ✓ | – | – | ✓ | admin,doctor,manager,nurse | USED |
| medical_records.create/edit/delete/export | ✓ | – | – | – | ✓ | admin,doctor,manager* | PLANNED |
| dental.view / .edit | ✓ | – | – | – | – | – | NEW |
| diagnoses.view / .edit | ✓ | – | – | – | – | – | NEW |
| procedures.view / .edit | ✓ | – | – | – | – | – | NEW |
| vitals.view / .create / .edit / .delete / .export | ✓ | – | – | – | ✓ | admin,doctor,nurse (partial) | PLANNED |
| prescriptions.* (5 keys) | ✓ | – | – | – | – | – | NEW |
| treatment_plans.* (5 keys) | ✓ | – | – | – | ✓ | admin,doctor,accountant,manager,nurse,receptionist (partial) | PLANNED |
| physio.* (6 keys) | ✓ | – | – | – | – | – | NEW |
| documents.* (3 keys) | ✓ | – | – | – | – | – | NEW |

### Finance
| Permission | BO | FE | BE | RLS | B | Roles | Status |
|---|---|---|---|---|---|---|---|
| invoices.view | ✓ | ✓ | – | – | ✓ | admin,accountant,manager,receptionist | USED |
| invoices.create | ✓ | ✓ | – | – | ✓ | admin,accountant,receptionist | USED (FE) |
| invoices.edit | ✓ | – | – | – | ✓ | admin,accountant | PLANNED |
| invoices.delete | ✓ | ✓ | – | – | ✓ | admin | USED (FE) |
| invoices.export | ✓ | – | – | – | ✓ | admin,accountant,manager | PLANNED |
| invoices.approve | ✓ | – | – | – | – | – | NEW |
| payments.* (6 keys) | ✓ | – | – | – | – | – | NEW |
| expenses.* (6 keys) | ✓ | – | – | – | – | – | NEW |
| treasury.view | ✓ | ✓ | – | – | ✓ | admin,accountant,manager | USED |
| treasury.create/edit/delete/export | ✓ | – | – | – | ✓ | admin,accountant (partial) | PLANNED |
| patient_wallet.* (3 keys) | ✓ | – | – | – | – | – | NEW |
| coupons.view | ✓ | ✓ | – | – | ✓ | admin,accountant,manager,receptionist | USED |
| coupons.create/edit/delete/export | ✓ | – | – | – | ✓ | admin,accountant,manager (partial) | PLANNED |
| insurance.* (4 keys) | ✓ | – | – | – | – | – | NEW |
| loyalty.* (2 keys) | ✓ | – | – | – | – | – | NEW |

### Inventory & Procurement
| Permission | BO | FE | BE | RLS | B | Roles | Status |
|---|---|---|---|---|---|---|---|
| inventory.view | ✓ | ✓ | – | – | ✓ | admin,accountant,manager,nurse | USED |
| inventory.create/edit/delete/export | ✓ | – | – | – | ✓ | admin,manager | PLANNED |
| products.* (4 keys) | ✓ | – | – | – | – | – | NEW |
| purchase_orders.* (6 keys) | ✓ | – | – | – | – | – | NEW |
| services.* (2 keys) | ✓ | – | – | – | – | – | NEW |

### HR / Ops
| Permission | BO | FE | BE | RLS | B | Roles | Status |
|---|---|---|---|---|---|---|---|
| hr.view | ✓ | ✓ | – | – | ✓ | admin,hr,manager | USED |
| hr.export | ✓ | ✓ | – | – | ✓ | admin,hr | USED |
| hr.create/edit/delete | ✓ | – | – | – | ✓ | admin,hr | PLANNED |
| hr_leave.* (4 keys) | ✓ | – | – | – | – | – | NEW |
| payroll.* (4 keys) | ✓ | – | – | – | – | – | NEW |
| performance.* (4 keys) | ✓ | – | – | – | – | – | NEW |
| attendance.* (3 keys) | ✓ | – | – | – | – | – | NEW |
| queue.* (3 keys) | ✓ | – | – | – | – | – | NEW |

### Communication
| Permission | BO | FE | BE | RLS | B | Roles | Status |
|---|---|---|---|---|---|---|---|
| communication.* (4 keys) | ✓ | – | – | – | – | – | NEW |
| notifications.* (2 keys) | ✓ | – | – | – | – | – | NEW |

### Reports
| Permission | BO | FE | BE | RLS | B | Roles | Status |
|---|---|---|---|---|---|---|---|
| reports.view | ✓ | ✓ | – | – | ✓ | admin,doctor,hr,manager | USED (umbrella, deprecate — see N4) |
| reports.export | ✓ | – | – | – | ✓ | admin,accountant,manager | PLANNED (deprecate) |
| reports_finance.view / .export | ✓ | ✓ | – | – | ✓ | admin,accountant,manager | USED |
| reports_hr.view / .export | ✓ | – | – | – | ✓ | admin,hr | PLANNED |
| reports_inventory.view / .export | ✓ | – | – | – | ✓ | admin,accountant,manager | PLANNED |
| reports_medical.view / .export | ✓ | – | – | – | ✓ | admin,doctor,manager | PLANNED |
| reports_operational.view / .export | ✓ | – | – | – | ✓ | admin,accountant,doctor,manager | PLANNED |

### Governance
| Permission | BO | FE | BE | RLS | B | Roles | Status |
|---|---|---|---|---|---|---|---|
| settings.view | ✓ | ✓ | – | – | ✓ | admin,manager | USED |
| settings.create | ✓ | – | – | ✓ | ✓ | admin | USED |
| settings.edit | ✓ | ✓ | – | ✓ | ✓ | admin | USED |
| settings.delete | ✓ | – | – | ✓ | ✓ | admin | USED |
| settings.export | ✓ | – | – | ✓ | ✓ | admin | USED (misused on audit tables — see N4) |
| audit.read | ✓ | – | – | – | – | – | NEW (replaces settings.export on audit tables) |
| saas_billing.* (2 keys) | ✓ | – | – | – | – | – | NEW |

## 2. Aggregate

| Status | Count | % of v2 |
|---|---|---|
| USED | 20 | 13 % |
| PLANNED | 47 | 31 % |
| NEW | 84 | 56 % |
| DEAD | 0 | 0 % (see N4 for umbrella dedup) |
| **Total v2** | **151** | 100 % |

- 100 % of USED permissions have at least one bundle grant.
- 0 permissions are held by a role with no business operation (once nurse binding is fixed).
- 47 PLANNED keys await RLS migration (Waves 3E.B/C, 3F, 3G, 3H).
- 84 NEW keys must be inserted before their domain's migration wave.
