import { ReactNode, createContext, useContext } from "react";
import { NavLink } from "react-router-dom";
import { Settings, Building2, Calendar, FileText, CreditCard, Briefcase, Bell, Languages, ShieldCheck, Users, HardDrive, ScrollText, Info, GitBranch, Shield, FileSignature } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { useSettingsShadowProbe } from "@/lib/authz/settingsShadowProbe";
import { useLocation } from "react-router-dom";

// When true, child pages should skip rendering their own SettingsLayout chrome
// (used by the consolidated Communication hub which renders tabs instead).
const EmbeddedSettingsCtx = createContext(false);
export const EmbeddedSettingsProvider = EmbeddedSettingsCtx.Provider;
export const useEmbeddedSettings = () => useContext(EmbeddedSettingsCtx);

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const embedded = useEmbeddedSettings();
  const { t } = useI18n();
  // R2: admin-only settings items gated through the canonical service.
  const { authz } = useAuthorization("SettingsLayout");
  // Shadow-mode instrumentation. Never affects rendering or gating.
  const { pathname } = useLocation();
  useSettingsShadowProbe(pathname);
  if (embedded) return <>{children}</>;
  const showAdminSettings = authz.isSuperAdmin();
  const items = [
    { to: "/settings/general", icon: Building2, label: t("clinicProfile") },
    { to: "/settings/branches", icon: GitBranch, label: t("branches") },
    { to: "/settings/appointments", icon: Calendar, label: t("appointmentSettings") },
    { to: "/settings/invoices", icon: FileText, label: t("invoiceSettings") },
    { to: "/settings/payments", icon: CreditCard, label: t("paymentMethods") },
    { to: "/settings/services", icon: Briefcase, label: t("servicesMgmt") },
    { to: "/settings/insurance", icon: Shield, label: t("insuranceCompanies") },
    { to: "/settings/insurance-contracts", icon: FileSignature, label: t("insuranceContracts") },
    { to: "/settings/communication", icon: Bell, label: t("communicationHub") },
    { to: "/settings/languages", icon: Languages, label: t("languageSettings") },
    ...(showAdminSettings ? [
      { to: "/settings/roles", icon: ShieldCheck, label: t("rolePermissions") },
      { to: "/settings/users", icon: Users, label: t("userManagement") },
      { to: "/settings/backup", icon: HardDrive, label: t("backupExport") },
      { to: "/settings/audit", icon: ScrollText, label: t("auditLogs") },
    ] : []),
    { to: "/settings/system", icon: Info, label: t("systemInfo") },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      <aside className="space-y-1">
        <div className="flex items-center gap-2 px-2 py-3">
          <Settings className="size-5 text-primary" />
          <h2 className="text-lg font-bold">{t("settingsHub")}</h2>
        </div>
        <nav className="space-y-0.5">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to}
              className={({ isActive }) => cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
              )}>
              <it.icon className="size-4 shrink-0" />
              <span className="truncate">{it.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}