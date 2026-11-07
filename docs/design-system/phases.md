# ZMedico design system — phased rollout

The `--z-*` tokens, the craft standard (`.qoder/skills/zmedico-craft-ui/SKILL.md`), the token
reference (`.qoder/skills/zmedico-design-tokens/SKILL.md`) and the review procedure
(`.qoder/skills/zmedico-ui-review/SKILL.md`) are the system. This file is the schedule for
applying it to the product: which surface moves in which phase, and what "done" means for each.

**The constraint that shapes every phase.** The legacy shadcn token set
(`--background / --primary / --card …`) is still live and still drives `components/ui/*`,
tenant white-label overrides (`html[data-tenant-branded="true"]`) and every screen that has not
been migrated. The `--z-*` set is **additive**. A phase may not delete or re-value a legacy token;
the cutover is its own phase (3), after the surfaces have moved. Zero-regression is the bar: a
screen is migrated in one PR or not at all.

**The ratchet.** `scripts/design-lint.mjs` fails on any new violation and holds the legacy set in
`scripts/design-lint-baseline.json`. Each migrated surface removes its entries from the baseline in
the same PR; the baseline only shrinks. A phase is finished when its surfaces are in the strict
scope (zero baselined findings) and their files carry no literals.

---

## Phase 0 — Foundation (merged)

- `--z-*` custom properties in `src/index.css` and their Tailwind map in `tailwind.config.ts`.
- `scripts/design-lint.mjs` + the frozen baseline, wired as `npm run design:lint`.
- The three project skills above, and the frozen `designTokenContract` test that pins the token
  block, the class scanner and the contract ledgers.

## Phase 1 — Platform Administration (this PR, `feat/platform-craft-b1-20261106`)

The first surface on the system, and the reference implementation for Phase 2.

- `src/pages/platform/PlatformConsole.tsx` rewritten on `.z-platform` and the token set; the
  legacy seven-outline-button row, three identical `Stat` cards and `bg-primary/5` info card are gone.
- Archive / restore / permanent-delete are explicit, gated dialogs
  (`ArchiveWorkspaceDialog`, `RestoreWorkspaceDialog`, `PermanentDeleteDialog`) with typed-slug
  confirmation and `Assess`-before-`delete`.
- The archived ledger is hidden from the default view and the KPIs; it has its own tab, its own
  counts, and the permanent-delete action lives only behind the archive ledger.
- Console cleaned of design debt: `deskFailureContract` no longer lists `PlatformConsole.tsx`.
- Backing SQL: `20261106120000_platform_workspace_archive_restore.sql` and
  `20261106121000_platform_workspace_permanent_delete.sql` (dry-run verified, not yet committed to
  production).

## Phase 2 — The operational desks

One surface per PR, each with its screenshots, its tests, and its baseline entries removed. Ordered
by how much of the day staff spend there and how much money is on screen.

**2a — The front desk.** `queue/`, `checkin/`, `calendar/`, `appointments/`. Highest traffic,
most RTL pressure, the first row of the day.

**2b — Clinical.** `medical/`, `physio/`, `patients/`. Encounter and case surfaces; the records
tables get the ledger treatment from `zmedico-design-tokens` §1–§3.

**2c — Money.** `invoices/`, `payments/`, `expenses/`, `treasury/`, `inventory/`. Every figure
`tnum` and logical-end aligned; this is where §6's "tabular figures are not decoration" is enforced
by `designTokenContract` and the money-screen copy tests.

**2d — People and settings.** `hr/`, `leads/`, `branches/`, `settings/`, `subscription/`,
`coupons/`, `system/`. Forms and admin lists; the last legacy `components/ui/*` consumers before
the cutover.

**2e — Reporting and outreach.** `dashboard/`, `reports/`, `reminders/`. Charts and summaries:
signal colour is meaning, never series-by-series decoration.

**2f — Public and portal.** `booking/`, `pricing/`, `patientPortal/`, `auth/`, and the static
`PrivacyPolicy` / `TermsOfService` / `Trust` pages. Fastest to regress on mobile; the public-mobile
smoke matrix is the gate.

## Phase 3 — Shell and the legacy cutover

**3a — Shell.** `AppShell`, `Topbar`, sidebar and the global chrome consume `--z-*`; the one dark
band (`--z-surface-inverse` + `--z-gradient-masthead`) replaces the current masthead treatment.

**3b — Retire the legacy set.** Remove `--gradient-primary` / `--gradient-card`, the "Medical
Purple Theme" naming and the single `--radius: 0.75rem`; re-point `components/ui/*` at the `--z-*`
roles. Tenant white-label is re-expressed against the token layer so `!important` overrides on
`.text-primary` / `.bg-sidebar` / `.border-primary` can go.

**3c — RTL polish.** The `[dir="rtl"]` physical-class override list in `src/index.css` is a patch
for legacy usage. Once no surface emits physical utilities, delete it and keep only the
direction-bearing icon mirroring.

## Phase 4 — Beyond the cutover (not scheduled)

- Dark mode: only after all nine ink/surface values are re-checked at 4.5:1 (tokens §1).
- Density preference for the desks (comfortable / compact), expressed as token values.
- Motion pass over the shell once every surface sits on `--z-duration-*` and `--z-ease-*`.

---

## Definition of done, per surface

1. `node scripts/design-lint.mjs` reports the file in strict scope with zero findings; its baseline
   entries are deleted in the same PR.
2. `npm run typecheck` (both project references) and `npm run build` are green; `npm run test` is
   green, with any frozen contract ledger (`deskFailureContract`, `deleteConfirmationContract`,
   `zeroRowWriteContract`, `branchArchiveSafety`, `branchDeletionSafety`) updated deliberately and
   explained in the PR body.
3. Rendered at 1440 and 390, in EN and AR; the `zmedico-ui-review` verdict names the one memorable
   element, the evidence tier, and the accessory removed in the removal pass.
4. No new legacy-token consumer, no new physical `pl-/pr-/left-/right-`, no new literal colour.
