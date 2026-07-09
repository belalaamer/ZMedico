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
    status: "shadow", // → flip to "complete" in the Migration 2 PR
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
        name: "direct RLS-bypassing write to settings tables (must go through canonical RPC)",
        pattern: String.raw`\.from\(\s*['"\`](clinic_profile|clinic_settings|branches|invoice_settings|appointment_settings|queue_settings|notification_settings|payment_methods|coupons|loyalty_settings|service_categories|services|procedures|departments|staff_positions|leave_types|medical_specialties|insurance_companies|insurance_contracts|communication_templates|whatsapp_templates|sms_templates|email_templates)['"\`]\s*\)\s*\.(update|insert|upsert|delete)\b`,
      },
    ],
    notes:
      "Settings vertical slice — Migration 1 shadow, Migration 2 cutover. Flip status to 'complete' the same PR that lands Migration 2.",
  },
]);

export function activeCompletedSlices(): CompletedSlice[] {
  return COMPLETED_SLICES.filter((s) => s.status === "complete");
}