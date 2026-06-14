# Queue / Front Desk Workflow — Phase 1

## Current state

- No dedicated Queue page exists. Day-to-day appointment work happens in `src/pages/calendar/CalendarPage.tsx`.
- `appointments.status` already has the right enum: `scheduled`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`, `departed`. We will **reuse it**, no enum change.
- `appointments` has `scheduled_at`, `duration_minutes`, `doctor_id`, `branch_id`, `room`, but **no `checked_in_at`, no `started_at`, no priority**.
- Accurate "waiting time since check-in" and "in-session time since start" cannot be derived from existing columns (`updated_at` changes on any edit and is not reliable). The user said schema changes are allowed only if absolutely necessary — they are necessary here, but the change is minimal and additive.

## Proposed scope

### 1) Minimal additive schema (one migration)

Add to `public.appointments`:
- `checked_in_at timestamptz NULL`
- `started_at timestamptz NULL`
- `priority smallint NOT NULL DEFAULT 0` (`0` normal, `1` urgent)

No enum change, no RLS change, no rename, no drop. Existing rows unaffected (NULL / 0 defaults).

Status → timestamp mapping handled in the app layer:
- transition to `confirmed` ("Checked in") → stamp `checked_in_at = now()` if NULL
- transition to `in_progress` ("With doctor") → stamp `started_at = now()` if NULL
- backward transitions never clear stamps

### 2) New page: `/queue` (Front Desk)

File: `src/pages/queue/Queue.tsx`, route added in `src/App.tsx`, sidebar link in `src/components/layout/Sidebar.tsx` (Arabic: "الطابور" / English: "Queue").

**Status mapping (no new enum):**

| UI label    | DB status      |
|-------------|----------------|
| Waiting     | `scheduled`    |
| Checked in  | `confirmed`    |
| With doctor | `in_progress`  |
| Completed   | `completed`    |
| Cancelled   | `cancelled`    |
| No-show     | `no_show`      |

`departed` is treated as "Completed" for queue purposes (filtered out of the active queue by default).

**Default scope:** today's appointments for `currentBranchId`, active statuses (`scheduled`, `confirmed`, `in_progress`) shown by default; `completed`, `cancelled`, `no_show` available via status filter.

**Columns (desktop table) / fields (mobile card):**
- Patient (name + code, click → `/patients/:id`)
- Appointment time (`scheduled_at`)
- Check-in time (`checked_in_at` or `—`)
- Doctor + room
- Status badge (semantic colors already in `index.css` via `status-*` classes)
- Priority badge if `priority = 1`
- Waiting time (live, see §3)
- In-session time (live, see §3)
- Row actions (see §4)

**Filters (sticky header):**
- Status (multi or single select)
- Doctor (reuse existing doctor list pattern from CalendarPage)
- Priority (all / urgent only)
- Default sort: `checked_in_at` ascending, then `scheduled_at` ascending; urgent items pinned to top within their group.

**Empty / overload states:**
- Empty: "لا يوجد مرضى في الطابور" / "No patients in the queue".
- Overload hint: small inline banner above the list when ≥1 waiting > 30 min: "X مرضى ينتظرون أكثر من 30 دقيقة" / "X patients waiting > 30 min".

### 3) Time computations (client-side, 30 s tick)

- `waitingMs = now − checked_in_at` while status ∈ {`confirmed`}
- `inSessionMs = now − started_at` while status = `in_progress`
- Long-wait highlight: subtle amber row tint when `waitingMs > 30 min`.
- A single `useEffect` interval (30 s) drives a `tick` state so all rows re-render without per-row timers.

### 4) Row actions (uses existing `RowActions` component)

Available actions depend on current status:

| From         | Actions shown                                        |
|--------------|------------------------------------------------------|
| scheduled    | Check in · Start visit · Mark no-show · Cancel · Open patient · Toggle urgent |
| confirmed    | Start visit · Cancel · Mark no-show · Open patient · Toggle urgent           |
| in_progress  | Complete · Open patient · Toggle urgent                                       |
| completed    | Open patient                                                                  |
| cancelled / no_show | Open patient · Reopen (→ `scheduled`)                                 |

All actions are single Supabase updates on `appointments`; "Check in" and "Start visit" also stamp the corresponding timestamp when null. Toasts use existing `sonner` pattern.

### 5) Realtime + sync

Subscribe to `appointments` `postgres_changes` for the current branch (same pattern as `Sidebar.tsx`'s alerts channel, with a unique channel name per mount: `queue-${random}`) to keep the list live across reception devices. Listeners attached **before** `.subscribe()`.

### 6) i18n

Add the small set of new keys to `src/lib/i18n.ts` (`queue`, `waitingTime`, `inSessionTime`, `checkIn`, `startVisit`, `markNoShow`, `cancelVisit`, `togglePriority`, `urgent`, `noPatientsInQueue`, `longWaitBanner`). All other labels reuse existing status keys already present in `CalendarPage`.

### 7) Constraints respected

- `CalendarPage.tsx` is **not modified** in Phase 1 — appointments flow untouched.
- No RLS, no policy, no enum, no rename.
- Desktop-first table, collapses to stacked cards on `sm:` and below.
- Uses existing design tokens (`status-*`, `bg-card`, `text-muted-foreground`, etc.) — no hard-coded colors.

## Files

**New**
- `src/pages/queue/Queue.tsx` — page
- `supabase/migrations/<ts>_queue_workflow.sql` — adds 3 columns

**Edited**
- `src/App.tsx` — `/queue` route under `ProtectedRoute` + `PermissionRoute` (reusing `appointments` permission key)
- `src/components/layout/Sidebar.tsx` — nav entry
- `src/lib/i18n.ts` — new keys (EN + AR)

## Out of scope (Phase 2)

- Linking queue row to "Start consultation" screen / medical record editor.
- Auto-creating queue entries for walk-ins without an appointment.
- Per-doctor waiting analytics / dashboard widgets.
- Push/SMS notifications when patient is called.

## Deliverables on completion

- Working `/queue` screen with all six statuses, fast row actions, live waiting/in-session timers, sticky filters, mobile cards, empty + overload states.
- Implementation note: status mapping table, timer formula, the 3 added columns and why they were necessary.
