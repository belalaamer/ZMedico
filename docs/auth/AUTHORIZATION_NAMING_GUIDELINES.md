# Authorization Naming Guidelines

**Status:** Governance document. Non-binding on existing keys until a
future migration pass; **binding on all new permissions** added to
`authz_permissions` from this document's activation forward.

**Non-goal:** this document does not change any existing permission key,
bundle mapping, or runtime decision. Legacy fallback and canonical
runtime remain byte-identical.

---

## 1. Grammar

```
<group>.<resource>.<verb>[.<qualifier>]
```

- `<group>` — business domain from the catalog (§3).
- `<resource>` — noun the verb operates on. Omit only when the group **is** the resource (`queue.call`, `hr.view` while HR remains flat).
- `<verb>` — from the closed vocabulary (§4). No synonyms.
- `<qualifier>` — optional scope or state modifier from §5.

All lowercase. `snake_case` inside segments. Dots between segments.
Approved abbreviations: `po`, `rx`, `hr`, `sms`, `wa`, `pdf`, `tx`.

---

## 2. Non-negotiable rules

1. **No wildcards.** Never `patients.*`, never `all`, never `manage` as a
   catch-all verb. `.manage` is grandfathered only for
   `inventory.alerts.manage` and `settings.integrations.manage`; no new
   `.manage` keys.
2. **No role names in permission keys.** `admin.only`, `doctor.override` — forbidden. Role coupling lives in `authz_role_bundles`.
3. **No specialty names in permission keys.** `physio.*`, `dental.*`,
   `derma.*`, `radiology.*`, `lab.*` — forbidden as top-level groups.
   Model as `clinical_case.*` or `chart.*` and let a specialty column
   on the underlying row select behavior.
4. **No umbrella nouns.** `misc.*`, `other.*`, `general.*`, `access.*`,
   `control.*` — forbidden.
5. **One verb per meaning.** Prefer `edit` over `update`. Prefer
   `create` over `write`. Prefer `delete` over `remove`. The catalog
   currently has both `edit` and `update`; new keys use `edit`.
6. **CRUD symmetry.** A new resource ships with the full 5-tuple
   (`view`, `create`, `edit`, `delete`, `export`) unless a documented
   exception applies (e.g. read-only report resources ship
   `view` + `export`).
7. **Additive migrations only.** Renames go through
   `deprecated=true` + `replaced_by=<new_key>`, never in-place edits.
   Bundles are updated in the same migration so parity holds.

---

## 3. Group registry (allowed `group_key` values)

`appointments`, `clinical`, `finance`, `hr`, `inventory`, `patients`,
`reports`, `settings` (as-shipped).

Future additions (governance-approved before use):
`queue`, `prescriptions`, `communication`, `notifications`, `security`,
`system`, `integrations`, `dashboard`, `saas_billing`, `audit`.

Every new group must be added to this list in the same PR as the first
permission that uses it.

---

## 4. Closed verb vocabulary

**Core CRUD (mandatory for every new resource):**

| Verb | Meaning |
|---|---|
| `view` | Read row or list |
| `create` | Insert row |
| `edit` | Mutate existing row |
| `delete` | Hard or soft delete |
| `export` | Bulk read + download |

**Workflow / state verbs (only when semantically distinct from edit):**

| Verb | Meaning |
|---|---|
| `approve` / `reject` | Workflow decision |
| `submit` | Send for approval |
| `cancel` / `void` | Terminal state that is not delete |
| `close` / `reopen` | Period control |
| `sign` / `amend` | Immutability transition |
| `assign` / `unassign` | Link/unlink |
| `refund` | Reverse a paid movement |
| `transfer` | Move between accounts |
| `receive` | Inventory receiving |
| `dispense` | Regulated Rx handoff |
| `run` / `pay` | Payroll two-step |
| `import` | Bulk create |
| `print` | Physical/PDF output |
| `configure` | Change domain-level settings |
| `send` | Trigger outbound comms |

**Forbidden verbs:** `manage`, `control`, `access`, `all`, `misc`,
`other`, `handle`, `do`, `perform`, `read` (use `view`), `write` (use
`create` or `edit`), `remove` (use `delete`).

Any verb outside this list requires a governance ADR before catalog
insertion.

---

## 5. Qualifier vocabulary (scope readiness)

Reserved for future scope enforcement. Do **not** add these to keys
today; the runtime cannot yet enforce them and adding them would break
parity.

| Qualifier | Meaning |
|---|---|
| `.own` | Only rows caller owns |
| `.branch` | Only rows in caller's branches |
| `.org` | Any row in caller's tenant |
| `.global` | Any row across tenants (platform tooling only) |
| `.draft` / `.posted` / `.paid` / `.void` / `.closed` | State-restricted |
| `.self` | Applies to caller's own subject row |
| `.controlled` | Regulated subset (controlled Rx) |
| `.override.<rule>` | Bypass a specific business rule |

Enforcement plane: `authz_permissions.default_scope` today; suffix-based
resolution after the scope migration described in the refactor backlog.

---

## 6. Interaction with `default_scope`

Every new permission row must set `default_scope` explicitly. Allowed
values: `own`, `branch`, `org`, `global`. Absence of a scope suffix on
the key means "apply `default_scope`".

---

## 7. Bundle naming

- `bundle.role.<role>` — role bundle (current pattern).
- `bundle.<domain>.<capability>` — compositional bundle. Recommended for
  new work: `bundle.finance.viewer`, `bundle.clinical.writer`,
  `bundle.reports.exporter`.

Composition happens in `authz_bundle_implies` (child → parent). No new
runtime is required — the reducer already flattens.

---

## 8. Deprecation protocol (parity-safe)

1. Insert new key(s) into `authz_permissions`.
2. Add new key(s) to every bundle that already grants the old key.
3. Set `deprecated=true` and `replaced_by=<new_key>` on the old key.
4. Ship shadow-probe assertion that decisions with the old key match
   decisions with the new key.
5. After 30 clean production days, remove the old key from bundles.
6. After a further 30 clean days, delete the deprecated row.

Never skip step 2. Never edit a live key in place.

---

## 9. Anti-patterns (rejected on review)

- `patients.manage` — use CRUD 5-tuple.
- `admin.everything` — role in key.
- `physio.sessions.create` — specialty in key.
- `settings.all` — wildcard.
- `invoices.doStuff` — non-vocabulary verb.
- `PATIENTS.VIEW` — uppercase.
- `patient.view` — singular where plural is established.
- `view.patients` — verb-first.

---

## 10. Review checklist for new permissions

- [ ] Grammar matches §1.
- [ ] Group in approved list §3.
- [ ] Verb in closed set §4.
- [ ] Not on the forbidden list §9.
- [ ] `default_scope` set explicitly.
- [ ] `risk_level` set (`low` / `medium` / `high` / `critical`).
- [ ] CRUD symmetry satisfied (or exception documented).
- [ ] Bundle updates included in same migration.
- [ ] Shadow-probe expected-expansion row added if the permission gates
      a route or a `<Can>` component.

A permission that fails any box does not merge.
