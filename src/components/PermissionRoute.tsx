import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { moduleForPath } from "@/lib/rolePermissions";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { moduleKeyForPath, type ClinicModuleKey } from "@/lib/clinicModules";
import { ShieldAlert } from "lucide-react";
import { useSettingsShadowProbe } from "@/lib/authz/settingsShadowProbe";
import { usePatientsShadowProbe } from "@/lib/authz/patientsShadowProbe";
import { useMedicalRecordsShadowProbe } from "@/lib/authz/medicalRecordsShadowProbe";
import { useHrShadowProbe } from "@/lib/authz/hrShadowProbe";
import { useInvoicesShadowProbe } from "@/lib/authz/invoicesShadowProbe";

/**
 * Mounts the Settings shadow probe. Isolated in its own component so
 * PermissionRoute can conditionally render it for `/settings/*` paths
 * without violating the rules of hooks, and so the probe fires for the
 * required denied role even when the gate ultimately renders the
 * access-denied card. The probe is telemetry-only: it never renders
 * anything and never affects the authorization outcome.
 */
function SettingsShadowProbeMount({ path }: { path: string }) {
  useSettingsShadowProbe(path);
  return null;
}

/**
 * Mounts the Patients shadow probe. Same rationale as the Settings
 * mount above — telemetry-only, must fire for denied roles even when
 * the gate renders the access-denied card.
 */
function PatientsShadowProbeMount({ path }: { path: string }) {
  usePatientsShadowProbe(path);
  return null;
}

/**
 * Mounts the Medical Records shadow probe. Same rationale as the
 * Settings / Patients mounts — telemetry-only, must fire for denied
 * roles even when the gate renders the access-denied card.
 */
function MedicalRecordsShadowProbeMount({ path }: { path: string }) {
  useMedicalRecordsShadowProbe(path);
  return null;
}

/**
 * Mounts the HR shadow probe. Telemetry-only — fires for denied roles
 * as well so the negative_matrix_complete gate can turn green.
 */
function HrShadowProbeMount({ path }: { path: string }) {
  useHrShadowProbe(path);
  return null;
}

/**
 * Mounts the Invoices / Finance shadow probe. Telemetry-only — fires
 * for denied roles as well so the negative_matrix_complete gate can
 * turn green.
 */
function InvoicesShadowProbeMount({ path }: { path: string }) {
  useInvoicesShadowProbe(path);
  return null;
}

/**
 * Gates a route element based on the user's permission for the module
 * inferred from the current path. Admin always passes.
 */
export function PermissionRoute({ children, module, adminOnly, systemOwnerOnly }: { children: ReactNode; module?: string; adminOnly?: boolean; systemOwnerOnly?: boolean }) {
  const { pathname } = useLocation();
  const { authz, loading } = useAuthorization();
  const { t } = useI18n();
  const { currentBranchId, modulesLoading, isModuleEnabled } = useBranch();
  const mod = module ?? moduleForPath(pathname);
  const entitlement = moduleKeyForPath(pathname);
  const entitlementBlocked = Boolean(entitlement && currentBranchId && !isModuleEnabled(entitlement as ClinicModuleKey));
  // Shadow-probe telemetry for the Settings vertical slice. Mounted
  // regardless of the gate outcome so denied roles (e.g. staff) also
  // record shadow decisions — required for the slice's
  // negative_matrix_complete / at_least_one_denied_role_exercised gate.
  // Dedup inside the probe ensures no duplicate work when SettingsLayout
  // also mounts.
  const isSettingsPath = pathname.startsWith("/settings");
  const isPatientsPath = pathname.startsWith("/patients");
  const isMedicalPath = pathname.startsWith("/medical");
  const isHrPath = pathname.startsWith("/hr");
  const isInvoicesPath = pathname.startsWith("/invoices") || pathname.startsWith("/payments");

  if (loading || (currentBranchId && modulesLoading)) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="size-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" aria-hidden="true" />
          <span className="text-sm">{t("loadingPermissions")}</span>
        </div>
      </div>
    );
  }

  if (entitlementBlocked) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto size-14 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
            <ShieldAlert className="size-7" />
          </div>
          <h2 className="text-xl font-bold">{t("accessDenied")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("accessDeniedDescription")}
          </p>
        </div>
      </div>
    );
  }

  if (systemOwnerOnly) {
    if (authz.holdsAnyRole("system_owner")) {
      return children;
    }
  } else if (adminOnly) {
    if (authz.isSuperAdmin()) {
      return (
        <>
          {isSettingsPath ? <SettingsShadowProbeMount path={pathname} /> : null}
          {isPatientsPath ? <PatientsShadowProbeMount path={pathname} /> : null}
          {isMedicalPath ? <MedicalRecordsShadowProbeMount path={pathname} /> : null}
          {isHrPath ? <HrShadowProbeMount path={pathname} /> : null}
          {isInvoicesPath ? <InvoicesShadowProbeMount path={pathname} /> : null}
          {children}
        </>
      );
    }
  } else if (authz.isSuperAdmin()) {
    return (
      <>
        {isSettingsPath ? <SettingsShadowProbeMount path={pathname} /> : null}
        {isPatientsPath ? <PatientsShadowProbeMount path={pathname} /> : null}
        {isMedicalPath ? <MedicalRecordsShadowProbeMount path={pathname} /> : null}
        {isHrPath ? <HrShadowProbeMount path={pathname} /> : null}
        {isInvoicesPath ? <InvoicesShadowProbeMount path={pathname} /> : null}
        {children}
      </>
    );
  } else if (mod && authz.can(`${mod}.view`)) {
    // Deny by default: unmapped protected routes never fall through.
    return (
      <>
        {isSettingsPath ? <SettingsShadowProbeMount path={pathname} /> : null}
        {isPatientsPath ? <PatientsShadowProbeMount path={pathname} /> : null}
        {isMedicalPath ? <MedicalRecordsShadowProbeMount path={pathname} /> : null}
        {isHrPath ? <HrShadowProbeMount path={pathname} /> : null}
        {isInvoicesPath ? <InvoicesShadowProbeMount path={pathname} /> : null}
        {children}
      </>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      {isSettingsPath ? <SettingsShadowProbeMount path={pathname} /> : null}
      {isPatientsPath ? <PatientsShadowProbeMount path={pathname} /> : null}
      {isMedicalPath ? <MedicalRecordsShadowProbeMount path={pathname} /> : null}
      {isHrPath ? <HrShadowProbeMount path={pathname} /> : null}
      {isInvoicesPath ? <InvoicesShadowProbeMount path={pathname} /> : null}
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto size-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <ShieldAlert className="size-7" />
        </div>
        <h2 className="text-xl font-bold">
          {t("accessDenied")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("accessDeniedDescription")}
        </p>
      </div>
    </div>
  );
}