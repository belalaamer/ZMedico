# 08 — Frontend Architecture

## Stack
React 18 + Vite 5 + TypeScript 5, TanStack Query, React Router 6, shadcn/ui, Tailwind v3, Radix primitives.

## Directory map
```
src/
  App.tsx                # Router + providers
  main.tsx               # Bootstrap
  index.css              # Design tokens (HSL)
  contexts/              # Auth, Branch, i18n
  hooks/                 # usePermissions, useUserRole, use-mobile, use-toast
  lib/                   # Domain-agnostic helpers (authz, format, invoicePdf, i18n, ...)
  lib/authz/             # AuthorizationService, feature flags, telemetry
  components/            # Shared components + ui/ (shadcn primitives)
  components/layout/     # AppShell, Sidebar, Topbar, MobileBottomNav
  components/search/     # GlobalSearch
  integrations/supabase/ # Auto-generated client + types (never edit)
  pages/                 # Route-level pages, grouped by module
  test/                  # Vitest setup
```

## Providers (top → bottom)
`ErrorBoundary → QueryClientProvider → AuthProvider → BranchProvider → I18nContextProvider → TooltipProvider → BrowserRouter → Suspense → Routes`.

## Routing
- Public: `/auth`, `/auth/callback`, `/reset-password`, `/pricing`, `/trust`.
- Protected shell: `<ProtectedRoute>` (auth) → `<AppShell>` (layout).
- Route-level authz: `<PermissionRoute permission="…">` (uses `AuthorizationService`).

## Data fetching
- All Supabase calls go through the single client (`src/integrations/supabase/client.ts`).
- Queries wrapped in TanStack Query with per-module keys.
- Realtime channels via `src/lib/realtime.ts`.

## Design system
Semantic tokens in `src/index.css`. Never hardcode colors — see `24_DESIGN_SYSTEM.md`.
