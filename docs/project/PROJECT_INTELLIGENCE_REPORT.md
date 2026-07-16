# PROJECT INTELLIGENCE REPORT

Read-only architectural inventory. No code, schema, RLS, Edge Function,
bundle, permission, or documentation outside this file was modified.
Evidence is drawn from the repository as-is on 2026-07-16.

---

## 1. Executive Summary

- **Product**: A multi-branch healthcare practice management platform
  (deployed brand: *Practice Pulse Plus* / `belalaamer.com`). The domain
  surface covers patients, appointments, clinical records, invoicing,
  treasury, inventory, HR/payroll, reports, communication, and
  multi-branch administration. The physiotherapy vertical (`/physio/*`)
  is the deepest specialty, but the platform is being generalized into a
  vendor-neutral clinic OS (see `docs/auth/UNIVERSAL_AUTHORIZATION_TAXONOMY.md`).
- **Current maturity**: **Production (RC2 signed off)**. Evidence:
  `docs/rc2/RC2_PRODUCTION_SIGNOFF.md`,
  `docs/final/FINAL_RELEASE_SIGNOFF.md`,
  `docs/auth/PRODUCTION_ACTIVATION_REPORT.md` (canonical authz activated
  in production). Live at `https://practice-pulse-plus.lovable.app` and
  custom domain `belalaamer.com`. Overall production readiness scored
  84/100 in `docs/sprint5/PRODUCTION_READINESS_REPORT.md`.
- **Technology stack**:
  - Frontend: React 18 + Vite 5 + TypeScript 5, Tailwind v3, shadcn/ui,
    React Router v6, TanStack Query, Sonner toaster, Suspense-based
    route lazy loading.
  - Backend: Lovable Cloud (Supabase) — PostgreSQL, RLS, `SECURITY
    DEFINER` RPCs, Edge Functions (Deno), Storage.
  - Edge Functions: `admin-create-user`, `admin-delete-user`,
    `admin-reset-password`, `admin-export`, `detect-queue-alerts`,
    `enqueue-winback`, `send-reminder` + `_shared/{cors,correlation,sentry}`.
  - Observability: Sentry stubs (frontend + edge), correlation IDs.
  - Testing: Vitest (unit), Playwright (shadow-mode RBAC + smoke),
    CodeQL + Dependabot in CI.
- **Approximate size**:
  - `src/` TS/TSX files: **256** (110 in `src/pages/`).
  - 7 Supabase Edge Functions.
  - ~200 markdown governance/architecture documents under `docs/`.
  - 20 Vitest suites (359 tests) per most recent activation report.
  - Playwright shadow suites for HR, Invoices, Medical, Patients,
    Settings + deep RBAC.
- **Main architectural style**: Client-heavy SPA with a
  Supabase-as-backend BaaS model. Feature-first folder layout under
  `src/pages/<domain>/*`. Authorization is a canonical, bundle-based
  RBAC engine with feature-flag gated runtime and legacy fallback;
  isolation is enforced primarily through Postgres RLS with grants +
  `SECURITY DEFINER` RPCs (see `docs/architecture/AUTHORIZATION_ARCHITECTURE.md`).

---

## 2. Complete Feature Inventory

Legend: **E**=Exists · **C**=Complete · **P**=Partial · **PL**=Placeholder ·
**H**=Hidden · **D**=Disabled. Evidence column cites pages/routes/functions.

### Authentication & Identity
| Feature | Status | Evidence |
|---|---|---|
| Email/password sign-in | E, C | `src/pages/auth/Auth.tsx` |
| Google OAuth | E, P | `docs/BACKEND_AUTHORIZATION_MIGRATION_PLAN.md`, `TD-09` in TD register |
| Password reset flow | E, C | `src/pages/auth/ResetPassword.tsx`, edge `admin-reset-password` |
| Auth callback | E, C | `src/pages/auth/AuthCallback.tsx` |
| Session persistence | E, C | `src/lib/authSessionPersistence.ts` |
| MFA enrollment | Not implemented | TD-08 |
| Anonymous sign-up | Disabled by policy | Cloud rules |

### Users, Roles & Permissions
| Feature | Status | Evidence |
|---|---|---|
| Admin create user | E, C | edge `admin-create-user` + `src/pages/settings/UserManagement.tsx` |
| Admin delete user | E, C | edge `admin-delete-user` |
| Admin reset password | E, C | edge `admin-reset-password` |
| Role assignment (`user_roles`) | E, C | `docs/ROLE_ARCHITECTURE.md`, `useUserRole.ts` |
| Permission bundles (canonical) | E, C | `docs/auth/*`, `authz_bundles`, `v_authz_effective_permissions` |
| Legacy `role_permissions` fallback | E, C | `usePermissions.ts` `loadLegacy()` |
| Role Permissions UI | E, C | `src/pages/settings/RolePermissions.tsx` |
| QA Identities console | E, C (admin-only) | `src/pages/settings/QAIdentities.tsx` |
| Delegated admin | Not implemented | Hardening Review W-04 |

### Patients
| Feature | Status | Evidence |
|---|---|---|
| Patient list | E, C | `src/pages/patients/Patients.tsx` |
| Patient profile | E, C | `PatientProfile.tsx` |
| Dental chart | E, P (physio-focused product) | `PatientDental.tsx` |
| Import/export | Partial (admin export) | edge `admin-export` |

### Appointments / Calendar / Queue
| Feature | Status | Evidence |
|---|---|---|
| Calendar view | E, C | `calendar/CalendarPage.tsx` |
| Appointment detail | E, C | `appointments/AppointmentDetail.tsx` |
| Live queue | E, C | `queue/Queue.tsx` |
| Queue audit / self-audit | E, C | `queue/QueueAudit.tsx`, `QueueSelfAudit.tsx` |
| Queue alerts | E, C | edge `detect-queue-alerts`, `src/lib/queueAlerts.ts` |
| Reminders manual | E, C | `reminders/Reminders.tsx` |
| Scheduled reminders | E, C | `reminders/ScheduledReminders.tsx`, edge `send-reminder` |
| Win-back automation | E, C | edge `enqueue-winback` |

### Medical Records
| Feature | Status | Evidence |
|---|---|---|
| Specialties, Diagnoses, Medications, Procedures catalogs | E, C | `pages/medical/*` |
| Medical records list / editor | E, C | `MedicalRecords.tsx`, `MedicalRecordEditor.tsx` |
| Quick consult | E, C | `QuickConsult.tsx` |
| Consultation dashboard | E, C | `ConsultationDashboard.tsx` |
| Prescriptions + PDF | E, C | `Prescriptions.tsx`, `src/lib/prescriptionPdf.ts` |
| Documents Center | E, C | `DocumentsCenter.tsx` |

### Physio (specialty vertical)
| Feature | Status | Evidence |
|---|---|---|
| Cases, case detail, dashboard, reports, follow-ups | E, C | `pages/physio/*` |

### Invoicing & Payments
| Feature | Status | Evidence |
|---|---|---|
| Invoices list / detail | E, C | `pages/invoices/*` |
| Outstanding debts | E, C | `OutstandingDebts.tsx` |
| Invoice PDF | E, C | `src/lib/invoicePdf.ts` |
| Payments recording | E, C | `payments/Payments.tsx`, `RecordPaymentDialog.tsx` |
| Insurance companies + contracts | E, C | `settings/InsuranceCompanies.tsx`, `InsuranceContracts.tsx`, `src/lib/insuranceContracts.ts` |
| Coupons | E, C | `pages/coupons/Coupons.tsx` |
| Pricing catalog | E, C | `pricing/Pricing.tsx`, `settings/Services.tsx` |
| Payment gateway (Stripe/Paddle) | Not implemented | connectors available but not enabled |

### Treasury & Expenses
| Feature | Status | Evidence |
|---|---|---|
| Treasury ledger | E, C | `treasury/Treasury.tsx` |
| Daily close | E, C | `treasury/DailyClose.tsx` |
| Expenses | E, C | `expenses/Expenses.tsx` |
| Expense self-audit | E, C | `ExpenseSelfAudit.tsx` |

### Inventory
| Feature | Status | Evidence |
|---|---|---|
| Products, categories, suppliers | E, C | `pages/inventory/*` |
| Stock overview | E, C | `StockOverview.tsx` |
| Purchase orders + detail | E, C | `PurchaseOrders.tsx`, `PurchaseOrderDetail.tsx` |
| Low-stock alerts | E, C | `Alerts.tsx` |

### HR
| Feature | Status | Evidence |
|---|---|---|
| Departments, positions | E, C | `hr/Departments.tsx`, `Positions.tsx` |
| Staff list + detail | E, C | `Staff.tsx`, `StaffDetail.tsx` |
| Schedules, attendance, leaves | E, C | corresponding pages |
| Payroll | E, C | `Payroll.tsx` |
| Pending commissions, target bonuses, performance | E, C | corresponding pages |
| GPS attendance dialog | E, C | `components/attendance/GpsCheckDialog.tsx`, `src/lib/geo.ts` |

### Reports
| Feature | Status | Evidence |
|---|---|---|
| Reports dashboard | E, C | `reports/ReportsDashboard.tsx` |
| Financial / Operational / Medical / HR / Inventory | E, C | corresponding pages |
| Scheduled reports | E, P | `ScheduledReports.tsx` (UI present, cron automation TD-14) |
| Doctor commissions / performance | E, C | corresponding pages |
| Export (CSV/PDF) | E, C | `src/lib/reportExport.ts`, `exportGuard.ts` |

### Branches / Multi-branch
| Feature | Status | Evidence |
|---|---|---|
| Branches list | E, C | `branches/Branches.tsx` |
| Branch dashboard | E, C | `BranchDashboard.tsx` |
| Branch context switcher | E, C | `contexts/BranchContext.tsx` |
| Branch schedule | E, C | `src/lib/branchSchedule.ts` |

### Settings (see §6)

### Notifications / Communication
| Feature | Status | Evidence |
|---|---|---|
| Notifications settings | E, C | `settings/NotificationSettings.tsx` |
| Reminders settings | E, C | `RemindersSettings.tsx` |
| Automated communication | E, C | `AutomatedCommunication.tsx` |
| Templates (email/SMS/WhatsApp) | E, C | `Templates.tsx`, `src/lib/whatsapp.ts` |
| Communication hub (consolidated) | E, C | `Communication.tsx` |
| Realtime | E, C | `src/lib/realtime.ts` |

### Marketing
| Feature | Status | Evidence |
|---|---|---|
| Coupons | E, C | `pages/coupons/Coupons.tsx` |
| Win-back campaign | E, C | edge `enqueue-winback` |
| Full campaign builder / segmentation | Not implemented | — |

### Integrations
| Feature | Status | Evidence |
|---|---|---|
| Supabase / Lovable Cloud | E, C | integrations, edge functions |
| WhatsApp send helper | E, P | `src/lib/whatsapp.ts` |
| Google Maps embed | E, C | `components/LocationMap.tsx` |
| Stripe / Paddle | Available but not enabled | connectors |
| Shopify | Available but not enabled | connectors |
| Custom OAuth server | Not enabled | connector |

### Platform Utilities
| Feature | Status | Evidence |
|---|---|---|
| Global search | E, C | `components/search/GlobalSearch.tsx`, `src/lib/globalSearch.ts` |
| i18n (multi-language) | E, C | `contexts/I18nContext.tsx`, `src/lib/i18n.ts` |
| Audit logs | E, C | `settings/AuditLogs.tsx` |
| Backup / export | E, P | `settings/BackupExport.tsx`, TD-14 automation deferred |
| System self-audit | E, C | `system/SystemSelfAudit.tsx`, `src/lib/systemSelfAudit.ts` |
| Error boundary | E, C | `components/ErrorBoundary.tsx` |
| Correlation IDs / Sentry | E, C | `src/lib/observability/*` |

---

## 3. Complete Screen Inventory

All routes from `src/App.tsx`. Permission column is inferred from
`PermissionRoute` (falls back to `moduleForPath()` in
`src/lib/rolePermissions.ts`). "adminOnly" = `<PermissionRoute adminOnly>`.

### Public / Auth
| Route | Purpose | Status | Major components | Permission |
|---|---|---|---|---|
| `/auth` | Sign in / sign up | Complete | `Auth` | Public |
| `/auth/callback` | OAuth callback | Complete | `AuthCallback` | Public |
| `/reset-password` | Password reset | Complete | `ResetPassword` | Public |
| `/pricing` | Public pricing page | Complete | `Pricing` | Public |
| `/trust` | Trust / compliance landing | Complete | `Trust` | Public |

### App shell (ProtectedRoute + AppShell)
| Route | Purpose | Status | Major components | Permission |
|---|---|---|---|---|
| `/` | Home / dashboard | Complete | `Dashboard`, KPIs | Any authenticated |
| `/patients` | Patient list | Complete | table, filters | `patients.view` |
| `/patients/:id` | Patient profile | Complete | tabs, dental chart | `patients.view` |
| `/calendar` | Appointment calendar | Complete | day/week grid | `appointments.view` |
| `/queue` | Live queue | Complete | queue board | `appointments.view` |
| `/queue/audit` | Queue audit | Complete | audit log | `appointments.view` |
| `/queue/self-audit` | Queue self-audit | Complete | admin | adminOnly |
| `/appointments/:appointmentId` | Appointment detail | Complete | detail form | `appointments.view` |
| `/invoices` | Invoices list | Complete | list + filters | `invoices.view` |
| `/invoices/:id` | Invoice detail | Complete | line items, PDF | `invoices.view` |
| `/invoices/outstanding` | Outstanding debts | Complete | aging table | `invoices.view` |
| `/payments` | Payments | Complete | list, RecordPaymentDialog | `invoices.view` |
| `/treasury` | Treasury ledger | Complete | ledger, filters | `treasury.view` |
| `/treasury/daily-close` | Daily close | Complete | reconciliation | `treasury.view` |
| `/expenses` | Expenses | Complete | list/CRUD | `treasury.view` |
| `/expenses/self-audit` | Expense self-audit | Complete | audit | `treasury.view` |
| `/physio` | Physio cases | Complete | list | `medical_records.view` |
| `/physio/dashboard` | Physio dashboard | Complete | charts | `medical_records.view` |
| `/physio/reports` | Physio reports | Complete | reports | `medical_records.view` |
| `/physio/followups` | Physio follow-ups | Complete | list | `medical_records.view` |
| `/physio/:id` | Physio case detail | Complete | detail | `medical_records.view` |
| `/inventory/*` | Products/Categories/Suppliers/Stock/PO/Alerts | Complete | tables + forms | `inventory.view` |
| `/medical/specialties` | Specialties catalog | Complete | list | `medical_records.view` |
| `/medical/diagnoses` | Diagnoses | Complete | list | `medical_records.view` |
| `/medical/medications` | Medications | Complete | list | `medical_records.view` |
| `/medical/procedures` | Procedures | Complete | list | `medical_records.view` |
| `/medical/records` | Records | Complete | list | `medical_records.view` |
| `/medical/records/new` (via editor) | Editor | Complete | editor | `medical_records.edit` |
| `/medical/quick-consult` | Quick consult | Complete | form | `medical_records.create` |
| `/medical/consultation-dashboard` | Consultation dashboard | Complete | charts | `medical_records.view` |
| `/medical/prescriptions` | Prescriptions list | Complete | list | `medical_records.view` |
| `/medical/prescriptions/:id` | Prescription detail | Complete | detail + PDF | `medical_records.view` |
| `/medical/documents` | Documents Center | Complete | uploads | `medical_records.view` |
| `/coupons` | Coupons | Complete | CRUD | `coupons.view` |
| `/reminders`, `/reminders/scheduled` | Reminders | Complete | lists | `appointments.view` |
| `/hr/*` (departments, positions, staff, schedules, attendance, leaves, payroll, pending-commissions, performance, target-bonuses) | HR suite | Complete | tables + forms | `hr.view` |
| `/reports`, `/reports/{financial,operational,medical,hr,inventory,scheduled,commissions,doctor-performance}` | Reports | Complete | charts + export | matching `reports_*` |
| `/branches`, `/branches/dashboard`, `/settings/branches` | Branches | Complete | list, dashboard | `settings.view` |
| `/settings`, `/settings/general` | General settings | Complete | forms | `settings.view` |
| `/settings/{appointments,invoices,payments,services,insurance,insurance-contracts,communication,languages,roles,users,backup,audit,qa}` | Admin settings | Complete | forms | adminOnly |
| `/settings/system` | System info | Complete | info | `settings.view` |
| `/system/self-audit` | System self-audit | Complete | audit | adminOnly |
| `/settings/{notifications,reminders,automated-comm,templates/*}` | Legacy comm routes | Redirect → `/settings/communication` | — | — |
| `/commissions`, `/medical-records`, `/settings/system-info`, `/settings/audit-logs` | Legacy | Redirects | — | — |
| `*` | 404 | Complete | `NotFound` | Public |

Total: **~80 protected routes** + 5 public + 8 backward-compatible redirects.

---

## 4. Dashboard Review

`src/pages/dashboard/Dashboard.tsx` and specialty dashboards
(`physio/PhysioDashboard.tsx`, `branches/BranchDashboard.tsx`,
`reports/ReportsDashboard.tsx`).

- **KPIs present**: today's appointments, queue length, revenue snapshot,
  outstanding debts, low-stock alerts, upcoming reminders (rendered as
  KPI cards on `Dashboard`).
- **Charts**: Reports dashboards use aggregated line/bar/pie widgets
  (client-side aggregation per `PRODUCTION_READINESS_REPORT` §Performance).
- **Widgets**: quick actions (new appointment, new invoice), branch
  switcher (Topbar), global search (Cmd-K).
- **Filters**: branch scope (global via `BranchContext`), date range on
  reports.
- **Missing / partial**:
  - No cross-branch consolidated executive dashboard beyond
    `BranchDashboard`.
  - No personalized/user-specific dashboards.
  - No SLA / alerting dashboards for Sentry (TD-12).
  - No franchise/org-layer roll-up (Hardening Review W-08).

---

## 5. User Management Review

- **Users**: `settings/UserManagement.tsx` + admin edge functions
  (`admin-create-user`, `admin-delete-user`, `admin-reset-password`).
  Admins invite via server-side function (no anonymous sign-ups).
- **Roles**: enum `app_role` — `admin`, `manager`, `doctor`, `nurse`,
  `receptionist`, `accountant`, `hr`, `staff` (`rolePermissions.ts`).
  Stored in `user_roles` (never on profile).
- **Permission matrix**: `docs/RBAC_MATRIX.md`,
  `docs/business/BUSINESS_RBAC_MATRIX.md`,
  `DEFAULT_PERMISSIONS` in `rolePermissions.ts` (legacy fallback), and
  canonical `authz_bundles` + `v_authz_effective_permissions`.
- **Invitations**: admin-created users; Google OAuth invitation flow
  documented but rollout deferred (TD-09).
- **Password reset**: `/reset-password` + edge `admin-reset-password`.
- **Status**: staff status (`active`/`terminated`) enforced in access
  gate inside `usePermissions.ts` (`linked_user_id`, `deleted_at`,
  `status`).
- **Last login**: NOT VERIFIED as a first-class UI field.
- **Audit**: `settings/AuditLogs.tsx`, `queueAudit.ts`,
  `expenseSelfAudit`, `systemSelfAudit`. Coverage is table-level per
  Hardening Review W-07.
- **QA identities**: `settings/QAIdentities.tsx` (admin-only) for
  reproducible shadow-mode Playwright roles.
- **MFA / SSO / SAML**: NOT implemented (TD-08; connectors exist).

---

## 6. Settings Review

Sections rendered by `SettingsLayout` and route table:

| Section | Route | Status | Notes |
|---|---|---|---|
| Clinic profile / General | `/settings/general` | Complete | branding, contact |
| Branches | `/settings/branches`, `/branches` | Complete | multi-branch |
| Appointments | `/settings/appointments` | Complete | admin-only |
| Invoices | `/settings/invoices` | Complete | admin-only |
| Payment methods | `/settings/payments` | Complete | admin-only |
| Services / catalog | `/settings/services` | Complete | admin-only |
| Insurance companies | `/settings/insurance` | Complete | admin-only |
| Insurance contracts | `/settings/insurance-contracts` | Complete | admin-only |
| Communication hub | `/settings/communication` | Complete | tabs: notifications, reminders, automated, email, sms, whatsapp |
| Languages / Localization | `/settings/languages` | Complete | i18n |
| Role permissions | `/settings/roles` | Complete | admin-only |
| User management | `/settings/users` | Complete | admin-only |
| Backup / export | `/settings/backup` | Partial | manual export; automation TD-14 |
| Audit logs | `/settings/audit` | Complete | admin-only |
| System info | `/settings/system` | Complete | version + env |
| QA identities | `/settings/qa` | Complete | admin-only |
| Billing / plan | — | **Not present** | no in-app plan mgmt |
| Security policies (MFA/SSO) | — | **Not present** | TD-08 |
| Custom domain mgmt | — | **Not present** in-app | hosting-side |
| Feature flags UI | — | **Not present** | env-only (`VITE_AUTHZ_CANONICAL`) |

---

## 7. Reports Review

From `src/pages/reports/*` and `src/lib/reportExport.ts`.

| Report | Route | Filters | Charts | Export |
|---|---|---|---|---|
| Reports dashboard | `/reports` | branch, date | KPI cards | — |
| Financial | `/reports/financial` | branch, date range, payment method | bar/line | CSV, PDF |
| Operational | `/reports/operational` | branch, date | bar | CSV, PDF |
| Medical | `/reports/medical` | branch, date, specialty | bar/pie | CSV, PDF |
| HR | `/reports/hr` | branch, date | bar | CSV, PDF |
| Inventory | `/reports/inventory` | branch, category | bar | CSV, PDF |
| Doctor commissions | `/reports/commissions` | branch, doctor, date | table | CSV |
| Doctor performance | `/reports/doctor-performance` | branch, doctor, date | bar | CSV |
| Scheduled reports | `/reports/scheduled` | schedule mgmt | — | UI present; cron TD-14 |

Notes: report aggregation is client-side (SQL views deferred as TD-05,
TD-17); export is CSV/PDF via `reportExport.ts` and `invoicePdf.ts` /
`prescriptionPdf.ts` for artifacts. `exportGuard.ts` enforces the
`.export` permission action.

---

## 8. Notification System

- **Channels**: Email, SMS, WhatsApp — templates managed under
  `/settings/communication` (tabs). Runtime helper: `src/lib/whatsapp.ts`.
- **Reminders**: manual (`/reminders`), scheduled
  (`/reminders/scheduled`), edge `send-reminder`.
- **Queue alerts**: edge `detect-queue-alerts`, client
  `src/lib/queueAlerts.ts`.
- **Win-back campaigns**: edge `enqueue-winback`.
- **Templates**: email, SMS, WhatsApp — CRUD via `Templates.tsx`.
- **Realtime**: `src/lib/realtime.ts` (Supabase Realtime channel).
- **Toaster**: Sonner + shadcn toaster (`components/ui/*`).
- **In-app notifications center**: NOT VERIFIED as a dedicated inbox
  screen (toast-based only).
- **Provider integrations**: SMS/WhatsApp providers are template-driven;
  actual gateway secrets are provisioned via Cloud secrets — provider
  identity NOT VERIFIED from repo.

---

## 9. White-Label Readiness

| Aspect | State |
|---|---|
| Clinic name | Configurable via General Settings |
| Logo | Configurable (branding fields in general settings — NOT VERIFIED end-to-end asset upload path) |
| Brand colors | Global CSS tokens in `src/index.css` — theme is code-level, not per-tenant UI |
| Terminology / labels | i18n dictionary (`src/lib/i18n.ts`); no per-tenant string overrides |
| Custom domain | Hosting-side (`belalaamer.com` in `project_urls`); no in-app UI |
| Email domain | Managed via `email_domain` deferred tools; not exposed in-app |
| SMS / WhatsApp | Templates configurable; sender identity provider-side |
| Feature toggles per tenant | NOT present (env feature flag only) |
| Data isolation per tenant | Currently single-tenant per deploy (see §10) |

Per `docs/auth/PLATFORM_READINESS_SCORE.md`, white-label readiness ≈
**78/100**: strong permission/taxonomy foundation, gaps at UI theming
and per-tenant config store.

---

## 10. Multi-tenant Review

- **Scope model**: The deployed system operates as **single-organization,
  multi-branch**. `BranchContext` provides the active branch to all list
  pages; RLS policies scope reads/writes by `branch_id` and staff
  linkage (`staff_profiles.linked_user_id`).
- **Organization layer**: An `organizations` / franchise concept is
  documented (`docs/SCOPE_OWNERSHIP_MODEL.md`) but not activated as a
  runtime scope in the UI (Hardening Review W-08).
- **Tenant isolation**: Enforced at DB via RLS + `has_role()`
  `SECURITY DEFINER` helpers; no cross-tenant data path exists in the
  Edge Functions inspected.
- **Branch isolation**: All primary tables (`patients`, `appointments`,
  `invoices`, etc.) carry `branch_id`; `BranchContext` + RLS jointly
  scope queries.
- **Cross-branch reporting**: Reports respect branch filter; consolidated
  cross-branch executive views are partial (see §4).
- **Row ownership**: `linked_user_id` (staff), `created_by`, and
  `branch_id` are the primary ownership axes.
- **True multi-tenant SaaS (multi-org per instance)**: NOT enabled.

---

## 11. Authorization Review (Summary only)

- **Roles**: 8 enum values (`admin` … `staff`) stored in `user_roles`.
- **Bundles**: `authz_bundles`, `authz_bundle_implies`,
  `authz_permissions` compose the canonical grant graph
  (`docs/architecture/AUTHORIZATION_ARCHITECTURE.md`,
  `docs/normalization/N1_PERMISSION_TAXONOMY_V2.md`).
- **Permissions**: closed grammar `<domain>.<resource>.<action>`;
  ratified in `docs/wave3d/WAVE3D_AUTHORIZATION_PATTERN_CATALOG.md`.
- **Effective view**: `v_authz_effective_permissions` — canonical read
  source when `VITE_AUTHZ_CANONICAL="true"` (currently ON, per
  `PRODUCTION_ACTIVATION_REPORT.md`).
- **AuthorizationService**: `src/lib/authz/AuthorizationService.ts` +
  `useAuthorization()` — issues decisions, emits telemetry, tagged
  `source="legacy"` at engine level (bundle→map still populated via
  `fetchCanonicalPermissions`).
- **Legacy fallback**: `role_permissions` + `DEFAULT_PERMISSIONS`
  (`rolePermissions.ts`); still wired for transparent failover.
- **Admin bypass**: `isAdmin` short-circuit in `usePermissions.can()`
  and `AuthorizationService`.
- **RLS**: enabled on public tables (spot-verified per Sprint 5 report);
  policies use `has_role()` `SECURITY DEFINER` helper (see `<user-roles>`
  standard).
- **Feature flags**: `src/lib/authz/canonicalFlag.ts` + env
  `VITE_AUTHZ_CANONICAL`; R1 telemetry flag `isR1Enabled()`; per-tab
  localStorage override supported for rollback.
- **Shadow probes**: `src/lib/authz/settingsShadowProbe.ts` +
  Playwright shadow suites (`tests/playwright/*.shadow.spec.ts`) —
  zero-drift required before Phase C.
- **Maturity**: Enterprise Ready with Future Enhancements per
  `docs/auth/AUTHORIZATION_ARCHITECTURE_HARDENING_REVIEW.md`
  (~88/100). Phase B validated; **Phase C (legacy retirement)
  intentionally BLOCKED** pending 30-day zero-drift window.

---

## 12. UI / UX Review (rating 1–10 per module, no redesign)

| Module | UI | UX | Notes |
|---|---:|---:|---|
| Auth | 8 | 8 | Clean shadcn forms, clear errors |
| Dashboard | 7 | 7 | Solid KPIs; density could improve |
| Patients | 8 | 8 | Profile tabs work well |
| Calendar | 7 | 7 | Functional; no drag-resize verified |
| Queue | 8 | 8 | Live board with audit |
| Appointments | 7 | 7 | Detail form dense |
| Medical records | 7 | 7 | Editor complete; catalog UIs uniform |
| Physio (specialty) | 8 | 8 | Deepest polish |
| Invoices | 8 | 7 | Table + PDF strong; edit ergonomics moderate |
| Payments | 7 | 7 | Record dialog OK |
| Treasury / Expenses | 7 | 7 | Ledger + reconciliation clear |
| Inventory | 7 | 7 | Consistent, tables are long (no virtualization TD-16) |
| HR | 7 | 7 | Broad surface; some pages dense |
| Reports | 7 | 6 | Charts fine; filters not saved; export gated |
| Coupons / Marketing | 7 | 7 | Simple CRUD |
| Communication hub | 8 | 8 | Consolidated tabs improved UX |
| Settings | 8 | 8 | Sidebar layout, admin gating clear |
| Branches | 7 | 7 | Switcher + dashboard |
| Global search | 8 | 8 | Cmd-K, cross-domain |
| Mobile (bottom nav) | 7 | 7 | `MobileBottomNav`, `PullToRefresh` present |
| Accessibility | 6 | 6 | shadcn base + Radix; no dedicated audit found |
| Theming / dark mode | 7 | 7 | Semantic tokens in `index.css`; dark mode NOT VERIFIED as user-toggleable |

---

## 13. Technical Debt (existing, from repo)

Direct from `docs/sprint5/TECHNICAL_DEBT_REGISTER.md`,
`docs/rc1/RC1_KNOWN_ISSUES_REGISTER.md`, and
`docs/auth/AUTHORIZATION_ARCHITECTURE_HARDENING_REVIEW.md`.

High:
- TD-01 Server-side pagination missing on top list pages (patients,
  invoices, appointments, HR, inventory).
- TD-02 SECURITY DEFINER audit sweep across 106 functions.

Medium:
- TD-03 React Query adoption for authz + list pages.
- TD-04 127 `(supabase as any)` casts remain.
- TD-05 SQL views for report aggregation (client-side today).
- TD-06 Business-logic unit tests thin (`invoicePdf`, `queueAlerts`,
  `insuranceContracts`).
- TD-07 CSP / strict security headers pending hosting header support.
- TD-08 MFA enrollment UX + enforcement.
- TD-10 Permission consolidation Phases B–D (retire
  `DEFAULT_PERMISSIONS` + `role_permissions` read path). Blocked with
  Phase C.
- TD-12 Sentry dashboards, alert routing, SLO definitions.
- TD-13 Zod runtime validation at ingress.
- TD-14 Retention automation cron per `RETENTION_SPECIFICATION`.
- TD-20 Correlation-ID propagation across all edge functions.

Low:
- TD-09 Google OAuth admin-invite rollout.
- TD-11 Shadow probe retirement post 30-day zero-drift.
- TD-15 Image pipeline (WebP/AVIF).
- TD-16 Table virtualization.
- TD-17 Materialized views for reports.
- TD-18 Docs consolidation (wave3, execution, normalization).
- TD-19 Dependabot triage cadence.

Authorization hardening (Improvement Opportunity, all Post-Phase-C):
W-01 SoD conflict matrix · W-02 Scope-in-key vs `default_scope` · W-03
Ownership rules registry · W-04 Delegated admin · W-05 Time-boxed
grants · W-06 Break-glass workflow · W-07 Audit-log field-level
coverage · W-08 Franchise/org-layer reporting · W-09 White-label
surface · W-10 Resource-hierarchy flatness in `hr.*`/`inventory.*`.

Docs volume flagged as non-blocking maintainability burden
(`DOCS_CONSOLIDATION_PLAN.md`).

---

## 14. Missing Features (do not exist today)

- **Multi-organization (true multi-tenant) mode** — only single-org /
  multi-branch operates.
- **In-app subscription / billing management** (no plan selection,
  invoicing to clinic, or Stripe/Paddle checkout wired to product;
  connectors available but not enabled).
- **MFA enrollment UI**.
- **SSO / SAML self-service** (connector exists; no in-app UI).
- **Delegated admin / scoped admin roles**.
- **Time-boxed / temporary grants** (`valid_from`/`valid_to`).
- **Break-glass emergency-access workflow** (only `isAdmin` bypass).
- **In-app notification inbox** (only toasts + email/SMS/WhatsApp send).
- **Per-tenant theming / white-label UI** (colors, logos via UI store).
- **Marketing campaign builder** beyond coupons + win-back.
- **Patient portal / patient-facing app**.
- **Doctor mobile app** (mobile responsive web only).
- **Telemedicine / video consult**.
- **Lab / imaging integrations (HL7/FHIR/DICOM)**.
- **E-prescribing to external pharmacies**.
- **Insurance eligibility real-time check** (contracts modeled;
  live eligibility API NOT VERIFIED).
- **Automated backup / retention scheduler** (manual export only).
- **Field-level audit / diff viewer**.
- **Cross-branch executive dashboard / franchise roll-up**.
- **Feature-flag admin UI** (env-only today).
- **Public API / webhooks for third parties**.

---

## 15. Overall Product Readiness

Scores are aggregated from repository evidence
(`PRODUCTION_READINESS_REPORT.md`,
`AUTHORIZATION_ARCHITECTURE_HARDENING_REVIEW.md`,
`PLATFORM_READINESS_SCORE.md`, `RC2_PRODUCTION_SIGNOFF.md`) and this
inventory.

| Dimension | Score /100 | Basis |
|---|---:|---|
| Architecture | 87 | Feature-first, canonical authz, RLS-first |
| Security | 84 | RLS + DEFINER + edge JWT; MFA/CSP/definer sweep pending |
| Maintainability | 82 | Consistent layout, high doc volume, `any` casts remain |
| UI | 75 | Consistent shadcn; a11y + virtualization gaps |
| UX | 74 | Coherent flows; report filters + notification inbox gaps |
| SaaS Readiness | 78 | Single-org today; no billing/self-serve |
| White-label Readiness | 78 | Taxonomy ready; per-tenant theming/config missing |
| Enterprise Readiness | 86 | Governance, audit, RBAC strong; SoD/MFA/delegated admin missing |
| **Overall** | **82** | Production-live with well-tracked, non-blocking debt |

**Verdict from existing docs (unchanged here)**: *Enterprise Ready with
Future Enhancements*. Phase C (legacy authorization retirement)
**remains intentionally blocked** pending the 30-day zero-drift
observation window.

---

*End of report. Read-only analysis. No repository state was modified
other than the creation of this single file at
`docs/project/PROJECT_INTELLIGENCE_REPORT.md`.*