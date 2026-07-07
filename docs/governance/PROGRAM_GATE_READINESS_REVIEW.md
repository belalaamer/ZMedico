# Program Gate — Implementation Readiness Review

**Status:** Documentation only. No SQL, no code, no migrations.
**Scope:** Independent readiness assessment of Authorization Model v2.0 **RC2**
(`A3_AUTHORIZATION_V2_RC1.md` + `RC1_1_RC2_REMEDIATION.md`) immediately prior
to execution of Pre-Wave-A hardening and Wave A.
**Method:** Ignore prior approvals. Treat every artifact as if execution
starts tomorrow morning. Attempt to find blocking gaps.

---

## 1. Executive summary

| Dimension | Score (0–5) | Notes |
|---|---|---|
| Architecture clarity | 5 | 6 roles / 56 keys / no bundles is unambiguous. |
| Permission catalog | 4 | Frozen post-RC2. Wallet/refund still implicit under `payments.write` — acceptable via RPC gating. |
| Role definitions | 5 | Deterministic default grants per role, no overlap. |
| RLS design | 4 | 19-policy delta specified; helper surface stable. |
| RPC design | 4 | 12-entry RPC Manifest defined; three RC2 RPCs specified but not drafted. |
| Edge Functions | 3 | Admin/export/reminder present; consent + patient-export edge paths not enumerated. |
| SECURITY DEFINER Standard | 5 | v1.1 frozen; four H3 hotfixes remain FAIL — must land before Wave B. |
| Compliance framework | 4 | R1–R9 advisory; R10 strict at Wave B start; R11–R14 defined, checker not extended. |
| Regression harness | 4 | RLS + RPC baselines committed; manifest presence check not wired. |
| Testing | 3 | Strong rbac.deep coverage; no tests yet for the six RC2 surfaces. |
| Rollback | 4 | Per-wave rollback pattern established; Pre-Wave-A rollback SQL not drafted. |
| Documentation | 4 | Governance chain complete; support triage runbook missing. |
| Operational support | 3 | No `describe_effective_permissions` RPC; no support playbook. |

**Confidence to start Pre-Wave-A tomorrow: 82%.** Gaps concentrated in
three areas: RPC drafts, harness wiring for the new manifest, and a
support triage runbook. All closeable in ≤ 2 working days without
redesign.

---

## 2. Wave-by-wave readiness

### Wave A — Additive (catalog + grants + non-breaking RLS pre-hardening)

| Check | Verdict | Evidence / Gap |
|---|---|---|
| Prerequisites complete | ⚠️ Partial | Pre-Wave-A hardening migration specified but SQL not drafted. |
| Risks identified | ✅ | RC2 §5. |
| Rollback available | ⚠️ Partial | Prose only; no `.sql` artifact. |
| Testing complete | ✅ | Fully additive; existing rbac.spec covers. |
| Blocking dependencies | None | Additive to today's schema. |
| Confidence | **85%** | 95% once rollback SQL committed. |

### Wave B — Cutover (RLS repointing, RPC introduction, strict R10)

| Check | Verdict | Evidence / Gap |
|---|---|---|
| Prerequisites complete | ❌ | Depends on H3-3…H3-6 SECURITY DEFINER FAIL fixes. |
| Risks identified | ✅ | Dual-gate window, cache staleness enumerated. |
| Rollback available | ✅ | Per-table pattern in `docs/wave3a/…`. |
| Testing complete | ❌ | No presence tests for `refund_payment`, `apply_discount`, `deactivate_staff`. |
| Blocking dependencies | H3 hotfixes; RPC Manifest wiring in `run_all.sh`. |
| Confidence | **60%** | Blocked until above complete. |

### Wave C — Hygiene (dead-permission removal, doc archival, strict compliance)

| Check | Verdict | Evidence / Gap |
|---|---|---|
| Prerequisites complete | ⚠️ | Requires Wave B baseline soak ≥ 1 sprint. |
| Risks identified | ✅ | Subtractive only. |
| Rollback available | ✅ | `git revert` sufficient. |
| Testing complete | ⚠️ | Needs 1-sprint zero-unlabeled-diff harness run. |
| Blocking dependencies | Wave B fully green. |
| Confidence | **75%** | Non-blocking; plan in parallel. |

---

## 3. Operational readiness

| Question | Answer |
|---|---|
| Can a developer execute safely? | Yes for Wave A; No for Wave B until H3 lands. |
| Can QA validate it? | Partial — needs three new Playwright specs (prescriptions.write, patients.export tightening, consent RPCs). |
| Can support troubleshoot "why can't I…"? | **No** — no `describe_effective_permissions(user_id)` RPC and no runbook. Largest operational gap. |
| Can future developers understand it? | Yes — A3 + `PERMISSION_CATALOG.md` sufficient. |
| Can future permission additions follow the standard? | Yes — `S1_SECURITY_DEFINER_STANDARD_V1.md` + `S2_COMPLIANCE_FRAMEWORK.md` §5. |

---

## 4. Documentation completeness

| Present | Missing |
|---|---|
| Architecture (A0/A1/A2/A3) | Support triage runbook |
| RC2 delta spec | Pre-Wave-A rollback SQL |
| SECURITY DEFINER Standard v1.1 | RPC Manifest checker script |
| Compliance framework (R1–R9) | R10–R14 checker extensions |
| Regression harness (RLS + RPC baselines) | Manifest step in `run_all.sh` |
| Per-wave rollback pattern | QA plan for three RC2 additions |

---

## 5. Hidden implementation risks

1. **Permission cache staleness.** `usePermissions` fetches once per session (8s timeout → defaults). During Wave B cutover a long-lived tab holds stale grants for hours. **Mitigation:** publish a `permissions_version` value and force re-fetch on mismatch.
2. **Migration ordering.** Pre-Wave-A hardening MUST run before any Wave A additive grant, else `service_role`-only SaaS tables get widened for one migration window. Ordering documented but not guarded.
3. **Backward compatibility.** `<Can />` API unchanged; parity validated by `Can.parity.test.tsx` + `AuthorizationService.contract.test.ts`. Low risk.
4. **Concurrent deployments.** Frontend deploys can race the cutover. Wave B frontend must ship behind a feature flag reading `permissions_version`. Flag mechanism does not exist yet.
5. **Long-running sessions.** Auth tokens live 1h; grant lag up to 1h during cutover. Document in runbook.
6. **Rollback consistency.** RPCs added to the Manifest cannot be dropped mid-Wave-B without breaking clients. Manifest additions are effectively one-way; must be stated explicitly.
7. **Performance.** `has_permission()` is `STABLE`, indexed on `(user_id, permission)`. Adequate; no change.
8. **Audit continuity.** Compliant RPCs source `audit_logs.user_id` from `auth.uid()` (R7). Safe if H3 lands as scheduled.

---

## 6. Mandatory conditions before implementation

Blocking. Nice-to-haves excluded.

1. **Draft & commit** `docs/governance/PRE_WAVE_A_HARDENING_ROLLBACK.sql`.
2. **Land H3-3…H3-6** so the compliance report reaches zero FAIL before Wave B starts.
3. **Ship** `scripts/authz/check_rpc_manifest.py` and wire it into `scripts/authz/run_all.sh`; strict-fail on any missing manifest entry.
4. **Extend** `compliance_definer.py` with rule checks for R10–R14 (advisory during Wave A, strict at Wave B start).
5. **Introduce** a `permissions_version` cache-busting mechanism and force `usePermissions` re-fetch on mismatch. Required before Wave B ships to production.
6. **Publish** `docs/governance/AUTHORIZATION_SUPPORT_RUNBOOK.md` covering: inspecting a user's effective permissions, correlating an RLS denial in logs to a policy, and issuing temporary elevation via `user_roles` without bypassing audit.

---

## 7. Decision

### **READY WITH CONDITIONS**

Authorization RC2 is architecturally sound. Wave A is safe to start as
soon as condition (1) is satisfied. Wave B **must not** begin until
conditions (2)–(5) are complete. Condition (6) must be complete before
Wave B reaches production traffic.

No condition requires redesign; all are execution artifacts closeable
within the current sprint.
