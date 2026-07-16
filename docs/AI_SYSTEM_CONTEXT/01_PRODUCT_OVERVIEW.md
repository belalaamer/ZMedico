# 01 — Product Overview

## Purpose
Give small-to-mid healthcare clinics (single or multi-branch) one place to run **front-desk, clinical, billing, inventory, HR, and reporting** operations, without stitching together spreadsheets and disparate SaaS.

## Target users
| Persona | Primary jobs |
|---|---|
| Owner / Admin | Configure clinic, manage staff, view reports, oversee finances |
| Doctor / Practitioner | See queue, run consultation, write prescriptions, review chart |
| Nurse / Assistant | Take vitals, prep patients, manage queue |
| Receptionist | Book appointments, register patients, take payments, print invoices |
| Cashier / Accountant | Reconcile payments, close treasury, manage refunds |
| HR / Ops manager | Manage staff, leave, payroll, performance |
| Inventory manager | Track stock, receive POs, alert low stock |

## Product surfaces
- **Dashboard** — KPIs and shortcuts by role.
- **Calendar / Queue** — real-time booking and flow control.
- **Patient 360** — demographics, history, documents, wallet.
- **Consultation** — vitals → chart → diagnosis → procedure → prescription → invoice.
- **Billing** — invoices, payments, refunds, insurance claims (foundational).
- **Physio** — case-based rehab workflow.
- **Inventory & Procurement** — products, suppliers, POs, stock alerts.
- **HR** — profiles, positions, leave, payroll, performance, attendance.
- **Communications** — reminders, templates, notifications.
- **Reports** — finance, HR, inventory, medical, operational.
- **Settings** — clinic profile, branches, roles, permissions, templates.

## Non-goals (today)
- Full multi-tenant self-serve SaaS (foundations exist under `tenants`, but onboarding is managed).
- Full HL7/FHIR interoperability.
- In-app billing / Stripe subscription checkout (schema exists; UI not consumer-facing).
- Advanced AI clinical decision support.
