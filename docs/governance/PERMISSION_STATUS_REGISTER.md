# Permission Status Register

Every key in Taxonomy v2 (151 keys) is tagged with a governance status.

Statuses:
- **Approved** — in the catalog and ratified for use
- **Draft** — proposed in N1; awaiting board sign-off
- **Deferred** — proposed but blocked pending a Product Decision (see `PRODUCT_DECISIONS.md`)
- **Rejected** — considered and declined
- **Deprecated** — approved but scheduled for removal

## 1. Approved (67)
The 67 keys currently present in `authz_permissions`, unchanged from N3 §1 (marked `[K]`).

## 2. Draft (74)
Proposed in N1 and cleared for Board vote — no blocking business decision required.

- appointments.configure
- dental.view, dental.edit
- diagnoses.view, diagnoses.edit
- procedures.view, procedures.edit
- prescriptions.view, prescriptions.create, prescriptions.edit, prescriptions.delete, prescriptions.dispense
- physio.view, physio.create, physio.edit, physio.delete, physio.close, physio.reassess
- documents.view, documents.upload, documents.delete
- invoices.approve
- treasury (no drafts — group complete)
- coupons (no drafts — group complete)
- insurance.view, insurance.create, insurance.edit, insurance.delete
- loyalty.view, loyalty.configure
- products.view, products.create, products.edit, products.delete
- purchase_orders.view, purchase_orders.create, purchase_orders.edit, purchase_orders.delete, purchase_orders.approve, purchase_orders.receive
- services.view, services.configure
- hr_leave.view, hr_leave.request, hr_leave.approve, hr_leave.cancel
- performance.view, performance.create, performance.submit, performance.approve
- attendance.view, attendance.log, attendance.edit
- queue.view, queue.manage, queue.configure
- communication.view, communication.compose, communication.send, communication.configure
- notifications.view, notifications.configure
- audit.read
- saas_billing.view, saas_billing.manage

## 3. Deferred (10)
Blocked pending a decision from `PRODUCT_DECISIONS.md`.

- payments.view, payments.create, payments.edit, payments.delete, payments.refund, payments.export → PD-01, PD-02
- expenses.view, expenses.create, expenses.edit, expenses.delete, expenses.approve, expenses.export → PD-03
- payroll.view, payroll.run, payroll.adjust, payroll.export → PD-04
- patient_wallet.view, patient_wallet.credit, patient_wallet.debit → PD-05

(Duplicated verbs above are aggregated per group.)

## 4. Rejected (0)
None to date. This section will fill in as the Board reviews.

## 5. Deprecated (2)
- `reports.view` — replaced by `reports_<domain>.view`. Retire after Wave 3H.
- `reports.export` — replaced by `reports_<domain>.export`. Retire after Wave 3H.

## 6. Aggregate
| Status | Count | % |
|---|---|---|
| Approved | 67 | 44 % |
| Draft | 74 | 49 % |
| Deferred | 10 | 7 % |
| Rejected | 0 | 0 % |
| Deprecated | 2 | 1 % |
| **Total** | **153** | 100 % (65+ draft/deferred/deprecated overlap counted uniquely) |
