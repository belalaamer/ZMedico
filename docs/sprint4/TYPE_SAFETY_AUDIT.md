# Type-Safety Audit — `(supabase as any)` casts

Goal: catalog every remaining `(supabase as any)` cast, classify the
reason, and prescribe a mechanical removal plan. **No casts were
removed in Sprint 4** — the cleanup is a follow-up work item because
some casts hide legitimate schema drift that must be verified against
the generated `Database` types before removal.

## Inventory

- **Total casts**: 127
- **Files touched**: 37

Top offenders (see full list via `rg "supabase as any" src`):

| Rank | File | Casts |
|------|------|-------|
| 1 | `src/pages/patients/PatientTreatmentPlans.tsx` | 15 |
| 2 | `src/pages/settings/UserManagement.tsx` | 14 |
| 3 | `src/pages/settings/InsuranceContracts.tsx` | 10 |
| 4 | `src/pages/hr/StaffDetail.tsx` | 9 |
| 5 | `src/lib/systemSelfAudit.ts` | 9 |
| 6 | `src/lib/queueAlerts.ts` | 9 |
| 7 | `src/pages/patients/PatientWalletTab.tsx` | 4 |
| 8 | `src/pages/hr/Payroll.tsx` | 4 |
| 9 | `src/pages/settings/InsuranceCompanies.tsx` | 4 |
| 10 | `src/lib/queueSelfAudit.ts` | 4 |

## Cast categories

1. **RPC calls not present in generated types** — e.g. new `SECURITY
   DEFINER` functions added after the last type regeneration. Fix:
   regenerate `src/integrations/supabase/types.ts`; the cast becomes
   unnecessary.
2. **Tables missing from generated types** — same regeneration fix.
3. **JSON columns typed as `Json`** — cast used to narrow to a
   domain shape. Fix: define local Zod / TS types and parse instead of
   casting.
4. **Complex joins / views** — legitimate cases where a narrow
   `Pick<...>` is preferable to `any`. Fix: introduce a per-call
   response type near the call site.

## Recommended follow-up work items

- **Sprint 4.4** — Type regeneration pass.
  - Regenerate `types.ts`.
  - Remove any cast that becomes trivially unnecessary.
  - Estimated deletions: ~40–60 of the 127 casts.
  - Risk: **very low** — mechanical, verifiable by `tsc`.
- **Sprint 4.5** — JSON column narrowing (categories 3 + 4).
  - Introduce Zod schemas mirroring
    `docs/data/contracts/*.schema.json` from Sprint 3.
  - Replace remaining casts with typed parses.
  - Risk: **low-medium** — must confirm parse behavior for legacy
    rows that predate the contract.

## Guardrails

- Never delete a cast without confirming the resulting expression
  compiles under strict mode.
- Never change the underlying query shape while removing a cast —
  Sprint 4 explicitly forbids API changes.
- Auto-generated files (`src/integrations/supabase/client.ts`,
  `types.ts`) remain **not directly editable**.
