# 23 — UI/UX Guide

## Principles
- Task-first: primary action always visible above the fold.
- Progressive disclosure: advanced actions collapse behind menus (`RowActions`).
- Mobile-parity: bottom nav + pull-to-refresh; forms adapt.
- Permission-aware: no dead buttons — hide with `<Can>`.
- Feedback: toasts on mutation success/failure; skeletons on load; empty states with next-action hint.
- Realtime: use realtime channels for queue/appointments/notifications, not polling.

## Layout
- Desktop: `Sidebar` + `Topbar` + main content.
- Mobile: `MobileBottomNav` + condensed topbar.
- Shell provided by `AppShell` inside `ProtectedRoute`.

## Forms
- react-hook-form + zod (**Assumption** based on stack).
- Server errors surfaced with `use-toast`.
- Destructive actions require confirmation dialogs.

## Tables
- `TablePager` for pagination; server-side pagination is the default (see `docs/sprint4/PAGINATION_AUDIT.md`).
- `RowActions` for per-row menus.
- Loading via `ListSkeleton`.
