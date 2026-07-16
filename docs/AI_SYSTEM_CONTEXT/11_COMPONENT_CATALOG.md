# 11 — Component Catalog

Shared components under `src/components/` (excluding `ui/` shadcn primitives).

| Component | Purpose |
|---|---|
| `Can` | Declarative permission gate; wraps children with `authz.can(permission)` check. |
| `CanExport` | Specialized gate for `*.export` permissions; also applies `exportGuard`. |
| `PermissionRoute` | Route wrapper enforcing a permission (or `adminOnly`). |
| `ProtectedRoute` | Requires authenticated session; redirects to `/auth`. |
| `ErrorBoundary` | Top-level error surface with Sentry reporting. |
| `NavLink` | Sidebar/top-nav link with active state + permission awareness. |
| `MobileBottomNav` | Mobile-first bottom navigation. |
| `PullToRefresh` | Mobile pull-to-refresh wrapper. |
| `RowActions` | Table row action menu (edit/delete/etc.). |
| `TablePager` | Cursor-friendly pagination controls. |
| `ListSkeleton` | Loading skeleton for lists. |
| `ConsumablesEditor` | Edits `service_consumables` for services. |
| `JobRoleSelect` | Staff position selector. |
| `LocationMap` | Map preview (branches/attendance GPS). |
| `attendance/GpsCheckDialog` | Attendance check-in with GPS. |
| `layout/AppShell` | Authenticated layout shell. |
| `layout/Sidebar` | Desktop sidebar navigation. |
| `layout/Topbar` | Header bar (search, user menu). |
| `search/GlobalSearch` | Cross-module command palette (`src/lib/globalSearch.ts`). |

`src/components/ui/` — shadcn/ui primitives; do not modify individually, extend via composition.
