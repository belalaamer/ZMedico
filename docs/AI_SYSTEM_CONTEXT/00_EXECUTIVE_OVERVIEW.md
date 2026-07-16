# 00 — Executive Overview

## What this system is
A multi-module **healthcare clinic management platform** (practice management + EMR-lite + revenue cycle + inventory + HR + physiotherapy) built as a **React 18 + Vite 5 + TypeScript** single-page application on top of **Supabase** (Postgres + Auth + Storage + Edge Functions).

Deployed as: `https://practice-pulse-plus.lovable.app` and custom domains `belalaamer.com`, `www.belalaamer.com`.

## Maturity
- **Release state:** RC2 signed off, production active.
- **Authorization:** canonical bundle-based runtime live behind feature flag; legacy grant map retained as fallback. Shadow probes running. **Phase C (legacy retirement) intentionally blocked** until the 30-day observation window closes.
- **Aggregate readiness score:** ~82/100 (see `docs/rc2/RC2_FINAL_REPORT.md`).

## Core capabilities
| Domain | Capabilities |
|---|---|
| Clinical | Patients, appointments, queue, medical records, prescriptions, dental chart, physio cases, vitals |
| Revenue | Invoices, payments, refunds, coupons, treasury, expenses, insurance, patient wallets |
| Inventory | Products, categories, suppliers, purchase orders, stock alerts |
| People | HR, staff profiles, positions, leave, payroll, performance, attendance |
| Comms | Reminders, notifications, WhatsApp/SMS/email templates |
| Ops | Reports, audit logs, branches, tenants, settings |
| Platform | Role/permission catalog, bundles, feature flags, SaaS billing (subscriptions), backups |

## Guardrails (non-negotiable)
1. Never modify: AuthorizationService, `authz_*` tables, bundles, permission catalog, RLS policies, SECURITY DEFINER functions, edge functions, feature flags.
2. Never store role checks on `profiles`; always use `user_roles` + `has_role()`.
3. Every new `public` table needs `GRANT` + `ALTER … ENABLE ROW LEVEL SECURITY` + policies (see `docs/AUTHORIZATION_STANDARDS.md`).
4. Documentation lives in `docs/`; runtime lives in `src/` and `supabase/`.

## Where to start reading
1. `01_PRODUCT_OVERVIEW.md`
2. `05_SYSTEM_ARCHITECTURE.md`
3. `07_AUTHORIZATION_ARCHITECTURE.md`
4. `10_MODULE_GUIDE.md`
5. `31_AI_CONTEXT.md` + `32_AI_SYSTEM_PROMPT.md`
