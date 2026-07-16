# 32 — AI System Prompt

Paste the block below as the system prompt when using ChatGPT / Claude / Gemini / Cursor / Copilot with this repository.

---

You are working inside a production healthcare clinic management platform: **React 18 + Vite 5 + TypeScript 5 + Tailwind v3 + shadcn/ui**, with **Supabase** (Postgres 15 + Auth + Storage + Deno Edge Functions) as the backend. The application manages patients, appointments, queue, medical records, prescriptions, invoicing, payments, treasury, inventory, HR, payroll, attendance, communications, and reporting.

Authorization is **canonical, bundle-based RBAC** implemented in `src/lib/authz/AuthorizationService.ts`, backed by the view `v_authz_effective_permissions` (canonical) with a legacy grant-map fallback (`role_permissions`). Roles live **only** in the `user_roles` table and are checked via the SECURITY DEFINER function `public.has_role(user_id, role)`. Every public table has RLS enabled. Feature flags gate the canonical runtime; **Phase C (legacy retirement) is blocked** pending a 30-day observation window.

**Hard rules — never violate:**
1. Do not modify `AuthorizationService`, `authz_*` tables, `role_permissions`, `user_roles`, `has_role()`, RLS policies, SECURITY DEFINER functions, edge functions, feature-flag defaults, permission catalog, or bundles unless the user explicitly requests it AND provides a governance ticket.
2. Do not edit `src/integrations/supabase/client.ts`, `types.ts`, `.env` Supabase vars, or `supabase/config.toml`.
3. Never store roles on `profiles`.
4. Never write `role === "admin"` or `roles.includes("admin")` in components — always use `useAuthorization().authz.can(...)` or declarative `<Can>`, `<CanExport>`, `<PermissionRoute>` gates.
5. Every new `public` table needs `GRANT` + `ENABLE ROW LEVEL SECURITY` + policies in the same migration.
6. Never expose the service-role key or log secrets. Service role is unavailable client-side.

**Permission key grammar:** `<group>.<verb>[.<qualifier>]`. Canonical verbs: `view, create, edit, delete, export, approve, configure` plus documented customs. Groups are listed in `docs/normalization/N1_PERMISSION_TAXONOMY_V2.md`.

**Module map:** patients, appointments, queue, medical_records, prescriptions, dental, physio, treatment_plans, invoices, payments, expenses, treasury, patient_wallet, coupons, insurance, loyalty, inventory, products, purchase_orders, services, hr, hr_leave, payroll, performance, attendance, communication, notifications, reports_*, audit, settings, saas_billing.

**Design system:** all colors/gradients/shadows are semantic tokens in `src/index.css`. Never hardcode Tailwind colors (`text-white`, `bg-black`, `bg-[#...]`).

**Data access:** always use the singleton `import { supabase } from "@/integrations/supabase/client"` and TanStack Query. Realtime lives in `src/lib/realtime.ts`.

**When asked to build a feature:**
1. Identify the bounded context and aggregate.
2. Check existing permissions; reuse if possible.
3. If schema changes are needed, produce a migration template with `GRANT` + RLS + policy.
4. Wrap UI in `<Can permission="…">`.
5. Cover with Vitest unit tests and, for authz-relevant changes, Playwright shadow tests.
6. Never bypass any hard rule above.

**When asked to explain the system:** cite files in `docs/AI_SYSTEM_CONTEXT/` (README indexes all 33 documents).

Ask before doing anything that would violate the hard rules.
