/**
 * Completed Vertical Slices — permanent registry.
 *
 * A slice enters this registry ONLY after its Migration 2 (cutover) has
 * shipped and the objective exit criteria in `v_authz_shadow_exit_criteria`
 * returned `ready_for_cutover = true`.
 *
 * For every entry with `status: "complete"`, the CI invariant test
 * (`completedSlices.invariant.test.ts`) enforces — permanently — that:
 *
 *   1. No legacy authorization pattern from `forbiddenLegacyPatterns`
 *      appears anywhere inside `ownedPaths`.
 *   2. Every write-capable UI surface inside `ownedPaths` gates on the
 *      canonical NEW permission keys listed in `canonicalKeys` (any-of).
 *   3. No duplicate authorization path (legacy `<Can module=...>` OR
 *      `usePermissions().can(module, action)` for `moduleGuardsForbidden`
 *      modules) survives inside `ownedPaths`.
 *
 * A PR that reintroduces a legacy path in a completed slice MUST fail CI.
 * This is an architectural invariant, not a migration artifact.
 */

export type CompletedSliceStatus = "shadow" | "complete";

export interface CompletedSlice {
  /** Slice identifier — matches `authz_shadow_slice_gate.slice`. */
  slice: string;
  /** `shadow` = registry entry present but invariant is inert.
   *  `complete` = invariant is actively enforced.               */
  status: CompletedSliceStatus;
  /** Root paths (relative to repo) that this slice owns.        */
  ownedPaths: string[];
  /** Canonical NEW permission keys that must gate writes.       */
  canonicalKeys: string[];
  /** Legacy authorization modules whose `can(module, ...)` and
   *  `<Can module="...">` usage must NOT survive inside owned
   *  paths after cutover.                                       */
  moduleGuardsForbidden: string[];
  /** Regex fragments — any match inside owned paths fails CI.
   *  Written as string sources so the test can compile them.    */
  forbiddenLegacyPatterns: { name: string; pattern: string; flags?: string }[];
  /** When the slice went `complete`. Documentation only.         */
  completedAt?: string;
  /** Free-form notes surfaced in test failures.                  */
  notes?: string;
}

/**
 * Registry. Add a slice here the same PR that ships its Migration 2.
 *
 * Settings slice is pre-registered in `shadow` status so the invariant
 * mechanism itself is exercised in CI today. Flipping `status` to
 * `"complete"` at cutover time activates enforcement — no other code
 * needs to change.
 */
export const COMPLETED_SLICES: readonly CompletedSlice[] = Object.freeze([
  {
    slice: "settings",
    status: "complete",
    completedAt: "2026-07-11",
    ownedPaths: ["src/pages/settings"],
    canonicalKeys: [
      "settings.org.update",
      "settings.branch.update",
      "settings.pricing.update",
      "settings.catalog.update",
      "settings.integrations.manage",
    ],
    moduleGuardsForbidden: ["settings"],
    forbiddenLegacyPatterns: [
      {
        name: "legacy usePermissions().can('settings', ...)",
        pattern: String.raw`\.can\(\s*['"\`]settings['"\`]\s*,`,
      },
      {
        name: "legacy <Can module=\"settings\" ...>",
        pattern: String.raw`<Can\s+[^>]*module\s*=\s*['"\`]settings['"\`]`,
      },
      {
        name: "direct write to identity/authorization tables — must go through settings_assign_user_role / settings_save_role_permissions",
        pattern: String.raw`\.from\(\s*['"\`](user_roles|role_permissions|employee_id_counter)['"\`]\s*\)\s*\.(update|insert|upsert|delete)\b`,
      },
    ],
    notes:
      "Settings vertical slice — Migration 2 complete. Identity/role assignment and role-permissions matrix writes must flow through the two canonical SECURITY DEFINER RPCs (settings_assign_user_role, settings_save_role_permissions). All other Settings writes remain under direct RLS (see docs/execution/M2_SETTINGS).",
  },
  {
    slice: "patients",
    status: "complete",
    completedAt: "2026-07-11",
    ownedPaths: ["src/pages/patients"],
    canonicalKeys: [
      "patients.view",
      "patients.create",
      "patients.edit",
      "patients.delete",
      "patients.export",
    ],
    moduleGuardsForbidden: ["patients"],
    forbiddenLegacyPatterns: [
      {
        name: "legacy usePermissions().can('patients', ...)",
        pattern: String.raw`\.can\(\s*['"\`]patients['"\`]\s*,`,
      },
      {
        name: "legacy <Can module=\"patients\" ...>",
        pattern: String.raw`<Can\s+[^>]*module\s*=\s*['"\`]patients['"\`]`,
      },
    ],
    notes:
      "Patients vertical slice — Migration 1 shadow. Flip status to 'complete' the same PR that lands Migration 2.",
  },
  {
    slice: "medical_records",
    status: "complete",
    completedAt: "2026-07-11",
    ownedPaths: ["src/pages/medical"],
    canonicalKeys: [
      "medical_records.view",
      "medical_records.create",
      "medical_records.edit",
      "medical_records.delete",
      "medical_records.export",
    ],
    moduleGuardsForbidden: ["medical_records"],
    forbiddenLegacyPatterns: [
      {
        name: "legacy usePermissions().can('medical_records', ...)",
        pattern: String.raw`\.can\(\s*['"\`]medical_records['"\`]\s*,`,
      },
      {
        name: "legacy <Can module=\"medical_records\" ...>",
        pattern: String.raw`<Can\s+[^>]*module\s*=\s*['"\`]medical_records['"\`]`,
      },
    ],
    notes:
      "Medical Records vertical slice — Migration 1 shadow. Flip status to 'complete' the same PR that lands Migration 2.",
  },
  {
    slice: "hr",
    status: "complete",
    completedAt: "2026-07-11",
    ownedPaths: ["src/pages/hr"],
    canonicalKeys: [
      "hr.view",
      "hr.create",
      "hr.edit",
      "hr.delete",
      "hr.export",
    ],
    moduleGuardsForbidden: ["hr"],
    forbiddenLegacyPatterns: [
      {
        name: "legacy usePermissions().can('hr', ...)",
        pattern: String.raw`\.can\(\s*['"\`]hr['"\`]\s*,`,
      },
      {
        name: "legacy <Can module=\"hr\" ...>",
        pattern: String.raw`<Can\s+[^>]*module\s*=\s*['"\`]hr['"\`]`,
      },
    ],
    notes:
      "HR vertical slice — Migration 1 shadow. Flip status to 'complete' the same PR that lands Migration 2.",
  },
  {
    slice: "invoices",
    status: "complete",
    completedAt: "2026-07-11",
    ownedPaths: ["src/pages/invoices", "src/pages/payments"],
    canonicalKeys: [
      "invoices.view",
      "invoices.create",
      "invoices.edit",
      "invoices.delete",
      "invoices.export",
    ],
    moduleGuardsForbidden: ["invoices"],
    forbiddenLegacyPatterns: [
      {
        name: "legacy usePermissions().can('invoices', ...)",
        pattern: String.raw`\.can\(\s*['"\`]invoices['"\`]\s*,`,
      },
      {
        name: "legacy <Can module=\"invoices\" ...>",
        pattern: String.raw`<Can\s+[^>]*module\s*=\s*['"\`]invoices['"\`]`,
      },
    ],
    notes:
      "Invoices / Finance vertical slice — Migration 1 shadow. Flip status to 'complete' the same PR that lands Migration 2.",
  },
]);

export function activeCompletedSlices(): CompletedSlice[] {
  return COMPLETED_SLICES.filter((s) => s.status === "complete");
}