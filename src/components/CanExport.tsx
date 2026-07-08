import { ReactNode } from "react";
import { Can } from "@/components/Can";

/**
 * Thin alias over <Can action="export"> for readability at call sites that
 * gate PDF/print/download/CSV/XLSX buttons. Prefer this over ad-hoc
 * super-admin identity checks, so that export permission is centrally
 * managed via AuthorizationService + rolePermissions.ts.
 */
export function CanExport({ module, children, fallback = null }: { module: string; children: ReactNode; fallback?: ReactNode }) {
  return (
    <Can module={module} action="export" fallback={fallback}>
      {children}
    </Can>
  );
}