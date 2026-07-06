# Permission Lifecycle Policy

Every permission key follows the same state machine. Transitions require the evidence and approvals in `CHARTER.md` §5–§6.

## 1. State Machine

```
        ┌────────┐
        │ Draft  │   proposed in a normalization or design doc
        └───┬────┘
            │  Board approves shape + owners
            ▼
        ┌────────┐
        │ Approved│  inserted into authz_permissions; may be granted
        └───┬────┘
            │  RLS/frontend adopt the key
            ▼
        ┌────────┐
        │ Active │  in production use; harness enforces stability
        └───┬────┘
            │  replacement exists OR business op retired
            ▼
        ┌───────────┐
        │ Deprecated │  deprecated=true; usage report generated weekly
        └────┬──────┘
             │  ≥30d with 0 call sites (60d for High-risk, 90d for Critical)
             ▼
         ┌────────┐
         │ Retired│  physically removed from catalog; migration file archived
         └────────┘

     Any state ──► Rejected (documented rationale)
     Deferred     : awaiting a Product Decision; not yet Draft-ready
```

## 2. Timeboxes
| Risk | Deprecation dwell | Retirement window | Emergency retire? |
|---|---|---|---|
| Low | 30 d | +7 d | Yes |
| Medium | 60 d | +14 d | With Technical + Business chair |
| High | 90 d | +30 d | Full quorum + DPO |
| Critical (payments, payroll, medical delete) | 90 d minimum + one full audit cycle | +60 d | Never — must go through cycle |

## 3. Required Signals
- Draft → Approved: taxonomy conformance, owner assignment, at least one bundle grant plan.
- Approved → Active: first RLS/frontend consumer merged and green harness.
- Active → Deprecated: replacement key Active OR business-op removal decision.
- Deprecated → Retired: weekly usage report shows 0 call sites for the dwell period.

## 4. Backward-Compatibility Rules
- **Adding a key:** always safe.
- **Adding a bundle grant:** safe; harness re-runs baseline.
- **Removing a bundle grant:** requires impact statement (roles losing access) + DPO sign-off if Regulatory ≠ None.
- **Renaming a key:** never in-place. Create the new key, migrate consumers, deprecate the old.
- **Changing semantics:** treat as C4 in charter; new key + parallel-run + deprecation.

## 5. Audit
Every state transition is logged (target: `audit_logs` with `resource_type='authz_permission'`). Weekly Board digest includes state changes, deprecation queue, and open PDs.

## 6. Emergency Procedures
- **Security incident** implicating a permission: DPO may force Draft (block new grants) within 24h; Board convenes within 72h to decide Deprecated vs remediated.
- **Regression detected by harness:** merge freeze on affected group; rollback ready per Wave rollback file.
