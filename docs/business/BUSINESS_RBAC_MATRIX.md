# ZMedico — Business Authorization Model (Final Business RBAC Matrix)

**Perspective:** Healthcare Operations Consultant + Security Architect. Zero implementation content. Every statement is a business rule, not a technical requirement.
**Purpose:** Define, per role, exactly what each person needs to do their job — no more, no less. This document is the *business* source of truth. All future RLS work (R5 batches) must conform to this matrix; where they diverge, this document wins.
**Governing frames:** HIPAA minimum-necessary standard §164.502(b), PCI-DSS v4 §7 (need-to-know), NIST SP 800-53 AC-5 (Separation of Duties), NIST SP 800-53 AC-6(9) (Least Privilege), ISO 27001 A.9.

Legend used throughout:
- **YES** = full right, tenant-wide.
- **BRANCH** = right limited to the user's assigned branch(es).
- **OWN** = right limited to rows the user personally created / is assigned to.
- **APPROVED** = right requires a second signature (four-eyes).
- **EMERG** = break-glass only, time-boxed, auto-notified, mandatory post-incident review.
- **NO** = must not have.
- **—** = not applicable to this role in any realistic workflow.

---

## Part I — Roles

Roles are grouped by function. Every role has a single job description; overlap = re-scope, not merge.

### 1. Owner (clinic proprietor)
- **Daily:** Reviews KPIs, signs off strategic decisions, approves top-tier expenses, reviews compliance dashboards.
- **Business decisions:** Pricing strategy, opening/closing branches, capital expenditure, senior hires.
- **Must access:** Financial rollups, HR headcount summaries, compliance status, board-level audit summaries.
- **Must never access:** Individual clinical notes (unless also a licensed clinician), individual patient conversations, raw PII exports beyond regulatory necessity.
- **Approval-required operations:** Any single expense > owner-defined threshold (default 10× median monthly opex) still requires DPO co-sign for regulated categories.
- **SoD violations:** Owner MUST NOT be the sole approver on payroll, refunds, or clinical amendments. Owner is an escalation path, not an operator.
- **Fraud risk:** Owner + Cashier in same person = catastrophic; owner + Accountant = ledger tampering risk. Enforce separation.

### 2. Operations Admin
- **Daily:** Manages users, roles, branch configuration, queue configuration, communication templates. Runs day-to-day platform operations.
- **Business decisions:** Who is provisioned, what bundles they receive, non-clinical settings.
- **Must access:** User management, non-clinical settings, notification templates, queue.
- **Must never access:** Clinical records, financial ledgers beyond read summaries, payroll amounts (only headcount).
- **Approval:** Role assignment to Owner-level or Security-Admin-level bundles requires Security Admin co-sign.
- **SoD:** MUST NOT hold Compliance Auditor or Cashier at the same time.

### 3. Security Admin
- **Daily:** Manages permissions catalog, bundles, break-glass grants, security incidents, secret rotation.
- **Business decisions:** Whether to grant elevated bundles, break-glass approvals, revocations.
- **Must access:** authz_* metadata, audit logs (read), user activity logs, security incident register.
- **Must never access:** Clinical content, financial ledger content, payroll amounts.
- **Approval:** Any bundle change touching finance, payroll, prescriptions, or exports needs DPO co-sign.
- **SoD:** MUST NOT be Operations Admin or Compliance Auditor (that would let one person write policy and audit it).

### 4. Compliance Auditor / DPO
- **Daily:** Reads audit logs, investigates anomalies, produces regulatory reports.
- **Business decisions:** Whether an event is a reportable breach; sign-off on C4/C5 permission changes.
- **Must access:** All audit trails, redacted PHI for investigation, export queue.
- **Must never access:** Ability to *mutate* clinical, financial, or authz records — read only.
- **Approval:** All exports of PHI must be logged; auditor cannot self-approve extraction beyond documented investigation.
- **SoD:** Read-only by construction. MUST NOT hold any operational bundle.

### 5. Branch Manager
- **Daily:** Runs one branch — schedules, resolves conflicts, approves branch-level expenses, reviews branch KPIs.
- **Business decisions:** Local staffing, local schedule changes, small expenses within threshold.
- **Must access:** Everything BRANCH-scoped for their branch(es): patients (roster only), appointments, staff schedules, expenses, inventory, invoices (summary), queue.
- **Must never access:** Clinical detail (unless also clinician), other branches, payroll amounts, catalog administration.
- **Approval:** Expenses over branch threshold escalate to Accountant + Owner.
- **SoD:** MUST NOT approve their own expense report or attendance record.

### 6. Receptionist / Front Desk
- **Daily:** Books/reschedules appointments, checks patients in, creates patient records, issues invoices, takes payments, hands out receipts, manages the queue.
- **Business decisions:** Slot allocation, walk-in triage priority (with nurse), payment method acceptance.
- **Must access:** Patient demographic + insurance + wallet balance + appointment history (BRANCH). Invoices/payments they created (OWN) plus BRANCH read for reconciliation.
- **Must never access:** Clinical notes body, prescriptions detail, lab results, payroll, HR, catalog admin, refunds without approval.
- **Approval:** Refunds always. Invoice void always. Fee overrides always.
- **SoD:** Reception + Cashier can co-exist in small clinics BUT daily-close must be signed by a *different* person (Accountant or Branch Manager).

### 7. Doctor
- **Daily:** Consults patients, creates/edits medical records for own patients, writes prescriptions, orders labs/imaging, proposes treatment plans.
- **Business decisions:** Diagnosis, treatment, prescription, referral.
- **Must access:** Full clinical history for assigned patients (OWN + BRANCH-consult context), lab/imaging results ordered, prescription history.
- **Must never access:** Financial ledgers beyond own commission summary, payroll of others, HR files of others, other doctors' patients unless on-call/covering.
- **Approval:** Amending a signed medical record (only via addendum, never overwrite). Controlled-substance prescriptions may require a second clinician co-sign per jurisdiction.
- **SoD:** MUST NOT set their own commission rate or approve their own payroll.
- **Fraud risk:** Prescription abuse — mitigated by prescription audit + dispensing separation.

### 8. Nurse
- **Daily:** Vitals, triage, patient prep, administers medications ordered by doctor, updates nursing notes, manages queue calls.
- **Business decisions:** Triage priority.
- **Must access:** Vitals, current-visit clinical context, active prescriptions (view for administration), medication administration record (write), queue.
- **Must never access:** Diagnosis authorship, prescription creation, financials, HR.
- **Approval:** Administering a high-alert medication requires a second nurse signature.
- **SoD:** MUST NOT dispense from pharmacy stock; that is Pharmacist.

### 9. Physiotherapist
- **Daily:** Physio cases: opens case, runs sessions, reassesses, closes case, writes physio notes.
- **Must access:** Own physio cases and their patients' relevant clinical context (allergies, referral diagnosis).
- **Must never access:** Non-physio clinical notes beyond referral summary, financials, HR.
- **Approval:** Closing a case requires either a completed final assessment or supervisor sign-off.
- **SoD:** MUST NOT bill for their own sessions without receptionist/cashier gate.

### 10. Pharmacist (dispensing) — *currently implicit; recommend making explicit*
- **Daily:** Receives prescriptions, dispenses, updates inventory decrement, counsels patient.
- **Must access:** Prescription queue, medication catalog, inventory (pharmacy sub-scope), dispensing log.
- **Must never access:** Diagnosis authorship, non-pharmacy inventory management, financial approval.
- **Approval:** Substitution beyond formulary; controlled substances (second signature).
- **SoD:** MUST NOT create prescriptions (only Doctor). MUST NOT approve inventory purchase orders (only Purchasing Officer).

### 11. Accountant
- **Daily:** Reconciles invoices/payments, manages treasury, closes days, files expenses, prepares statements.
- **Must access:** Full finance ledger (tenant-wide read; branch-scoped writes if multi-branch), treasury, expenses, payment methods.
- **Must never access:** Clinical content, HR base salaries beyond payroll process, ability to change permissions or roles.
- **Approval:** Journal adjustments over threshold; refunds; day-close reversal.
- **SoD:** Accountant MUST NOT also be Cashier (recording vs custody). Accountant MUST NOT approve their own expense claim.

### 12. HR Officer
- **Daily:** Employee lifecycle — hires, leaves, positions, performance reviews, schedules.
- **Business decisions:** Position assignments, leave approvals within policy.
- **Must access:** Staff profiles, positions, branches assignment, leave, attendance, performance (read + edit workflow), payroll (read summary, not amounts unless HR-Payroll).
- **Must never access:** Clinical records, financial ledger detail, permission catalog.
- **Approval:** Termination, salary changes → Owner + Accountant co-sign.
- **SoD:** HR MUST NOT run payroll AND set salary AND approve raises alone.

### 13. Inventory Officer (branch stock keeper)
- **Daily:** Stock counts, movement, transfers between locations within branch, reconciles alerts.
- **Must access:** Inventory (BRANCH), stock alerts, movement history, products (view).
- **Must never access:** Purchase order approval (Purchasing Officer), supplier onboarding (Purchasing Officer), pricing.
- **Approval:** Stock write-off over threshold → Branch Manager + Accountant.
- **SoD:** MUST NOT approve their own count adjustment.

### 14. Purchasing Officer
- **Daily:** Creates POs, manages suppliers, receives shipments (with Inventory Officer), reconciles supplier invoices.
- **Must access:** Purchase orders, suppliers, products catalog (view + limited edit), inventory (view for planning).
- **Must never access:** Cash/treasury directly, ability to pay suppliers (Accountant), ability to alter received quantities without Inventory Officer.
- **Approval:** PO over threshold → Accountant + Owner. Supplier onboarding → Accountant.
- **SoD:** Creator ≠ Approver ≠ Receiver (three-eyes on procurement).

### 15. Cashier
- **Daily:** Receives payments, issues receipts, closes till, hands cash to treasury.
- **Must access:** Payments (OWN + BRANCH read for shift), payment methods (view), invoices (view for their branch).
- **Must never access:** Refunds without approval, expense creation, invoice void, treasury journal adjustments.
- **Approval:** Refunds always. Overrides always.
- **SoD:** Cashier is *custody*; must not also *record* (Accountant) or *authorise* (Manager). Daily close signed by a different person.

### 16. Lab Technician *(missing role — recommend adding)*
- **Daily:** Runs lab orders, records results, releases results to ordering doctor.
- **Must access:** Lab orders queue, patient identifiers necessary for the sample, results write, own signed results (view).
- **Must never access:** Clinical diagnosis authorship, prescriptions, financial ledger, other patients' unrelated clinical history.
- **Approval:** Critical values require doctor confirmation of receipt before result finalised.
- **SoD:** Cannot order their own lab (obviously).

### 17. Radiologist *(missing distinct role — recommend adding; today folded into Doctor)*
- **Daily:** Reads imaging studies, dictates reports, signs off.
- **Must access:** Imaging queue, patient clinical context sufficient for interpretation, prior imaging.
- **Must never access:** Other specialties' notes beyond referral, financials.
- **Approval:** Critical findings escalation.
- **SoD:** Reading radiologist ≠ ordering doctor for peer-review cases.

### 18. Support (technical helpdesk) *(missing distinct role)*
- **Daily:** Troubleshoots user issues, resets sessions, guides users. Should have *no* data access by default; only impersonation via time-boxed EMERG with user consent.
- **Must access:** User activity metadata (their own tickets), non-PHI system logs.
- **Must never access:** Any PHI, any financial data, any authz mutation.
- **Approval:** Any data-access session requires user consent + auditor visibility.
- **SoD:** Support MUST NEVER also hold Operations Admin.

---

## Part II — Missing / Split / Merge / Ban Recommendations

### Missing roles (to add before R5 B7/B8)
1. **Pharmacist** — currently rolled into "doctor" or "nurse"; separate to enforce prescribe-vs-dispense SoD.
2. **Lab Technician** — currently rolled into nurse; separate for CLIA-analogue trace and result authorship integrity.
3. **Radiologist** — separate specialty read-and-sign flow.
4. **Support (tier-1)** — a zero-data-by-default role for helpdesk staff.
5. **Payroll Officer** — split from HR; running payroll ≠ managing HR files.
6. **Billing Specialist** — split from Cashier when clinic scales past ~30 daily transactions; handles insurance claims and invoice construction distinctly from cash handling.

### Roles to split
- **Doctor** → Doctor + Prescriber-with-controlled-substance-privilege (controlled-substance keys separately gated).
- **Accountant** → Accountant + Chief Accountant (only Chief may reverse day-close).
- **HR** → HR-Operations + Payroll Officer (separates lifecycle from money).

### Roles to merge
- None. Any merge weakens SoD. In small clinics, one *person* may hold multiple roles temporarily — that is a **staffing decision documented in a compensating-control register**, not a role redesign.

### Roles to ban outright
- **"Super Admin" as a daily-use role.** Owner and Security Admin exist; a permanent super-admin identity is a fraud enabler.
- **Shared accounts of any kind** (reception, cashier).

### Toxic role combinations (must be system-refused, not just discouraged)
| Combo | Why |
|---|---|
| Cashier + Accountant | Custody + recording → embezzlement |
| Purchasing + Accountant | Approve PO + pay PO → kickback |
| HR + Payroll | Set salary + run payroll → ghost payroll |
| Doctor + Pharmacist | Prescribe + dispense → controlled-substance abuse |
| Security Admin + Compliance Auditor | Write policy + audit it → cover-up |
| Owner + sole approver of any single-signature workflow | No independent oversight |
| Support + Operations Admin | Helpdesk with prod-write → social-engineering vector |

### Privilege-escalation paths to close
1. Operations Admin granting themselves elevated bundles — must require Security Admin co-sign on any bundle touching finance/clinical/authz.
2. HR editing `user_roles` — HR must never touch authz tables; user-role assignment is an Ops-Admin action gated by Security Admin co-sign for elevated bundles.
3. Break-glass without expiry — never grant an "emergency" bundle without a wall-clock expiry and mandatory review.
4. Export permissions treated as read permissions — always separate `view` from `export`; export is a distinct SoD-relevant action.
5. Bundle inheritance chains > depth 2 — already forbidden by Standards §3.1; enforce in DB.

### Excessive permissions in current model (from N-series docs, cross-checked against workflows)
- Reception currently sees invoice PDFs across branches on some paths — should be BRANCH only.
- Doctor sees other doctors' patient lists tenant-wide via search — should be BRANCH by default with EMERG for on-call.
- Nurse can currently open closed medical records for edit in some flows — should be view-only after doctor sign-off; amendments via addendum only.
- Any role currently holding `settings.*.configure` without Ops-Admin bundle — revoke.

### Missing permissions
- `medical_records.record.amend` (addendum-only, distinct from `edit`).
- `prescriptions.controlled.create` (separate high-risk key).
- `payments.payment.refund` distinct from `payments.payment.edit`.
- `invoices.invoice.void` distinct from `invoices.invoice.delete`.
- `treasury.close.reverse` distinct from `treasury.close.edit`.
- `authz.grant.break_glass` (time-boxed elevation).
- `audit.log.export` distinct from `audit.log.read`.
- `patient.record.emergency_access` (EMERG break-glass on any patient).
- `hr.staff.terminate` (distinct from `hr.staff.edit`).

### Dangerous permissions (must always be APPROVED or EMERG)
- Any `.delete` on clinical, financial, payroll, or authz tables.
- Any `.export` on PHI or PII beyond individual patient's own file.
- Any `.approve` on money > threshold.
- Any authz bundle mutation.
- Break-glass grants.

---

## Part III — Module Matrices

Columns: **View · Create · Edit · Delete · Approve · Cancel · Export · Manage · Configure · Assign · Override · Audit · Emerg**
Values: **YES / BRANCH / OWN / APPROVED / EMERG / NO / —**
"Manage" = curate catalog rows / lifecycle. "Configure" = domain-level settings. "Assign" = attach to a person/entity. "Override" = bypass a business rule (always APPROVED unless stated). "Audit" = read audit trail scoped to the module. "Emerg" = break-glass eligibility.

### Module 1 — Appointments
| Role | V | C | E | D | Appr | Can | Exp | Mng | Cfg | Asg | Ovr | Aud | Emg |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Owner | YES | NO | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | NO |
| Ops Admin | YES | NO | NO | NO | NO | NO | NO | NO | YES | NO | NO | YES | NO |
| Security Admin | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | NO |
| Compliance | YES | NO | NO | NO | NO | NO | APPROVED | NO | NO | NO | NO | YES | NO |
| Branch Mgr | BRANCH | BRANCH | BRANCH | APPROVED | — | BRANCH | BRANCH | NO | BRANCH | BRANCH | APPROVED | BRANCH | NO |
| Reception | BRANCH | BRANCH | BRANCH | APPROVED | — | BRANCH | NO | NO | NO | BRANCH | NO | NO | NO |
| Doctor | OWN+BRANCH | OWN | OWN | APPROVED | — | OWN | NO | NO | NO | OWN | NO | NO | NO |
| Nurse | BRANCH | NO | NO | NO | — | NO | NO | NO | NO | NO | NO | NO | NO |
| Physio | OWN+BRANCH | OWN | OWN | APPROVED | — | OWN | NO | NO | NO | OWN | NO | NO | NO |
| Pharmacist | NO | NO | NO | NO | — | NO | NO | NO | NO | NO | NO | NO | NO |
| Accountant | BRANCH view for billing only | NO | NO | NO | — | NO | NO | NO | NO | NO | NO | NO | NO |
| HR | NO | NO | NO | NO | — | NO | NO | NO | NO | NO | NO | NO | NO |
| Inventory | NO | NO | NO | NO | — | NO | NO | NO | NO | NO | NO | NO | NO |
| Purchasing | NO | NO | NO | NO | — | NO | NO | NO | NO | NO | NO | NO | NO |
| Cashier | BRANCH (own-shift) | NO | NO | NO | — | NO | NO | NO | NO | NO | NO | NO | NO |
| Lab Tech | BRANCH (own orders only) | NO | NO | NO | — | NO | NO | NO | NO | NO | NO | NO | NO |
| Radiologist | BRANCH (own orders only) | NO | NO | NO | — | NO | NO | NO | NO | NO | NO | NO | NO |
| Support | NO | NO | NO | NO | — | NO | NO | NO | NO | NO | NO | NO | NO |

### Module 2 — Patients
| Role | V | C | E | D | Exp | Mng | Cfg | Asg | Ovr | Aud | Emg |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Owner | YES (summary) | NO | NO | NO | APPROVED | NO | NO | NO | NO | YES | NO |
| Ops Admin | NO | NO | NO | NO | NO | NO | YES (list settings) | NO | NO | NO | NO |
| Security Admin | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | NO |
| Compliance | YES | NO | NO | NO | APPROVED | NO | NO | NO | NO | YES | NO |
| Branch Mgr | BRANCH | BRANCH | BRANCH | APPROVED | BRANCH APPROVED | NO | NO | BRANCH | NO | BRANCH | NO |
| Reception | BRANCH | BRANCH | BRANCH (demographics) | APPROVED | NO | NO | NO | BRANCH | NO | NO | NO |
| Doctor | OWN+BRANCH clinical | NO | OWN clinical fields | NO | OWN | NO | NO | NO | NO | NO | EMERG (on-call) |
| Nurse | BRANCH current-visit | NO | BRANCH nursing fields | NO | NO | NO | NO | NO | NO | NO | NO |
| Physio | OWN cases | NO | OWN case fields | NO | NO | NO | NO | NO | NO | NO | NO |
| Pharmacist | BRANCH (name/DOB/allergies) | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| Accountant | BRANCH (billing identity) | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| HR / Payroll / Inventory / Purchasing / Cashier | NO / NO / NO / NO / BRANCH (name for receipt only) | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| Lab Tech | BRANCH (identifiers for own samples) | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| Radiologist | BRANCH (own studies) | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| Support | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |

### Module 3 — Medical Records (incl. Vitals, Diagnoses, Procedures, Dental)
| Role | V | C | E | Amend | D | Exp | Sign | Emg |
|---|---|---|---|---|---|---|---|---|
| Owner | NO | NO | NO | NO | NO | APPROVED (aggregate only) | NO | NO |
| Compliance | YES | NO | NO | NO | NO | APPROVED | NO | NO |
| Branch Mgr | NO | NO | NO | NO | NO | NO | NO | NO |
| Reception | NO | NO | NO | NO | NO | NO | NO | NO |
| Doctor | OWN+covering | OWN | OWN until signed | OWN addendum | NO | OWN | OWN | EMERG |
| Nurse | BRANCH visit-context | Vitals+nursing | Nursing notes pre-sign | NO | NO | NO | NO | NO |
| Physio | OWN case | OWN physio notes | OWN pre-close | Addendum | NO | OWN | OWN | NO |
| Pharmacist | Allergies + active meds | NO | NO | NO | NO | NO | NO | NO |
| Lab Tech / Radiologist | Own orders + relevant context | Own results | Own results pre-sign | Addendum | NO | OWN | OWN | NO |
| All others | NO across the board |

### Module 4 — Pharmacy / Prescriptions / Medications
| Role | V Rx | Create Rx | Edit Rx pre-sign | Cancel Rx | Dispense | Controlled Rx | Formulary Mng | Audit |
|---|---|---|---|---|---|---|---|---|
| Doctor | OWN+covering | OWN | OWN | OWN pre-dispense | NO | OWN (APPROVED, second clinician) | NO | NO |
| Nurse | BRANCH visit | NO | NO | NO | NO (may administer, not dispense) | NO | NO | NO |
| Pharmacist | BRANCH | NO | NO | NO | BRANCH | APPROVED (second pharmacist) | APPROVED | NO |
| Reception | NO | NO | NO | NO | NO | NO | NO | NO |
| Compliance | YES | NO | NO | NO | NO | NO | NO | YES |
| Others | NO |

### Module 5 — Laboratory
| Role | V | Order | Enter Result | Release | Amend | Exp | Cfg | Aud |
|---|---|---|---|---|---|---|---|---|
| Doctor | OWN orders | OWN | NO | Confirm receipt | Addendum via lab | OWN | NO | NO |
| Nurse | BRANCH visit | NO | NO | NO | NO | NO | NO | NO |
| Lab Tech | Own queue | NO | OWN | OWN | Addendum | NO | NO | NO |
| Compliance | YES | NO | NO | NO | NO | APPROVED | NO | YES |
| Others | NO |

### Module 6 — Radiology
Same shape as Lab, with Radiologist replacing Lab Tech for read/report; Doctor orders; addendum-only after sign.

### Module 7 — Physiotherapy
Physio: OWN full lifecycle. Doctor: refers + reads reports. Reception: books sessions BRANCH. All others NO.

### Module 8 — Dentistry
Same as Medical Records but scoped to the dental_chart resource; dental hygienist (if introduced) mirrors Nurse rules with dental-only scope.

### Module 9 — Inventory
| Role | V | Adjust | Transfer | Write-off | Cfg | Aud |
|---|---|---|---|---|---|---|
| Inventory Officer | BRANCH | BRANCH | BRANCH | APPROVED | NO | BRANCH |
| Purchasing Officer | BRANCH view | NO | NO | NO | NO | NO |
| Pharmacist | Pharmacy sub-scope | Pharmacy sub-scope on dispense | NO | APPROVED | NO | NO |
| Branch Mgr | BRANCH | NO | APPROVED | APPROVED | NO | BRANCH |
| Accountant | YES read | NO | NO | Co-sign write-off | NO | YES |
| Others | NO |

### Module 10 — Purchase Orders / Suppliers
| Role | V PO | Create PO | Approve PO | Receive PO | Suppliers Mng | Aud |
|---|---|---|---|---|---|---|
| Purchasing Officer | BRANCH | BRANCH | NO | Co-sign with Inventory | BRANCH edit | NO |
| Accountant | YES | NO | APPROVED | NO | Onboarding APPROVED | YES |
| Owner | YES | NO | APPROVED (over threshold) | NO | Approve onboarding | YES |
| Inventory Officer | BRANCH | NO | NO | Co-sign | NO | NO |
| Others | NO |

### Module 11 — Treasury
| Role | V | Create Tx | Transfer | Close Day | Reverse Close | Cfg | Aud |
|---|---|---|---|---|---|---|---|
| Cashier | BRANCH own-till | BRANCH own-till | NO | Sign own till | NO | NO | NO |
| Accountant | YES | YES | APPROVED | Sign day | APPROVED (Chief Acct only) | NO | YES |
| Branch Mgr | BRANCH | NO | NO | Sign day | NO | NO | BRANCH |
| Owner | YES | NO | APPROVED | NO | APPROVED | NO | YES |
| Others | NO |

### Module 12 — Accounting / Invoices / Payments
| Role | V Inv | Create Inv | Void Inv | V Pay | Take Pay | Refund | Exp | Aud |
|---|---|---|---|---|---|---|---|---|
| Reception | BRANCH | BRANCH | APPROVED | BRANCH (own shift) | BRANCH | APPROVED | NO | NO |
| Cashier | BRANCH | NO | NO | BRANCH (own shift) | BRANCH | APPROVED | NO | NO |
| Accountant | YES | YES | APPROVED | YES | NO (recording only) | APPROVED | YES | YES |
| Branch Mgr | BRANCH | NO | Co-sign void | BRANCH | NO | Co-sign refund | BRANCH | BRANCH |
| Owner | YES | NO | APPROVED | YES | NO | APPROVED | APPROVED | YES |
| Compliance | YES | NO | NO | YES | NO | NO | APPROVED | YES |
| Others | NO |

### Module 13 — Wallet (Patient Credit)
| Role | V | Credit | Debit | Refund to Cash | Aud |
|---|---|---|---|---|---|
| Reception | BRANCH (patient view) | NO | NO | NO | NO |
| Cashier | BRANCH (own shift) | On payment overage | On invoice settle | APPROVED | NO |
| Accountant | YES | APPROVED (goodwill) | APPROVED | APPROVED | YES |
| Others | NO |

### Module 14 — Expenses
| Role | V | Create | Approve | Reject | Exp | Aud |
|---|---|---|---|---|---|---|
| Any staff | OWN | OWN | NO | NO | NO | NO |
| Branch Mgr | BRANCH | BRANCH | Within threshold | BRANCH | NO | BRANCH |
| Accountant | YES | YES | Over threshold co-sign | YES | YES | YES |
| Owner | YES | NO | Highest tier | YES | YES | YES |
| Compliance | YES | NO | NO | NO | APPROVED | YES |

### Module 15 — Payroll
| Role | V amounts | Compute | Adjust | Run | Approve | Exp | Aud |
|---|---|---|---|---|---|---|---|
| HR Ops | Headcount only | NO | NO | NO | NO | NO | NO |
| Payroll Officer | YES | YES | APPROVED (Accountant) | APPROVED (Accountant+Owner) | NO | NO | NO |
| Accountant | YES | NO | Co-sign | Co-sign run | NO | YES | YES |
| Owner | YES | NO | NO | Final sign | Final | APPROVED | YES |
| Doctor / Physio (own commission) | OWN summary | NO | NO | NO | NO | NO | NO |
| Others | NO |

### Module 16 — HR (staff lifecycle)
| Role | V staff | Create | Edit | Terminate | Positions Cfg | Aud |
|---|---|---|---|---|---|---|
| HR Ops | YES | YES | YES (non-salary) | APPROVED (Owner+Accountant) | YES | YES |
| Branch Mgr | BRANCH staff | NO | BRANCH scheduling fields | NO | NO | BRANCH |
| Owner | YES | NO | NO | Final approve | NO | YES |
| Others | NO |

### Module 17 — Attendance
Own: log/view OWN; Branch Mgr: BRANCH view + edit-with-audit; HR: YES for corrections (APPROVED); Payroll consumes read-only.

### Module 18 — Leaves
Requester: OWN create/cancel; Line Mgr: BRANCH approve within policy; HR: YES override APPROVED; Owner: read.

### Module 19 — Reports
- Finance reports: Accountant/Owner YES; Branch Mgr BRANCH; Compliance YES; export APPROVED.
- HR reports: HR YES; Owner YES; export APPROVED.
- Medical reports: aggregated & de-identified for Owner/Compliance; identified for treating Doctor OWN; export APPROVED.
- Inventory / Operational: Branch Mgr BRANCH; Accountant YES; export APPROVED.
- **Umbrella `reports.view` / `reports.export` must be retired** (already N4-flagged).

### Module 20 — Insurance
Accountant + Billing Specialist: manage contracts + claims. Reception: view for eligibility check. Others: NO. Contract create/edit APPROVED by Owner.

### Module 21 — Notifications
Ops Admin: configure templates. Every user: view their own notifications OWN. Sending outbound patient comms: BRANCH-scoped bundle held by Reception + Nurse + Doctor.

### Module 22 — Queue
Reception + Nurse: BRANCH manage. Ops Admin: configure. Others: view own turn only.

### Module 23 — Settings (clinic profile, branches, catalogs, integrations)
Ops Admin: YES for non-clinical. Owner: YES + sign-off on branch open/close. Security Admin: YES for authz-related settings. Compliance: view. Others: NO.

### Module 24 — Audit
Compliance: YES read + APPROVED export. Security Admin: YES read. Owner: YES read of summaries. Everyone else: NO.

### Module 25 — Security (authz catalog, bundles, roles, break-glass grants)
Security Admin: YES (with DPO co-sign on C4/C5). Compliance: read + veto. Owner: read + sign-off on org-wide bundle changes. Ops Admin: YES only for provisioning users into pre-approved bundles. Others: NO.

### Module 26 — API / Integrations *(future)*
Security Admin: manage API keys with scoped bundles + rate limits. Owner: approve integration onboarding. Compliance: audit. Nobody else can create keys.

### Module 27 — System Configuration
Owner + Ops Admin + Security Admin only, split by domain (Ops for operational, Security for authz/secrets, Owner for financial thresholds and org structure).

---

## Part IV — Final Business RBAC Matrix (compact)

Roles ordered by privilege density. Cell values are the coarse action band **{V, C, E, D, A, X, E!}** where:
V=view, C=create, E=edit, D=delete, A=approve, X=export, E!=emergency-only.
Scope suffix in parentheses when not tenant-wide: `(B)`=branch, `(O)`=own.

| Module ↓ / Role → | Owner | OpsAdmin | SecAdmin | Compliance | BranchMgr | Doctor | Nurse | Physio | Pharm | LabTech | Radio | Reception | Cashier | Accountant | HR | Payroll | InventoryOff | Purchasing | Support |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Appointments | V,X | V,cfg | V | V | V(B),C(B),E(B),D(A),cfg(B) | V(O+B),C(O),E(O) | V(B) | V(O+B),C(O),E(O) | — | V(O) | V(O) | V(B),C(B),E(B) | V(B) | V(B) | — | — | — | — | — |
| Patients | V,X(A) | cfg | — | V,X(A) | V(B),C(B),E(B),D(A) | V(O+B clinical),E(O),E! | V(B visit),E(B) | V(O),E(O) | V(B basic) | V(B O) | V(B),C(B),E(B) | V(B name) | V(B billing) | — | — | — | — | — | — |
| Medical Records | — | — | — | V,X(A) | — | V(O+B),C(O),E(O pre-sign),Amend(O),E! | V(B visit),C(nursing) | V(O),C(O),E(O pre-close) | V(allergies) | V(O),C(O),E(O pre-sign) | V(O),C(O),E(O pre-sign) | — | — | — | — | — | — | — | — |
| Prescriptions | — | — | — | V | — | V(O),C(O),E(O),D(O pre-disp),A(controlled) | V(B) | — | V(B),Dispense(B),A(controlled) | — | — | — | — | — | — | — | — | — | — |
| Labs | — | — | — | V,X(A) | — | V(O),C(O) | V(B) | — | — | V(O),C(O),E(O pre-sign) | — | — | — | — | — | — | — | — | — |
| Radiology | — | — | — | V,X(A) | — | V(O),C(O) | V(B) | — | — | — | V(O),C(O),E(O pre-sign) | — | — | — | — | — | — | — | — |
| Physio | — | — | — | V | V(B) | V (referral) | V(B) | V(O),C(O),E(O),D(A) | — | — | — | V(B) | — | — | — | — | — | — | — |
| Inventory | V | — | — | V | V(B),A | — | — | — | V(pharm sub) | — | — | — | — | V,X | — | — | V(B),C(B),E(B),A | V(B) | — |
| POs / Suppliers | V,A | — | — | V | V(B) | — | — | — | — | — | — | — | — | V,A,X | — | — | V(B recv) | V(B),C(B),A | — |
| Treasury | V,A | — | — | V | V(B),A(B) | — | — | — | — | — | — | — | V(B own-till) | V,C,E,A,X | — | — | — | — | — |
| Invoices / Payments | V,A,X(A) | — | — | V,X(A) | V(B),A | — | — | — | — | — | — | V(B),C(B),E(B),Refund(A) | V(B own),Refund(A) | V,C,E,A,X | — | — | — | — | — |
| Wallet | V | — | — | V | V(B) | — | — | — | — | — | — | V(B) | V(B),C(B),E(B) | V,A,X | — | — | — | — | — |
| Expenses | V,A,X | — | — | V,X(A) | V(B),C(B),A(B) | — | — | — | — | — | — | C(O) | C(O) | V,A,X | C(O) | C(O) | C(O) | — |
| Payroll | V,A,X(A) | — | — | V,X(A) | — | V(O commission) | — | V(O commission) | — | — | — | — | — | V,A,X | Headcount | V,C,A(cosign) | — | — | — |
| HR | V | — | — | V | V(B staff) | — | — | — | — | — | — | — | — | — | V,C,E,A,X | V (own scope) | — | — | — |
| Attendance | V | — | — | V | V(B),E(B A) | V(O) | V(O) | V(O) | V(O) | V(O) | V(O) | V(O) | V(O) | — | V,A,X | V(O) | V(O) | V(O) | V(O) |
| Leaves | V | — | — | V | V(B),A(B) | V(O),C(O),Cancel(O) | idem | idem | idem | idem | idem | idem | idem | idem | V,A,X | idem | idem | idem | idem |
| Reports | V,X(A) | — | — | V,X(A) | V(B),X(B A) | V(O med) | — | V(O physio) | — | V(O lab) | V(O rad) | — | — | V,X(A) | V | V(HR agg) | V(B inv) | V(B po) | — |
| Insurance | V,A | — | — | V | V(B) | — | — | — | — | — | — | V(B eligibility) | — | V,C,E,A,X | — | — | — | — | — |
| Notifications | V | cfg,V | — | V | V(B) | V(O),Send | V(O),Send | V(O),Send | V(O),Send | V(O) | V(O) | V(O),Send | V(O) | V(O) | V(O) | V(O) | V(O) | V(O) | V(O) |
| Queue | V | cfg | — | V | V(B),Manage | V(B) | V(B),Manage | V(B) | V(B) | — | — | V(B),Manage | V(B) | — | — | — | — | — | — |
| Settings | V,A | V (non-clinical) | V (authz-related) | V | V(B ops) | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Audit | V (summary) | — | V | V,X(A) | V(B) | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Security / Authz | V,A | Assign pre-approved bundles | V,C,E,A,X (DPO co-sign) | V,veto | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| API / Integrations | A | — | V,C,E,A,X | V | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| System Config | A (org+finance) | V,C,E (ops) | V,C,E (secrets+authz) | V | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Break-Glass | Approve | Request | Approve+Notify | Audit | Request | Request (patient) | Request (patient) | Request (patient) | Request (patient) | Request (patient) | Request (patient) | Request (patient) | — | — | — | — | — | — | — |

---

## Part V — Adoption Instructions

1. This matrix becomes the **business source of truth**. Every remaining R5 batch must be checked cell-by-cell against it during Go/No-Go (Criterion 7 of `R5_EXECUTION_PLAN.md` §8).
2. Any permission the technical catalog currently grants that **contradicts** this matrix must be removed via the Lifecycle Policy (Deprecate → Retire). It must not be silently corrected.
3. Any permission this matrix requires that is **missing** from the technical catalog must be added via the Registry → Bundle → Role → Consumer flow (Standards §7) **before** the corresponding R5 batch merges.
4. Any role listed here that does not yet exist in `app_role` (Pharmacist, Lab Tech, Radiologist, Payroll Officer, Billing Specialist, Support) must be added under Charter §5 Class C2 with bundles bound in the same migration.
5. Toxic combinations in Part II must be enforced by a `user_roles` INSERT trigger that refuses forbidden pairs — this is a security control, not a UX preference.
6. Break-glass is not optional. `authz.grant.break_glass` must exist, be time-boxed, auto-notify DPO + Owner, and require post-incident review before B7 goes live.

*This matrix takes precedence over any prior RBAC document. It is optimised for real healthcare operations, not for implementation convenience. Where operations and implementation disagree, implementation changes.*
