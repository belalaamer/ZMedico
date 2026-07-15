# Authorization Technical Debt Register

**Mode:** Inventory only. Every item here is captured for future,
parity-safe remediation. Nothing in this document authorises a runtime,
schema, RLS, SECURITY DEFINER, Edge Function, or business-logic change.

**Legend**

- **Severity:** Low / Medium / High / Critical
- **Risk:** what breaks if left unattended
- **Impact:** blast radius when eventually fixed
- **Migration complexity:** Low / Medium / High
- **Backward compatibility:** Preserved / Requires shim / Breaking
- **Runtime impact:** None / Additive / Behavioural

---

## D-01  Two mutation verbs coexist (`edit` vs `update`)

- **Severity:** Medium
- **Risk:** Ambiguous grants. Reviewers pick the wrong verb; drift between similar keys.
- **Impact:** Cosmetic for existing keys; naming clarity for new keys.
- **Migration complexity:** Low (governance only, no runtime change).
- **Backward compatibility:** Preserved.
- **Runtime impact:** None.
- **Evidence:** `settings.branch.update`, `settings.catalog.update`,
  `settings.org.update`, `settings.pricing.update` vs `settings.edit`,
  `patients.edit`, etc.
- **Recommended action:** Freeze on `edit` for new keys. Do **not**
  rename existing `settings.*.update` keys — that would break parity.

---

## D-02  `.manage` umbrella verbs

- **Severity:** Medium
- **Risk:** Hides CRUD behind one grant; blocks SoD for
  alert-suppression and integrations.
- **Impact:** Affects `inventory.alerts.manage`,
  `settings.integrations.manage`.
- **Migration complexity:** Medium (add 4 keys per umbrella, update
  bundles, deprecate umbrella, shadow-probe).
- **Backward compatibility:** Preserved (additive; umbrella kept until
  deprecation window closes).
- **Runtime impact:** Additive only.
- **Recommended action:** Deferred until after Phase C. Split into
  standard 4-tuple per §D-01 protocol.

---

## D-03  Redundant `reports.*` umbrella across every bundle

- **Severity:** Low
- **Risk:** Every bundle carries both `reports.view/export` and the five
  `reports_<domain>.view/export` — parity noise, extra rows.
- **Impact:** Removing the umbrella prunes 6 rows × 8 bundles = ~48 rows.
- **Migration complexity:** Low.
- **Backward compatibility:** Requires shim (`replaced_by`).
- **Runtime impact:** None (`reports_*` already provide identical
  authority in every bundle).
- **Recommended action:** Deferred until after Phase C. Mark
  `deprecated=true`, `replaced_by='reports_operational.view'` (etc.),
  then follow §8 deprecation protocol.

---

## D-04  `purchase_orders` catalog skeleton

- **Severity:** High (for anyone enabling procurement)
- **Risk:** Only `purchase_orders.receive` exists. No view/create/edit/
  delete/approve. Any real PO UI has to fall back to a coarser gate
  (`inventory.edit`), which violates SoD (creator ≠ approver ≠ receiver).
- **Impact:** Blocks procurement rollout for any tenant that enforces
  SoD (audited healthcare groups, hospital chains).
- **Migration complexity:** Medium (5 new keys + bundle mapping).
- **Backward compatibility:** Preserved (purely additive).
- **Runtime impact:** Additive.
- **Recommended action:** Add
  `purchase_orders.view/create/edit/delete/approve` in a future
  migration. Grant to `admin` and `manager` at minimum.

---

## D-05  `hr.*` flatness (no sub-resources)

- **Severity:** High
- **Risk:** `hr.edit` today implies edit rights over staff **and**
  payroll **and** performance **and** attendance. Impossible to enforce
  payroll-officer role without granting identity edits.
- **Impact:** Blocks any deployment with segregated HR functions.
- **Migration complexity:** High (split into `hr.staff.*`,
  `hr.attendance.*`, `hr.leave.*`, `hr.payroll.*`, `hr.performance.*`
  with parity shim on `hr.*`).
- **Backward compatibility:** Requires shim during migration
  (`hr.edit` implies each new `<sub>.edit` for one deprecation window).
- **Runtime impact:** Additive during migration.
- **Recommended action:** Deferred until after Phase C, guarded by a
  parity shadow-probe slice.

---

## D-06  1:1 role↔bundle mapping

- **Severity:** Medium
- **Risk:** Every new role requires a bespoke bundle. Cannot compose
  `bundle.finance.viewer + bundle.patients.viewer` into an
  `insurance_officer`. Cross-clinic role portability is manual copy.
- **Impact:** Scales linearly with (roles × tenants).
- **Migration complexity:** Medium (introduce compositional bundles via
  `authz_bundle_implies`; no schema change).
- **Backward compatibility:** Preserved (`bundle.role.*` names retained
  as thin composers).
- **Runtime impact:** None (reducer already flattens).
- **Recommended action:** Governance change, scheduled after Phase C.

---

## D-07  Accountant grants `settings.view` purely to pass route gate

- **Severity:** Low
- **Risk:** Documented workaround in `src/lib/rolePermissions.ts`. New
  reviewers may take it as licence to grant broader settings access.
- **Impact:** Cosmetic; no over-privilege at data layer (RLS still
  gates writes).
- **Migration complexity:** Low (introduce a narrower gate permission
  like `settings.pricing.view` and update `PermissionRoute`).
- **Backward compatibility:** Preserved.
- **Runtime impact:** Behavioural if the fix touches `PermissionRoute`
  — **not permitted** under current constraints. Deferred until the
  Phase C moratorium on runtime edits lifts.

---

## D-08  Legacy `MODULES` array in `src/lib/rolePermissions.ts`

- **Severity:** Medium
- **Risk:** New modules require a code edit in a fallback file; easy to
  forget. The list has already drifted from `authz_permissions.group_key`
  (missing `purchase_orders`, `physio`, etc.).
- **Impact:** Legacy path only. Canonical runtime is unaffected.
- **Migration complexity:** Removed by Phase C.
- **Backward compatibility:** Preserved.
- **Runtime impact:** None while Phase C is blocked; removed with Phase C.
- **Recommended action:** No action. Item closes automatically at Phase C.

---

## D-09  Scope suffixes documented but unused

- **Severity:** Low
- **Risk:** N1 documents `.own/.branch/.org/.global` qualifiers that
  the runtime cannot enforce. Contributors may add them prematurely.
- **Impact:** Would break parity if used today.
- **Migration complexity:** Low for governance (guard rail in
  `scripts/authz/check_rpc_manifest.py`). High if enforced (requires
  scope-aware decision function).
- **Backward compatibility:** Preserved.
- **Runtime impact:** None.
- **Recommended action:** Naming guidelines §5 forbids their use in
  keys today. Enforcement work scheduled after scope decision function
  design.

---

## D-10  Bundle naming embeds role identity (`bundle.role.<role>`)

- **Severity:** Low
- **Risk:** Discourages compositional bundles.
- **Impact:** Cosmetic.
- **Migration complexity:** Low.
- **Backward compatibility:** Preserved.
- **Runtime impact:** None.
- **Recommended action:** Introduce `bundle.<domain>.<capability>` for
  new bundles; keep existing names to avoid churn.

---

## D-11  `reports_*` catalog missing `reports_operational.view` in some non-admin bundles

- **Severity:** Low
- **Risk:** Sub-report grants scattered inconsistently across bundles;
  auditors flag "why does receptionist not see any reports?".
- **Impact:** Cosmetic — actual permission decisions are correct per
  role charter.
- **Migration complexity:** Low.
- **Backward compatibility:** Preserved (add-only).
- **Runtime impact:** Additive — would grant new reads. **Requires
  business sign-off before change.**
- **Recommended action:** Documented, not scheduled.

---

## D-12  Two enforcement planes for scope (RLS vs catalog)

- **Severity:** Medium
- **Risk:** Branch/own scope enforced by RLS policies; catalog carries
  only `default_scope` metadata. A reviewer reading the catalog cannot
  infer what the database will actually let through.
- **Impact:** Confuses onboarding and audit.
- **Migration complexity:** High (either lift scope into the catalog or
  document the RLS-per-permission mapping in a machine-readable file).
- **Backward compatibility:** Preserved.
- **Runtime impact:** None if documentation-only.
- **Recommended action:** Ship a `docs/auth/SCOPE_ENFORCEMENT_MAP.md`
  cross-reference as part of Phase O documentation work. No runtime
  change.

---

## Summary

| ID | Severity | Blocks Phase C? | Blocks multi-specialty SaaS? |
|---|---|---|---|
| D-01 | Medium | No | No |
| D-02 | Medium | No | No |
| D-03 | Low | No | No |
| D-04 | High | No | Yes for procurement-heavy tenants |
| D-05 | High | No | Yes for SoD-audited tenants |
| D-06 | Medium | No | Yes at scale |
| D-07 | Low | No | No |
| D-08 | Medium | Closes with Phase C | No |
| D-09 | Low | No | No |
| D-10 | Low | No | No |
| D-11 | Low | No | No |
| D-12 | Medium | No | No |

**None of these debts block Phase C legacy retirement.** They block
onboarding of specific commercial verticals (procurement, SoD-audited
HR, per-tenant role composition) and are sequenced accordingly in the
refactor backlog.
