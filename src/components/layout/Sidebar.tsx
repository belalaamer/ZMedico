import { NavLink } from "react-router-dom";
import { LayoutDashboard, Calendar, Users, Bell, Wallet, Boxes, Settings, Stethoscope, Building2 } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { t, lang } = useI18n();
  const items = [
    { to: "/", icon: LayoutDashboard, label: t("dashboard"), end: true },
    { to: "/calendar", icon: Calendar, label: t("calendar"), badge: null },
    { to: "/patients", icon: Users, label: t("patients"), badge: null },
    { to: "/reminders", icon: Bell, label: t("reminders") },
    { to: "/finances", icon: Wallet, label: t("finances") },
    { to: "/inventory", icon: Boxes, label: t("inventory") },
    { to: "/branches", icon: Building2, label: t("branches") },
    { to: "/settings", icon: Settings, label: t("settings") },
  ];

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-e border-sidebar-border">
      <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border">
        <div className="size-9 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
          <Stethoscope className="size-5 text-white" />
        </div>
        <div>
          <div className="text-base font-bold text-white leading-tight">{t("appName")}</div>
          <div className="text-[11px] text-sidebar-foreground/70">{t("tagline")}</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-white text-sidebar-primary-foreground shadow-card"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
              )
            }
          >
            <it.icon className="size-[18px] shrink-0" />
            <span className="flex-1 truncate">{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-4 text-[11px] text-sidebar-foreground/60 border-t border-sidebar-border">
        v1.0 · {lang.toUpperCase()}
      </div>
    </aside>
  );
}