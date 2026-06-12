
# Appointment Hub & Dashboard UX — v1 Plan (Analysis Only)

## 1. Current state

### Appointments / Calendar
- **Single file**: `src/pages/calendar/CalendarPage.tsx` (~960 lines) handles Day / Week / Month views, mini-month sidebar, filters (doctor, room, status), and the create/edit dialog. There is **no separate "Appointments list" page** — the calendar IS the list. Booking dialog is `Dialog` inline.
- Status schema in code: `scheduled | confirmed | in_progress | completed | cancelled | no_show | departed` (matches DB enum).
- Filters (doctor / room / status) live behind a "Filter" pill — not visible above the fold on first paint.
- Patient picker in the booking dialog is a generic combobox: **no debt, wallet, or last-visit signal**. Reception cannot see if the patient owes money before confirming the slot.
- Status changes go through `RowActions` → 1 click to open menu + 1 click per status. No quick "Arrived / Start / Complete" inline buttons on the day view.
- Stats strip (`stats.total/scheduled/completed/cancelled`) is computed but only shown deep inside the view; not a focused KPI band.

### Dashboard
- `src/pages/dashboard/Dashboard.tsx` (~617 lines): fires ~14 parallel queries, renders KPI cards, line/pie/bar charts (recharts), and three "recent" lists (patients, appointments, payments).
- KPIs mix scopes: today (appts, revenue, new patients), all-time pending invoices, range-based charts — **no visual grouping** of "Today vs Week vs Month".
- KPI cards are static — **not clickable** to a filtered list.
- No treasury / daily-close awareness even though Treasury v1 hardening is live.
- Heavy: charts re-render on every branch switch; mobile experience is dense.

## 2. UX issues (summary)

| Area | Issue |
|---|---|
| Calendar header | Three view buttons + 3 nav buttons + Today + Sheet + New CTA crowd the top bar on tablets. |
| Filters | Hidden behind a sheet; doctor/status filters are the most-used and should be inline on day view. |
| Booking | No financial context (debt / wallet) on the patient row, no last-visit hint. |
| Status flow | Requires opening row menu; no one-tap "Arrived → In-Progress → Completed". |
| Today focus | No "Today at a glance" panel: counts by status + next-up patient. |
| Dashboard | Mixed time scopes, non-clickable KPIs, no treasury signal, charts overload. |

## 3. Proposed Appointment Hub v1

Keep the file `CalendarPage.tsx` as the single hub. No new route, no new heavy state lib.

### Layout (above the fold, day view)
```text
┌─ Header: title · date · [Day|Week|Month] · ‹ Today › · [+ New] ─┐
├─ Today strip: [Total N] [Scheduled N] [Arrived N] [In-Prog N]   │
│                [Completed N] [Cancelled/No-show N]              │
├─ Primary filters (inline): Doctor ▾ · Status ▾ · Room ▾ · 🔎   │
├─ Time grid (existing) ──────────── │ Mini-month + Next-up card  │
└──────────────────────────────────── │  (lg only, sticky)        ┘
```
- Move doctor/status/room filters out of the sheet, into an inline row visible on day view (collapse to sheet only on `<sm`).
- The "Today strip" replaces the buried `stats` block. Each chip is **clickable** → sets `statusFilter` for the day.
- Add a "Next up" card in the right rail showing the next non-completed appointment with quick actions.

### Status flow (mapped to existing enum)
```text
scheduled ──► confirmed ──► in_progress ──► completed
    │             │              │
    └─► cancelled / no_show      └─► departed
```
- On each appointment block in day view, add a tiny inline "next-status" button (e.g. `→ Arrived`, `→ Start`, `→ Done`) that calls the existing `changeStatus()` with the next legal state. Right-click / long-press still opens the existing RowActions menu for the full set.

### Patient financial context at booking
At booking-dialog open, after a patient is selected, fetch in parallel (read-only, no logic changes):
- `patient_wallets.balance` (existing table)
- `invoices` sum where `status in ('pending','partial')` and `patient_id = X`, computing `Σ(total - paid_amount)`
- `appointments` last completed/departed `scheduled_at` for the patient

Render as a small read-only card under the patient picker:
```text
Wallet: 320 EGP   Outstanding: 1,200 EGP   Last visit: 12 Apr 2026
```
Color the outstanding chip in `text-destructive` when > 0. No write paths. No wallet/treasury logic touched.

### Out of scope (v1)
- Multi-branch cross-scheduling, drag-to-reschedule, resource (chair) grid, recurring appointments UI, waitlist.

## 4. Proposed Dashboard v1.1

Same file, same queries (with 2 small additions). Reorganize layout into **3 horizontal bands** by time scope.

```text
Today
  [Appts today ▸] [Revenue today] [New patients] [Pending invoices ▸]
  [Last close · variance]   [Cash in treasury today]   ← NEW (2 cards)

This week
  [Revenue chart 7d]   [Appts by status 7d]

This month / range
  [Top services]  [Doctor performance]  [Age groups]  [Referral mix]
```

### Concrete changes
- **Group + label** the KPI cards under "Today / This week / This month" headings instead of one flat grid.
- **Make Today KPIs clickable** (wrap in `<Link>`):
  - Appts today → `/calendar?date=YYYY-MM-DD`
  - Pending invoices → `/invoices/outstanding`
  - Today revenue → `/payments?date=today` (Payments already supports date filter)
  - New patients → `/patients?created=today` (add a simple URL filter; trivial UI-only)
- **2 new cards from already-hardened data** (no backend change):
  - *Last daily close*: most recent row from `treasury_daily_closes` for current branch → show business_date, counted_cash, variance, color variance.
  - *Today's treasury movements*: sum of `treasury_transactions.amount` grouped by sign for today.
- Drop the recent-payments and recent-patients lists to a single compact "Recent activity" tabbed card to reduce density (NICE).
- Lazy-load chart section under an "Insights" accordion to speed first paint (NICE).

## 5. Touch list

| File | Change | MUST/NICE |
|---|---|---|
| `src/pages/calendar/CalendarPage.tsx` | Add Today-strip chips; promote doctor/status/room filters inline; add Next-up rail card; add inline next-status button on appointment blocks. | MUST |
| `src/pages/calendar/CalendarPage.tsx` (booking dialog section) | After patient selected, fetch wallet/outstanding/last-visit and render context strip. | MUST |
| `src/pages/dashboard/Dashboard.tsx` | Regroup KPIs under Today/Week/Month bands; wrap Today KPIs in `<Link>`; add 2 cards (last close + today treasury movement). | MUST |
| `src/pages/dashboard/Dashboard.tsx` | Collapse recents into a tabbed card; lazy "Insights" section. | NICE |
| `src/pages/patients/Patients.tsx` | Accept `?created=today` query filter (1-liner). | NICE (only if we want the dashboard link to filter) |

No new components library, no new routes, no schema/migration, no edits to wallet / treasury / audit / automated comm code paths. All new data reads use existing tables with existing RLS.

## 6. Verification after build (when approved)
- Day view: filter chips toggle the list; next-status button advances status; booking dialog shows financial strip within 500ms of patient pick.
- Dashboard: Today cards navigate to correctly-filtered pages; last-close + today-treasury cards show real numbers and respect branch switch; first paint not slower than current.

Awaiting approval to implement.
