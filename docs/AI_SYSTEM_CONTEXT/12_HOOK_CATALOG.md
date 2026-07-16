# 12 — Hook Catalog

| Hook | Location | Inputs | Output | Purpose |
|---|---|---|---|---|
| `usePermissions` | `src/hooks/usePermissions.ts` | – | `{ can, isAdmin, loading, ... }` | Legacy grant-map reader; source for `AuthorizationService.legacyCan`. |
| `useUserRole` | `src/hooks/useUserRole.ts` | – | `{ roles, isAdmin, loading }` | Reads `user_roles`; used only via service for transitional role adapters. |
| `useAuthorization` | `src/lib/authz/useAuthorization.ts` | `component?` | `{ authz, loading }` | Canonical entry point for permission checks. |
| `useAuthzState` | `src/lib/authz/useAuthzState.ts` | – | `{ fingerprint, enabled }` | Subscribes to authorization state for telemetry. |
| `use-mobile` | `src/hooks/use-mobile.tsx` | – | `boolean` | Viewport detection. |
| `use-toast` | `src/hooks/use-toast.ts` | – | toast API | shadcn toast primitives. |

**Rule**: any new permission check MUST go through `useAuthorization`; do not add ad-hoc role checks in components.
