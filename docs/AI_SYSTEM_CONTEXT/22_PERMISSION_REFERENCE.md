# 22 — Permission Reference

Authoritative catalog: `docs/PERMISSION_CATALOG.md` + rows in `authz_permissions`.

## Grammar
```
<group>.<verb>[.<qualifier>]
```
Groups: `appointments, patients, medical_records, dental, diagnoses, procedures, vitals, prescriptions, treatment_plans, physio, documents, invoices, payments, expenses, treasury, patient_wallet, coupons, insurance, loyalty, inventory, products, purchase_orders, services, hr, hr_leave, payroll, performance, attendance, queue, communication, notifications, reports*, audit, settings, saas_billing`.

Verbs (canonical closed set): `view, create, edit, delete, export, approve, configure` + documented customs (`refund, dispense, run, close, reassess, receive, manage, credit, debit, log, compose, send`).

## How to check
```ts
const { authz } = useAuthorization();
if (authz.can("invoices.create")) { ... }
```
Or declaratively:
```tsx
<Can permission="invoices.create"><Button>New invoice</Button></Can>
```

## How to add a new permission (governed)
1. Governance ticket → owner + steward.
2. Add row to `authz_permissions` via migration.
3. Attach to appropriate bundle(s) via `authz_bundle_permissions`.
4. Update `docs/PERMISSION_CATALOG.md` and `docs/normalization/N1_PERMISSION_TAXONOMY_V2.md`.
5. Add UI gate.
6. Verify with shadow probes before enabling in production.
