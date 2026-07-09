# R3.5 — Rollback

R3.5 is code-only, additive, and touches no database objects.

## Full rollback

```bash
rm scripts/authz/guardrails_frontend.py
rm scripts/authz/guardrails_backend.py
rm scripts/authz/tests/test_guardrails.py
```

Revert the guardrail block added to `scripts/authz/run_all.sh` (between
the `analyze_rpcs` invocation and the compliance check).

No SQL to run. Authorization decisions are unaffected.

## Partial rollback (disable enforcement, keep checkers)

Leave the scripts in place and unset `GUARDRAILS_STRICT`. The harness
continues running the checks in advisory mode.

## Verification after rollback

```bash
bash scripts/authz/run_all.sh   # must remain green
```

Golden Baseline diff MUST report 0 RLS + 0 RPC changes.
