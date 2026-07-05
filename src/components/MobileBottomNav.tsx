import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Calendar, FileText, ListChecks } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const isMobile = useIsMobile();
  const { t } = useI18n();
  const { authz } = useAuthorization();
  if (!isMobile) return null;

  const items = [
    { to: "/", icon: LayoutDashboard, label: t("dashboard"), end: true, show: true },
    { to: "/patients", icon: Users, label: t("patients"), show: authz.can("patients.view") },
    { to: "/calendar", icon: Calendar, label: t("calendar"), show: authz.can("appointments.view") },
    { to: "/invoices", icon: FileText, label: t("invoices"), show: authz.can("invoices.view") },
    { to: "/queue", icon: ListChecks, label: t("queue"), show: authz.can("appointments.view") },
  ].filter(i => i.show);

  return (
    <nav
      aria-label={t("menu")}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border h-16 flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]"
    >
      {items.map(it => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) => cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium min-w-0 transition-colors",
            isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <it.icon className="size-5 shrink-0" aria-hidden />
          <span className="truncate max-w-full px-1">{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}