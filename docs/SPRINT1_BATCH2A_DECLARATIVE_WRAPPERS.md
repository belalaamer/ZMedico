# Sprint 1 · Batch 2A — Declarative Authorization Components Migration

**Status:** Complete · **Behavior change:** None · **Test suite:** 283 / 283 passing

## 1. Scope

Migrate every declarative authorization UI wrapper so that
`AuthorizationService` (via `useAuthorization()`) is the **only**
authorization entry point. No business modules, routes, RLS, roles, or
permissions were touched.

In-scope wrappers reviewed:

| Wrapper                | File                           | Migrated | Notes                                |
| ---------------------- | ------------------------------ | -------- | ------------------------------------ |
| `<Can>`                | `src/components/Can.tsx`       | ✅       | Now consumes `useAuthorization()`.   |
| `<CanExport>`          | `src/components/CanExport.tsx` | ✅ (transitive) | Thin alias over `<Can action="export">`; inherits migration. |

No other declarative wrappers or authorization HOCs exist in the codebase
(verified via `rg` for `usePermissions`, `isAdmin`, `roles.includes`,
`role ===` inside `src/components/**` — only `Can.tsx` matched, and
`GlobalSearch.tsx` which is a business surface, out of scope for 2A).

## 2. Public API

Unchanged.

```tsx
<Can module="invoices" action="create">…</Can>
<CanExport module="reports">…</CanExport>
```

All existing call sites continue to work without modification. No
compatibility shim was required.

## 3. Internal change

`<Can>` now derives its decision from `authz.can("<module>.<action>")`
instead of `usePermissions().can(module, action)`. The service internally
delegates to the same legacy permission map today, so decisions are
byte-identical.

## 4. Tests

- **Contract tests** — `src/lib/authz/AuthorizationService.contract.test.ts` (14):
  positive/negative cases for `can`, `canAny`, `canAll`, `isSuperAdmin`,
  admin bypass, empty-list semantics.
- **Wrapper parity tests** — `src/components/Can.parity.test.tsx` (26):
  render `<Can>` / `<CanExport>` under 4 representative permission maps ×
  every action and assert output matches the legacy decision.
- **Regression** — pre-existing suites (`AuthorizationService.test.ts` 19,
  `navigation.parity.test.ts` 224) still green.

Totals: **283 / 283** passing (was 243 before this batch).

## 5. Migration metrics

| Metric                                             | Count |
| -------------------------------------------------- | ----- |
| Files modified                                     | 1     |
| Files added                                        | 3     |
| Wrappers migrated                                  | 2     |
| Direct `usePermissions()` calls removed in wrappers | 1     |
| `AuthorizationService` calls introduced            | 1     |
| New tests                                          | 40    |

## 6. Rollback

Fully reversible in one revert.

```
git revert <this batch>
```

Restores `Can.tsx` to the `usePermissions()` implementation and deletes
the two new test files. No data, schema, or config changes to unwind.

## 7. Security assessment

- **No privilege escalation** — service delegates to the same
  `usePermissions().can` map; decisions are provably identical (parity
  tests enumerate every action across representative maps).
- **No reduction in protection** — admin bypass preserved via
  `isSuperAdmin()`; deny-by-default retained.
- **No new client-side authority** — RLS and edge-function checks remain
  the sole source of truth server-side.
- **Backend remains authoritative** — this batch is UI-only.

## 8. Remaining technical debt

- `src/components/search/GlobalSearch.tsx` still calls `usePermissions()`
  directly. It is a business surface, not a wrapper — scheduled for a
  later batch (Batch 3+, business modules).
- `src/hooks/usePermissions.ts` remains the legacy primitive; retiring
  it is deferred to the final cleanup batch as planned in the Inventory.

## 9. Success criteria — verification

- [x] Zero behavior change (parity suite, 26 render assertions).
- [x] Existing tests pass (243 → 283, no regressions).
- [x] New tests pass.
- [x] `AuthorizationService` is the only authorization dependency inside
      declarative wrappers.
- [x] No direct role checks remain inside authorization wrappers.
- [x] No new hardcoded permissions introduced.