# Domain-Driven Design Review

**Scope:** Read-only architectural assessment of the entire repository through a Domain-Driven Design (DDD) lens.
**Status:** Documentation only. No code, schema, RLS, Edge Function, authorization, or runtime changes.
**Reviewers (role):** Principal Software Architect · DDD Expert · Enterprise SaaS Architect · Healthcare Platform Architect.
**Date:** 2026-07-16.
**Baseline evidence:** `docs/project/PROJECT_INTELLIGENCE_REPORT.md`, `docs/product/*`, `docs/auth/*`, `docs/data/*`, `docs/normalization/*`, `src/**`, `supabase/functions/**`.

> Legend for every recommendation:
> `Already Excellent` · `Improvement Opportunity` · `Future Enhancement` · `Optional Plugin` · `Marketplace Extension` · `Enterprise Only` · `Small Clinic Only`.

---

## 1. Executive Summary

The platform is a production-grade clinic management SaaS built on React/Vite + Supabase, with a canonical bundle-based authorization runtime, a formal data contract catalog (V13 Sprint 3), and a mature module surface (patients, appointments, medical records, invoices, treasury, inventory, HR, reports, settings). From a **DDD standpoint**, the codebase behaves as a **well-organized modular monolith** in which most bounded contexts are recognizable but are expressed primarily as **database aggregates + React feature folders** rather than as explicit domain layers. There is no dedicated `domain/` package, few value objects, and business rules are frequently distributed across React hooks, pages, and edge functions. Nonetheless, the aggregate boundaries baked into the SQL schema and the canonical data model (`docs/data/registry/CANONICAL_DATA_MODEL.md`) are sound and enforce the correct invariants for a healthcare context.

**Aggregate DDD posture:** the platform has *strong implicit* bounded contexts, *weak explicit* domain modeling, and a *very strong* authorization core that already behaves as a first-class context. The largest DDD gaps are: (1) absence of an explicit `Clinical` context distinct from `Patient`, (2) `Settings` acting as a god-context, (3) `Reports/Analytics` reaching into every other context without an anti-corruption layer, and (4) specialty-specific vocabulary (physio sessions, treatment plans) leaking into universal modules.

**Verdict:** **Enterprise Ready with Future Enhancements** from a DDD perspective. No refactor is required to remain production-safe; the recommendations below unlock multi-specialty expansion, marketplace plug-ins, and event-driven scale-out.

---

## 2. Domain Map

Grouped into strategic **subdomain classes**:

### Core Subdomains (competitive differentiation)
- **Clinical Care** — Medical Record, Prescription, Treatment Plan, Vitals, Clinical Documentation.
- **Patient Journey** — Patient identity, Appointment, Queue, Reminder.
- **Revenue Cycle** — Invoice, Payment, Treasury, Coupons, Insurance claims.

### Supporting Subdomains
- **Inventory & Supply** — Inventory items, Purchase Orders, Suppliers, Consumables.
- **People Ops** — HR, Payroll, Attendance, Scheduling, Job Roles.
- **Communication** — Notifications, Reminders, Marketing/win-back, WhatsApp.
- **Reporting & Analytics** — Financial, Medical, Operational, HR, Inventory reports; Dashboard.

### Generic Subdomains (commoditizable)
- **Identity & Access** — Users, Roles, Bundles, Permissions, Sessions.
- **Tenant/Org** — Organization, Branch, Feature flags, Settings.
- **Platform Services** — Audit, Search, System self-audit, Observability, Storage.

### Aspirational Subdomains (not yet contexts)
- **Marketplace / Plugins**, **Workflow Engine**, **Public API**, **AI Agents**, **Insurance Network**.

---

## 3. Bounded Context Map

Textual context map (arrows use standard DDD relationships: `U` upstream, `D` downstream, `S` shared kernel, `ACL` anti-corruption layer, `PL` published language, `OHS` open host service, `CF` conformist).

```
                 ┌─────────────────────┐         ┌────────────────────┐
                 │  Identity & Access  │◀── S ──▶│   Tenant / Org     │
                 │ (users, bundles)    │         │ (branches, flags)  │
                 └──────────┬──────────┘         └─────────┬──────────┘
                            │ U (permissions)              │ U (branch scope)
                            ▼                              ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                       Patient Journey (core)                              │
│   Patient ─▶ Appointment ─▶ Queue ─▶ Reminder ─▶ Visit                    │
└──────┬───────────────────┬─────────────────────────────────────┬──────────┘
       │ PL (patient id)   │ event: appointment.completed        │ ACL
       ▼                   ▼                                     ▼
┌──────────────────┐  ┌────────────────────────┐   ┌──────────────────────────┐
│ Clinical Care    │  │ Revenue Cycle           │  │ Communication            │
│ (records, Rx,    │  │ (invoice, payment,      │  │ (notifications, WA,      │
│  vitals, plans)  │  │  treasury, coupons)     │  │  marketing)              │
└─────┬────────────┘  └───────────┬─────────────┘  └────────────┬─────────────┘
      │ CF (procedure catalog)    │ U (charge codes)             │
      ▼                           ▼                              ▼
┌──────────────────┐  ┌────────────────────────┐   ┌──────────────────────────┐
│ Inventory/Supply │  │ Insurance (partial)    │   │ Reporting & Analytics    │
│ (items, PO,      │  │ contracts, claims       │  │ (ACL over ALL contexts)  │
│  supplier)       │  │                         │  │                          │
└──────────────────┘  └────────────────────────┘   └──────────────────────────┘

┌──────────────────┐   ┌──────────────────────┐   ┌──────────────────────────┐
│ People Ops (HR,  │   │ Platform Services     │  │ Settings (currently god- │
│ payroll, attend, │   │ (audit, search,       │  │ context; should split)   │
│ scheduling)      │   │ observability)        │  │                          │
└──────────────────┘   └──────────────────────┘   └──────────────────────────┘
```

**Notable relationships**
- `Identity & Access` → **published language** (`docs/normalization/N1_PERMISSION_TAXONOMY_V2.md`) consumed by every other context. `Already Excellent`.
- `Reporting & Analytics` is a *conformist* reading directly from other contexts' tables. `Improvement Opportunity` — introduce read-model/ACL views.
- `Settings` is *shared kernel* today but leaks into pricing, RBAC, feature flags, branch config. `Improvement Opportunity` — split into Config, Pricing, Feature Flags.
- `Communication` is invoked from Appointment, Marketing, Reminder — should become **published language + event subscriber**. `Future Enhancement`.

---

## 4. Domain-by-Domain Findings

For each domain, the answers are compressed into a single block. Absent nuance means "no material DDD concern beyond what is called out elsewhere."

### 4.1 Patient
1. Real bounded context: **yes**. 2. Merge: **no**. 3. Split: **no** — but *externalize* clinical data. 4. Belongs: identity, demographics, contacts, patient_code, consent. 5. Does NOT belong: medical history, allergies, chronic diseases (currently on `patients` per `patient.schema.json` — clinical fields should live in `Clinical Care`). 6. Services: patient registration, MRN allocation, merge/de-dup. 7. Violations: patient page performing invoice + medical fetches inline. 8. Leak: allergies field crosses into clinical context. 9. Coupling: tight with Appointment (correct). 10. Independence: from Inventory/HR. 11. Events: `patient.registered`, `patient.merged`. 12. Reusable: **yes** (universal). 13. Specialty-specific: **no**. 14–16. `Already Excellent` for identity, `Improvement Opportunity` to extract clinical fields.

### 4.2 Appointment
Real context (yes); do not merge with Queue but they are **subaggregates** in the same context. Belongs: appointment, slot, status transitions. Does NOT belong: SMS/WhatsApp sending (Communication), invoice generation (Revenue Cycle). Services: scheduling, conflict detection, status machine (`appointmentStatus.ts` is close to a proper domain service). Leaks: reminder logic embedded in appointment hooks. Events: `appointment.booked/cancelled/completed/no_show`. Reusable across specialties. `Improvement Opportunity`.

### 4.3 Medical Record
Real context (yes) — the missing **Clinical Care** aggregate root. Currently split across pages (`/medical`, `/physio`) and lacks an explicit aggregate. Belongs: encounter, note, diagnosis, procedure, attachment. Does NOT belong: pricing, invoice line generation. Services: encounter lifecycle, coding (ICD/CPT-agnostic). Vendor-neutral needs a **Procedure Catalog** value object. `Improvement Opportunity` → `Future Enhancement` for full encounter aggregate.

### 4.4 Prescription
Distinct **subcontext of Clinical Care**, not a top-level context. Aggregate root: `Prescription` with `PrescriptionItem` entities and `Dosage` value objects. Currently rendered via `prescriptionPdf.ts` (presentation) with logic partially in UI. Reusable across specialties (dental Rx, derm Rx, physio home program). `Improvement Opportunity`.

### 4.5 Treatment / Treatment Plan
Currently physio-flavored (`treatment_plans`, sessions). This is a **specialty-adjacent** context. Recommendation: retain generic `CarePlan` aggregate (plan → sessions → outcomes) as core, and expose specialty presets (physio sessions, dental phases, derm regimen) as `Marketplace Extension` / `Optional Plugin`.

### 4.6 Clinical Documentation
Not yet a first-class context — lives inside Medical Record. Should become a **published language** for structured notes (SOAP, DAP, free-text, templated). `Future Enhancement`.

### 4.7 Invoice
Real context (yes). Aggregate root `Invoice` with `InvoiceItem` entities — correctly captured in `invoice.schema.json`. Belongs: pricing lines, discounts, totals, coupon application. Does NOT belong: payment allocation (Payment aggregate). Violations: total recalculation exists in both DB triggers and client — acceptable but must remain server-authoritative. `Already Excellent` structurally.

### 4.8 Payment
Real context, correctly separated from Invoice with FK linkage. Aggregate `Payment` is small (good). Cross-aggregate transaction: `Payment` writes trigger `Invoice` recalculation server-side — correctly encapsulated by server-side triggers (`payment.schema.json` calls this out). `Already Excellent`.

### 4.9 Treasury
Distinct context (cash movements, till reconciliation, expense recording). Should not be merged with Payment. Aggregate: `TreasuryEntry`. Weakness: expenses live half in Treasury and half in a separate `expenses` surface. `Improvement Opportunity` — unify under a **Financial Movements** aggregate with typed entries (payment, refund, expense, transfer).

### 4.10 Expense
Currently a thin surface. Should be a **subaggregate** of Treasury (or a sibling aggregate sharing a `LedgerAccount` value object). `Improvement Opportunity`.

### 4.11 Inventory
Real context. Aggregate `InventoryItem` with `StockMovement` events. Belongs: SKU, batch, expiry, stock levels. Does NOT belong: purchase order approvals (Purchase Orders subcontext). Currently mixed. `Improvement Opportunity`.

### 4.12 Purchase Orders
Subcontext of Inventory/Supply. Should be its own aggregate `PurchaseOrder(header, lines)` referencing `Supplier`. `Future Enhancement`.

### 4.13 Supplier
Value-object-heavy master data. Small aggregate. Reusable. `Already Excellent` as-is.

### 4.14 Communication
Should be an **infrastructure-facing bounded context** with a **published language** of message intents (`AppointmentReminder`, `InvoiceReceipt`, `WinbackOffer`). Today it is coupled directly into appointment/reminder code. `Improvement Opportunity` → later `Optional Plugin` for provider swaps (Twilio, WhatsApp Business, SMTP).

### 4.15 Notification
Overlaps Communication. Recommend: **Notification = in-app**, **Communication = external channels**. Both share a `Message` value object. `Improvement Opportunity`.

### 4.16 Reminder
Subcontext of Communication; scheduling rules belong here. `Future Enhancement`.

### 4.17 Marketing (win-back)
Distinct context (campaigns, segments, offers). Currently minimal (`enqueue-winback`). Natural candidate for `Marketplace Extension` (email/SMS campaigns, referrals, loyalty).

### 4.18 Reports
Cross-context **read model**. Must not own writes. Today it queries base tables directly — a *shared database* smell. `Improvement Opportunity` — introduce reporting views / materialized read models per subject area (finance, medical, HR, ops, inventory) as an ACL.

### 4.19 Analytics
Distinct from Reports (aggregated KPIs, trends, predictions). `Future Enhancement` — becomes prerequisite for AI Agents.

### 4.20 Branch
Value-object-ish tenant scope entity. Correctly used as a *scoping dimension* across contexts. `Already Excellent`.

### 4.21 Organization / Tenant
Currently implicit (single-org deployments, multi-branch). Real multi-tenant SaaS requires `Organization` aggregate above Branch, with subscription, plan, feature entitlements. `Future Enhancement` / `Enterprise Only`.

### 4.22 User / Role / Permission
**Exemplary bounded context.** Canonical bundle model, published language (permission taxonomy V2), feature-flagged runtime, shadow probes, and a governance charter. `Already Excellent`. Recommendation: keep it frozen per current program constraints.

### 4.23 HR
Real context. Aggregates: `Employee`, `JobRole`. Belongs: employment record, compensation, documents. Does NOT belong: clinical scheduling (Scheduling). `Already Excellent` boundary; internal structure can grow.

### 4.24 Payroll
Subcontext of HR. Should be its own aggregate with immutable `PayrollRun` and `PayrollLine`. `Future Enhancement`.

### 4.25 Attendance
Distinct context (check-in/out, geo, shifts). Interacts with Scheduling. Correctly separated today. `Already Excellent`.

### 4.26 Scheduling
Ambiguous: employee shift scheduling vs. appointment scheduling share the word. Rename mental model: **StaffScheduling** vs. **AppointmentScheduling**. `Improvement Opportunity` (ubiquitous language).

### 4.27 Insurance
Partial context (`insuranceContracts.ts`). Should become a full context: `Payer`, `Contract`, `Claim`, `EOB`. `Future Enhancement` / `Enterprise Only`.

### 4.28 Settings
**God-context.** Contains pricing, feature flags, branding, RBAC UI, integrations, queue settings. Split recommendation:
- `TenantConfig` (branding, locale, timezone)
- `Pricing & Catalog` (procedures, prices)
- `FeatureFlags` (already conceptually separate)
- `Integrations` (per provider plugin)
- `AccessGovernance` (bundles/roles admin UI)
`Improvement Opportunity`.

### 4.29 Audit
Cross-cutting **platform service**. Correctly consumed by all contexts via triggers and edge functions. `Already Excellent`.

### 4.30 System (self-audit, observability)
Platform service. `Already Excellent`.

### 4.31 Search
Cross-cutting **read model / infrastructure service** (`globalSearch.ts`). Should be a **conformist** consumer of published entities. Today it queries base tables directly. `Improvement Opportunity`.

### 4.32 Dashboard
Composition surface, not a domain. Should compose published KPIs from Analytics + Reports. `Already Excellent` as UI; do not upgrade to a domain.

---

## 5. Aggregate Review

### Correct aggregate roots
- `Patient`, `Appointment`, `Invoice(+items)`, `Payment`, `InventoryItem`, `Employee`, `Branch`, `User (+profile +roles)`. Codified in `docs/data/registry/CANONICAL_DATA_MODEL.md`. `Already Excellent`.

### Incorrect / missing aggregate roots
- **Missing `Encounter` / `ClinicalVisit`** — the natural root for medical record + vitals + prescription + procedure of a single visit. `Improvement Opportunity`.
- **Missing `CarePlan`** as a vendor-neutral root above physio treatment plans. `Future Enhancement`.
- **Missing `PurchaseOrder`** aggregate as a first-class root. `Future Enhancement`.
- **Missing `Organization/Tenant`** aggregate above Branch. `Enterprise Only`.
- **Missing `Campaign`** aggregate in Marketing. `Marketplace Extension`.

### Oversized aggregates
- `patients` table carries clinical fields (allergies, chronic diseases, blood group). Extract to `PatientClinicalProfile` or `Encounter`. `Improvement Opportunity`.
- `Settings` conceptual aggregate is too broad (see 4.28). `Improvement Opportunity`.

### Cross-aggregate transactions
- `Payment` → `Invoice` recalculation via triggers (documented in `payment.schema.json`). Acceptable because it is server-authoritative and encapsulated.
- `Appointment` completion → potential `Invoice` creation. Today implicit. Should be an **event-driven** flow. `Future Enhancement`.
- `PurchaseOrder` receiving → `InventoryItem` stock update. Same pattern. `Future Enhancement`.

### Aggregate ownership
- Ownership matrix is formal and correct (`docs/data/ownership/DATA_OWNERSHIP_MATRIX.md`). `Already Excellent`.

---

## 6. Entity Review

- **Anemic entities:** most SQL-backed rows are anemic (data only), which is expected in a Supabase-first stack. Domain behavior lives in triggers, edge functions, and React hooks. Acceptable, but a **domain service layer** would centralize invariants. `Improvement Opportunity`.
- **God entities:** `patients` (see above), and the conceptual "settings" entity.
- **Duplicate entities:** `notifications` vs. `reminders` vs. `messages` overlap. `Improvement Opportunity`.
- **Multiple responsibilities:** `appointments` carries queue state + reminder scheduling markers + status transitions. Consider a dedicated `QueueTicket` entity as sibling. `Future Enhancement`.

---

## 7. Value Object Review

Missing value objects that would sharpen the model:
- `Money { amount, currency }` — currently loose numeric + optional currency string.
- `PhoneNumber` (E.164), `Email`, `NationalId`, `MRN/PatientCode`.
- `DateRange`, `TimeSlot`, `Duration`.
- `Address` (structured, i18n-aware).
- `Dosage { amount, unit, frequency, route }` for Prescription items.
- `ProcedureCode { system, code, display }` (vendor-neutral: ICD/CPT/SNOMED/custom).
- `TaxRate`, `DiscountPolicy`, `CouponRule`.
- `PermissionKey` (already a de facto VO via taxonomy).
All: `Improvement Opportunity` (adopt gradually; do not break contracts).

---

## 8. Domain Service Review

**Business logic currently outside a domain layer:**
- UI/pages: invoice total previews, appointment status transitions in components, treatment plan calculations.
- Hooks: `usePermissions.ts` (legitimate — thin runtime facade, keep), plus assorted feature hooks doing more than orchestration.
- Utilities: `appointmentStatus.ts`, `queueSettings.ts`, `insuranceContracts.ts`, `invoicePdf.ts`, `prescriptionPdf.ts` — these are **domain services in disguise**. Promoting them into a `src/domain/<context>/` module (documentation-first) would formalize DDD without behavior change.
- Edge functions: correctly encapsulate cross-aggregate operations (admin user CRUD, exports, reminders, winback) — treat as **application services** in DDD terms. `Already Excellent`.

**Legitimate domain services already present**
- `AuthorizationService` — textbook domain service. `Already Excellent`.
- Server-side SQL functions for invoice recalculation, payment reversal. `Already Excellent`.

---

## 9. Ubiquitous Language Review

**Inconsistent naming**
- `treatment_plans` vs. `care_plan` vs. `session` — three terms for related concepts.
- `reminder` vs. `notification` vs. `message`.
- `receptionist` (role) vs. `front_desk` (docs) — reconciled by RBAC, but glossary should pin one.
- `queue` vs. `waitlist` used interchangeably in UI copy.

**Specialty (non-neutral) terms**
- "Physio session", "physiotherapy report", "rehab plan" — physiotherapy-specific.
- "Treatment plan" is dental/physio-flavored; the neutral term is **Care Plan** or **Plan of Care**.
- "Prescription" is universal; keep.

**Recommendation** — publish a `docs/glossary/UBIQUITOUS_LANGUAGE.md` (out of scope for this read-only review) that maps specialty terms to core vocabulary. `Improvement Opportunity`.

---

## 10. Vendor Neutrality Review

Ability of the current domain to host each specialty **without core changes**:

| Specialty        | Neutral Core Fit | Gap                                                        | Classification            |
|------------------|-----------------:|------------------------------------------------------------|---------------------------|
| Physiotherapy    | High             | Native today (baseline).                                   | `Already Excellent`       |
| Dental           | Medium           | Needs tooth-chart aggregate, phased plan.                  | `Marketplace Extension`   |
| Dermatology      | Medium           | Needs body-map, photo timeline, regimen.                   | `Marketplace Extension`   |
| Plastic Surgery  | Medium           | Consent packs, pre/post photos, staged procedures.         | `Marketplace Extension`   |
| Orthopedics      | High             | Imaging refs, ROM measures — extend Vitals VO.             | `Improvement Opportunity` |
| General Practice | High             | Encounter aggregate + problem list.                        | `Improvement Opportunity` |
| Radiology        | Low              | Order → Study → Report pipeline; PACS integration.         | `Optional Plugin`         |
| Laboratory       | Low              | Order → Specimen → Result → Panel; LIS integration.        | `Optional Plugin`         |
| Nutrition        | High             | Meal plan, macros — new lightweight aggregate.             | `Marketplace Extension`   |
| Psychology       | High             | Session notes, structured assessments, confidentiality.    | `Marketplace Extension`   |
| Cardiology       | Medium           | ECG attachments, risk scores.                              | `Optional Plugin`         |
| Ophthalmology    | Low              | Refraction, IOP, imaging — specialty-heavy.                | `Marketplace Extension`   |

**Universal readiness verdict:** the core (Patient, Appointment, Invoice, Payment, Inventory, HR, RBAC) is genuinely vendor-neutral. The clinical layer is the only specialty-coupled area and is the right seam for plugins/extensions.

---

## 11. Plugin Opportunities

`Optional Plugin` candidates that swap infrastructure without changing the domain:
- **Communication providers:** WhatsApp, SMS, Email, Voice.
- **Payment providers:** Stripe, Paddle, local gateways.
- **Storage providers:** S3-compatible, GCS.
- **AI providers:** transcription, summarization (via Lovable AI Gateway).
- **PACS / LIS integrations** for imaging/lab.
- **Insurance clearinghouses.**

---

## 12. Marketplace Opportunities

`Marketplace Extension` candidates that add domain surface per specialty/vertical:
- Dental chart & phased plans.
- Dermatology body-map & photo timeline.
- Physiotherapy home-exercise programs & wearables.
- Nutrition meal planner.
- Psychology assessment library (PHQ-9, GAD-7, etc.).
- Ophthalmology refraction module.
- Loyalty / referral program.
- Reviews & reputation.
- Patient portal (self-service booking, records access).
- Telehealth (video visit).
- Multi-clinic franchise reporting pack (`Enterprise Only`).

---

## 13. Future SaaS Evolution

| Capability                | Fit in current model | Notes                                                                                | Classification            |
|---------------------------|----------------------|--------------------------------------------------------------------------------------|---------------------------|
| Multi-tenant SaaS         | Partial              | Add `Organization` aggregate above Branch; strict tenant_id enforcement everywhere.  | `Future Enhancement` / `Enterprise Only` |
| Marketplace               | Sketch exists (`docs/product/PLUGIN_ARCHITECTURE.md`) | Needs manifest registry + sandbox tenant.                       | `Future Enhancement`      |
| Plugins                   | Architecturally clear | Provider-swap seams already isolated in edge functions.                              | `Optional Plugin`         |
| Workflow Engine           | Missing              | Needed for referrals, care pathways, approvals.                                      | `Future Enhancement`      |
| Automation                | Partial              | Reminders + winback exist; generalize into rules engine.                             | `Future Enhancement`      |
| Public API                | Missing              | Requires OpenAPI over the contract catalog + OAuth server-to-server.                 | `Future Enhancement` / `Enterprise Only` |
| Event Bus                 | Missing              | Introduce domain events published by triggers/edge functions.                        | `Future Enhancement`      |
| AI Agents                 | Partial              | Lovable AI Gateway present; agents need read-model + tool APIs.                      | `Future Enhancement`      |
| Enterprise Governance     | Strong               | Charter, ownership matrix, lifecycle policy already in place.                        | `Already Excellent`       |

---

## 14. Top 50 Findings

1. Authorization context is a textbook bounded context. `Already Excellent`.
2. Data contracts + ownership matrix formalize aggregates. `Already Excellent`.
3. `patients` aggregate carries clinical fields → extract. `Improvement Opportunity`.
4. Missing `Encounter/ClinicalVisit` aggregate. `Improvement Opportunity`.
5. Missing vendor-neutral `CarePlan` root. `Future Enhancement`.
6. `treatment_plans` naming is specialty-flavored. `Improvement Opportunity`.
7. `Settings` is a god-context. `Improvement Opportunity`.
8. `Reports` reads base tables directly (no ACL). `Improvement Opportunity`.
9. `Search` reads base tables directly. `Improvement Opportunity`.
10. `Notification` / `Reminder` / `Communication` overlap. `Improvement Opportunity`.
11. No explicit domain event bus. `Future Enhancement`.
12. Payment→Invoice recalculation server-authoritative. `Already Excellent`.
13. Appointment status machine partially in UI. `Improvement Opportunity`.
14. `PurchaseOrder` not a first-class aggregate. `Future Enhancement`.
15. `Expense` and `Treasury` overlap ledger concepts. `Improvement Opportunity`.
16. Missing `Money` value object. `Improvement Opportunity`.
17. Missing `Dosage` VO in Prescription. `Improvement Opportunity`.
18. Missing `ProcedureCode` VO (universal coding). `Future Enhancement`.
19. Missing `Address` structured VO. `Improvement Opportunity`.
20. Missing `TimeSlot` VO in Appointment/Scheduling. `Improvement Opportunity`.
21. Missing `Organization/Tenant` aggregate. `Enterprise Only`.
22. Branch is a solid scope dimension. `Already Excellent`.
23. Edge functions act as application services. `Already Excellent`.
24. SECURITY DEFINER RPCs enforce invariants server-side. `Already Excellent`.
25. RLS aligns with aggregate ownership. `Already Excellent`.
26. HR/Payroll boundary correct; Payroll aggregate to formalize. `Future Enhancement`.
27. Attendance correctly separated from Scheduling. `Already Excellent`.
28. Two "Scheduling" meanings (staff vs. appointment) — glossary fix. `Improvement Opportunity`.
29. Insurance is a stub; needs full context for enterprise. `Enterprise Only`.
30. Marketing/win-back → `Campaign` aggregate. `Marketplace Extension`.
31. Communication providers → plugin seams. `Optional Plugin`.
32. Payment providers → plugin seams. `Optional Plugin`.
33. Storage providers → plugin seams. `Optional Plugin`.
34. AI providers → plugin seams via Lovable AI Gateway. `Optional Plugin`.
35. Dental chart → marketplace module. `Marketplace Extension`.
36. Dermatology body-map → marketplace module. `Marketplace Extension`.
37. Nutrition planner → marketplace module. `Marketplace Extension`.
38. Psychology assessments → marketplace module. `Marketplace Extension`.
39. Radiology PACS → optional plugin. `Optional Plugin`.
40. Laboratory LIS → optional plugin. `Optional Plugin`.
41. Public API over contracts → future. `Future Enhancement`.
42. Workflow engine → future. `Future Enhancement`.
43. Automation/rules engine generalizing reminders. `Future Enhancement`.
44. Domain event catalog documented, then emitted. `Future Enhancement`.
45. Read models (materialized views) per report subject area. `Improvement Opportunity`.
46. Consent & confidentiality VO (psychology, minors). `Improvement Opportunity`.
47. `Coupon` rule engine formalization. `Future Enhancement`.
48. `Insurance` claim/EOB pipeline. `Enterprise Only`.
49. `Franchise/MultiClinic` reporting rollups. `Enterprise Only`.
50. Ubiquitous glossary document. `Improvement Opportunity`.

---

## 15. Top 25 Priorities (ordered)

1. Publish Ubiquitous Language glossary (docs only).
2. Split `Settings` conceptual boundary (docs first).
3. Introduce `Money` VO in the contract catalog (docs).
4. Introduce `Encounter/ClinicalVisit` aggregate concept.
5. Rename `TreatmentPlan` → `CarePlan` in glossary; keep table name.
6. Define event catalog: `appointment.*`, `invoice.*`, `payment.*`, `patient.*`, `inventory.*`.
7. Introduce reporting read-model plan per subject area.
8. Formalize Communication published language.
9. Separate `Notification` vs. `Communication` in docs.
10. Define `Organization/Tenant` aggregate for multi-tenant future.
11. Define plugin manifest schema (per `PLUGIN_ARCHITECTURE.md`).
12. Define marketplace review pipeline (docs).
13. Define `ProcedureCode` VO and mapping strategy.
14. Define `Dosage` VO for Prescription items.
15. Define `TimeSlot` VO for scheduling contexts.
16. Draft `CarePlan` extension guide for specialties.
17. Draft `Encounter` extension guide.
18. Draft `Insurance` full-context blueprint.
19. Draft `Payroll` aggregate blueprint.
20. Draft `PurchaseOrder` aggregate blueprint.
21. Draft `Campaign` aggregate for marketing marketplace.
22. Draft `AutomationRule` blueprint (generalizing reminders/winback).
23. Draft `PublicAPI` contract exposure plan.
24. Draft `EventBus` adoption plan (Supabase realtime + edge fn subscribers).
25. Draft `AI Agent` tool surface built on read models.

All priorities are **documentation activities**; none require runtime, schema, RLS, or authorization changes.

---

## 16. Scores

| Dimension                     | Score (/100) | Rationale                                                                 |
|------------------------------|-------------:|---------------------------------------------------------------------------|
| **Overall DDD**              | **74**       | Strong implicit contexts, weak explicit domain layer, excellent authz core.|
| **Enterprise DDD**           | **70**       | Governance, ownership, contracts formal; missing tenant/event bus/ACLs.   |
| **Healthcare SaaS**          | **78**       | Clinical seams identified; specialty extension path clear via plugins.    |
| **Vendor Neutrality**        | **76**       | Core neutral; clinical vocabulary and treatment plan naming still coupled.|
| **Scalability (domain-wise)**| **72**       | Modular monolith with sound aggregates; needs event-driven decoupling.    |

---

## 17. Final Verdict

**Enterprise Ready with Future Enhancements.**

The platform's domain model is coherent, well-governed, and already vendor-neutral in its core (patients, appointments, billing, inventory, HR, authorization). The recommended improvements are additive — a glossary, a handful of value objects, an event catalog, a read-model layer, and an `Organization/Tenant` aggregate — and can be adopted incrementally as **documentation first**, with zero risk to the currently active canonical authorization runtime or any production behavior.

No runtime, schema, RLS, Edge Function, authorization, or migration changes are recommended or performed by this review.