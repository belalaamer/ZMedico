import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { LayoutDashboard, Calendar, Users, Bell, Boxes, Settings, Stethoscope, Building2, FileText, CreditCard, Receipt, Banknote, Package, FolderTree, Truck, BarChart3, ClipboardList, AlertTriangle, HeartPulse, Pill, Activity, Zap, FolderOpen, Briefcase, UserCog, Clock, CalendarDays, DollarSign, Star, PieChart } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";

export function SidebarContent({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { pathname } = useLocation();
  const [alertCount, setAlertCount] = useState(0);
  const { can, isAdmin } = usePermissions();
  const inventoryOpen = pathname.startsWith("/inventory");
  const medicalOpen = pathname.startsWith("/medical");
  const hrOpen = pathname.startsWith("/hr");

  useEffect(() => {
    let q = supabase.from("stock_alerts").select("*", { count: "exact", head: true }).eq("is_resolved", false);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    q.then(({ count }) => setAlertCount(count ?? 0));
    const ch = supabase.channel("inv-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_alerts" }, () => {
        let q2 = supabase.from("stock_alerts").select("*", { count: "exact", head: true }).eq("is_resolved", false);
        if (currentBranchId) q2 = q2.eq("branch_id", currentBranchId);
        q2.then(({ count }) => setAlertCount(count ?? 0));
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentBranchId]);

  const allItems = [
    { to: "/", icon: LayoutDashboard, label: t("dashboard"), end: true, show: true },
    { to: "/calendar", icon: Calendar, label: t("calendar"), show: can("appointments") },
    { to: "/patients", icon: Users, label: t("patients"), show: can("patients") },
    { to: "/invoices", icon: FileText, label: t("invoices"), show: can("invoices") },
    { to: "/payments", icon: CreditCard, label: t("payments"), show: can("invoices") },
    { to: "/treasury", icon: Banknote, label: t("treasury"), show: can("treasury") },
    { to: "/expenses", icon: Receipt, label: t("expenses"), show: can("treasury") },
    { to: "/reports", icon: PieChart, label: t("reports"), show: can("reports") },
    { to: "/reminders", icon: Bell, label: t("reminders"), show: can("appointments") },
    { to: "/branches", icon: Building2, label: t("branches"), show: isAdmin },
    { to: "/settings", icon: Settings, label: t("settings"), show: can("settings") },
  ];
  const items = allItems.filter(i => i.show);
  const topItems = items.filter(i => i.to !== "/branches" && i.to !== "/settings");
  const tailItems = items.filter(i => i.to === "/branches" || i.to === "/settings");
  const inventoryItems = !can("inventory") ? [] : [
    { to: "/inventory/stock", icon: BarChart3, label: t("stockOverview") },
    { to: "/inventory/products", icon: Package, label: t("products") },
    { to: "/inventory/categories", icon: FolderTree, label: t("categories") },
    { to: "/inventory/suppliers", icon: Truck, label: t("suppliers") },
    { to: "/inventory/purchase-orders", icon: ClipboardList, label: t("purchaseOrders") },
    { to: "/inventory/alerts", icon: AlertTriangle, label: t("alerts"), badge: alertCount },
  ];
  const medicalItems = !can("medical_records") ? [] : [
    { to: "/medical/records", icon: FileText, label: t("medicalRecords") },
    { to: "/medical/quick-consult", icon: Zap, label: t("quickConsult") },
    { to: "/medical/prescriptions", icon: Pill, label: t("prescriptions") },
    { to: "/medical/documents", icon: FolderOpen, label: t("documentsCenter") },
    { to: "/medical/specialties", icon: Stethoscope, label: t("specialties") },
    { to: "/medical/diagnoses", icon: HeartPulse, label: t("diagnoses") },
    { to: "/medical/medications", icon: Pill, label: t("medications") },
    ...(isAdmin ? [{ to: "/medical/procedures", icon: Activity, label: t("proceduresCatalog") }] : []),
  ];
  const hrItems = !can("hr") ? [] : [
    { to: "/hr/staff", icon: UserCog, label: t("staffDirectory") },
    { to: "/hr/departments", icon: Building2, label: t("departments") },
    { to: "/hr/positions", icon: Briefcase, label: t("positions") },
    { to: "/hr/schedules", icon: CalendarDays, label: t("schedules") },
    { to: "/hr/attendance", icon: Clock, label: t("attendance") },
    { to: "/hr/leaves", icon: FileText, label: t("leaves") },
    { to: "/hr/payroll", icon: DollarSign, label: t("payroll") },
    { to: "/hr/performance", icon: Star, label: t("performance") },
  ];

  return (
    <div className="flex w-full h-full flex-col bg-sidebar text-sidebar-foreground">
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
        {topItems.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={onNavigate}
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

        {/* Inventory section */}
        {inventoryItems.length > 0 && <div className="pt-2">
          <div className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold",
            inventoryOpen ? "text-white" : "text-sidebar-foreground/80"
          )}>
            <Boxes className="size-[18px] shrink-0" />
            <span className="flex-1 truncate">{t("inventoryHub")}</span>
            {alertCount > 0 && (
              <span className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 py-0.5 font-bold">{alertCount}</span>
            )}
          </div>
          <div className="ms-3 ps-3 border-s border-sidebar-border/40 mt-1 space-y-1">
            {inventoryItems.map((it) => (
              <NavLink key={it.to} to={it.to} onClick={onNavigate}
                className={({ isActive }) => cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                  isActive ? "bg-white text-sidebar-primary-foreground shadow-card" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                )}>
                <it.icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{it.label}</span>
                {it.badge && it.badge > 0 ? (
                  <span className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 py-0.5 font-bold">{it.badge}</span>
                ) : null}
              </NavLink>
            ))}
          </div>
        </div>}

        {/* Medical section */}
        {medicalItems.length > 0 && <div className="pt-2">
          <div className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold",
            medicalOpen ? "text-white" : "text-sidebar-foreground/80"
          )}>
            <Stethoscope className="size-[18px] shrink-0" />
            <span className="flex-1 truncate">{t("medical")}</span>
          </div>
          <div className="ms-3 ps-3 border-s border-sidebar-border/40 mt-1 space-y-1">
            {medicalItems.map((it) => (
              <NavLink key={it.to} to={it.to} onClick={onNavigate}
                className={({ isActive }) => cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                  isActive ? "bg-white text-sidebar-primary-foreground shadow-card" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                )}>
                <it.icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{it.label}</span>
              </NavLink>
            ))}
          </div>
        </div>}

        {/* HR section */}
        {hrItems.length > 0 && <div className="pt-2">
          <div className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold",
            hrOpen ? "text-white" : "text-sidebar-foreground/80"
          )}>
            <UserCog className="size-[18px] shrink-0" />
            <span className="flex-1 truncate">{t("hr")}</span>
          </div>
          <div className="ms-3 ps-3 border-s border-sidebar-border/40 mt-1 space-y-1">
            {hrItems.map((it) => (
              <NavLink key={it.to} to={it.to} onClick={onNavigate}
                className={({ isActive }) => cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                  isActive ? "bg-white text-sidebar-primary-foreground shadow-card" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                )}>
                <it.icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{it.label}</span>
              </NavLink>
            ))}
          </div>
        </div>}

        {tailItems.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mt-1",
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
    </div>
  );
}

export function Sidebar() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return null;
  }

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-e border-sidebar-border h-screen sticky top-0">
      <SidebarContent />
    </aside>
  );
}