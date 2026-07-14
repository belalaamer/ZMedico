# Phase C — Readiness Checklist

Phase C removes legacy authorization. This document tracks readiness. Phase C is **not** started until this file is marked READY and signed off.

## Gate items

- [ ] Canonical runtime enabled by default in production ≥ 30 days.
- [ ] Zero drift for 30 consecutive days (see `AUTHORIZATION_KPIS.md`).
- [ ] Zero rollback events in the window.
- [ ] Zero critical authorization incidents in the window.
- [ ] Shadow probes 100% healthy for the window.
- [ ] All Playwright authorization suites green on every release in the window.
- [ ] No emergency authorization hotfixes in the window.
- [ ] Rollback drill executed successfully within the window.
- [ ] Engineering owner sign-off.
- [ ] Operations owner sign-off.

## Current status (Phase B complete)

- Canonical runtime: **approved** for production default (`PHASE_B_FINAL_VALIDATION.md`).
- Production default flag: **not yet enabled** — Stage 1 of `CANONICAL_ACTIVATION_PLAN.md` pending.
- 30-day production observation window: **not yet started**.

## Verdict

**NOT READY**

**Justification:** The activation plan has not yet completed Stage 3 (production enablement) or Stage 4 (30-day observation window with legacy retained). Retirement criteria in `LEGACY_RETIREMENT_CRITERIA.md` cannot be evaluated until the observation window has elapsed with clean KPIs. Phase C remains blocked pending Stages 1–4.
