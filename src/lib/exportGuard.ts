/**
 * Central export/print/download guard.
 *
 * Every export, print, and download entrypoint must call `assertCanExport`
 * before generating the artifact. This complements the UI-level `<CanExport>`
 * wrapper — it protects against direct code paths, keyboard shortcuts, and
 * programmatic callers that bypass the button gating.
 *
 * Callers pass the `can` function derived from AuthorizationService (see
 * `useAuthorization()` — the canonical authorization entry point). Server-side
 * RLS still enforces row access; this only prevents the client from packaging
 * data the user could otherwise browse into a downloadable artifact.
 */
export type CanFn = (module: string, action?: string) => boolean;

export class ExportForbiddenError extends Error {
  constructor(module: string) {
    super(`Export not permitted for module "${module}"`);
    this.name = "ExportForbiddenError";
  }
}

export function assertCanExport(can: CanFn | undefined, module: string): void {
  if (!can) return; // legacy callers — UI-level Can gating still applies
  if (!can(module, "export") && !can(module, "view")) {
    throw new ExportForbiddenError(module);
  }
  if (!can(module, "export")) {
    throw new ExportForbiddenError(module);
  }
}

export function canExport(can: CanFn, module: string): boolean {
  return can(module, "export");
}