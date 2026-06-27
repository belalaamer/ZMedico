import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Calendar, Users, Bell, Boxes, Settings, Stethoscope, Building2, FileText, CreditCard, Receipt, Banknote, Package, FolderTree, Truck, BarChart3, ClipboardList, AlertTriangle, HeartPulse, Pill, Activity, Zap, FolderOpen, Briefcase, UserCog, Clock, CalendarDays, DollarSign, Star, PieChart, Award, Target, Ticket, ListChecks, ChevronDown, Wallet, ShieldCheck } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { subscribeResilient } from "@/lib/realtime";
import { useBranch } from "@/contexts/BranchContext";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";

type NavItem = { to: string; icon: any; label: string; end?: boolean; badge?: number };

export function SidebarContent({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { pathname } = useLocation();
  const [alertCount, setAlertCount] = useState(0);
  const { can, isAdmin } = usePermissions();

  useEffect(() => {
    const refresh = () => {
      let q2 = supabase.from("stock_alerts").select("*", { count: "exact", head: true }).eq("is_resolved", false);
      if (currentBranchId) q2 = q2.eq("branch_id", currentBranchId);
      q2.then(({ count }) => setAlertCount(count ?? 0));
    };
    refresh();
    return subscribeResilient({
      name: `inv-alerts:${currentBranchId ?? "all"}`,
      bind: (ch) => ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_alerts" },
        () => refresh()
      ),
      onReconnect: () => refresh(),
    });
  }, [currentBranchId]);

  const dashboardItem: NavItem = { to: "/", icon: LayoutDashboard, label: t("dashboard"), end: true };

  const groups: { key: string; label: string; icon: any; items: NavItem[]; badge?: number }[] = useMemo(() => [
    {
      key: "operations",
      label: lang === "ar" ? "العمليات" : "Operations",
      icon: Calendar,
      items: [
        can("appointments") && { to: "/calendar", icon: Calendar, label: t("calendar") },
        can("appointments") && { to: "/queue", icon: ListChecks, label: t("queue") },
        can("appointments") && { to: "/reminders", icon: Bell, label: t("notifications") },
      ].filter(Boolean) as NavItem[],
    },
    {
      key: "clinical",
      label: lang === "ar" ? "العيادة والمرضى" : "Patients & Clinical",
      icon: Stethoscope,
      items: [
        can("patients") && { to: "/patients", icon: Users, label: t("patients") },
        can("medical_records") && { to: "/medical/records", icon: FileText, label: t("medicalRecords") },
        can("medical_records") && { to: "/medical/quick-consult", icon: Zap, label: t("quickConsult") },
        can("medical_records") && { to: "/medical/prescriptions", icon: Pill, label: t("prescriptions") },
        can("medical_records") && { to: "/medical/documents", icon: FolderOpen, label: t("documentsCenter") },
        can("medical_records") && { to: "/physio", icon: Activity, label: t("physiotherapy") },
        can("medical_records") && { to: "/physio/dashboard", icon: Activity, label: lang === "ar" ? "لوحة العلاج الطبيعي" : "Physio dashboard" },
        can("medical_records") && { to: "/physio/reports", icon: FileText, label: lang === "ar" ? "تقارير العلاج الطبيعي" : "Physio reports" },
        can("medical_records") && { to: "/physio/followups", icon: Activity, label: lang === "ar" ? "متابعات العلاج الطبيعي" : "Physio follow-ups" },
        can("medical_records") && { to: "/medical/specialties", icon: Stethoscope, label: t("specialties") },
        can("medical_records") && { to: "/medical/diagnoses", icon: HeartPulse, label: t("diagnoses") },
        can("medical_records") && { to: "/medical/medications", icon: Pill, label: t("medications") },
        can("medical_records") && isAdmin && { to: "/medical/procedures", icon: Activity, label: t("proceduresCatalog") },
      ].filter(Boolean) as NavItem[],
    },
    {
      key: "finance",
      label: lang === "ar" ? "المالية" : "Finance",
      icon: Wallet,
      items: [
        can("invoices") && { to: "/invoices", icon: FileText, label: t("invoices") },
        can("invoices") && { to: "/payments", icon: CreditCard, label: t("payments") },
        can("treasury") && { to: "/treasury", icon: Banknote, label: t("treasury") },
        can("treasury") && { to: "/expenses", icon: Receipt, label: t("expenses") },
        can("coupons") && { to: "/coupons", icon: Ticket, label: lang === "ar" ? "الكوبونات" : "Coupons" },
        can("reports") && { to: "/reports", icon: PieChart, label: t("reports") },
        can("reports") && { to: "/reports/doctor-performance", icon: Award, label: t("doctorPerformance") },
        can("reports") && { to: "/reports/commissions", icon: Award, label: lang === "ar" ? "العمولات" : "Commissions" },
      ].filter(Boolean) as NavItem[],
    },
    {
      key: "inventory",
      label: t("inventoryHub"),
      icon: Boxes,
      badge: alertCount,
      items: !can("inventory") ? [] : [
        { to: "/inventory/stock", icon: BarChart3, label: t("stockOverview") },
        { to: "/inventory/products", icon: Package, label: t("products") },
        { to: "/inventory/categories", icon: FolderTree, label: t("categories") },
        { to: "/inventory/suppliers", icon: Truck, label: t("suppliers") },
        { to: "/inventory/purchase-orders", icon: ClipboardList, label: t("purchaseOrders") },
        { to: "/inventory/alerts", icon: AlertTriangle, label: t("alerts"), badge: alertCount },
      ],
    },
    {
      key: "hr",
      label: t("hr"),
      icon: UserCog,
      items: !can("hr") ? [] : [
        { to: "/hr/staff", icon: UserCog, label: t("staffDirectory") },
        { to: "/hr/departments", icon: Building2, label: t("departments") },
        { to: "/hr/positions", icon: Briefcase, label: t("positions") },
        { to: "/hr/schedules", icon: CalendarDays, label: t("schedules") },
        { to: "/hr/attendance", icon: Clock, label: t("attendance") },
        { to: "/hr/leaves", icon: FileText, label: t("leaves") },
        { to: "/hr/payroll", icon: DollarSign, label: t("payroll") },
        { to: "/hr/performance", icon: Star, label: t("performance") },
        { to: "/hr/target-bonuses", icon: Target, label: lang === "ar" ? "أهداف ومكافآت" : "Target Bonuses" },
      ],
    },
    {
      key: "admin",
      label: lang === "ar" ? "الإدارة" : "Admin",
      icon: ShieldCheck,
      items: [
        isAdmin && { to: "/branches", icon: Building2, label: t("branches") },
        can("settings") && { to: "/settings", icon: Settings, label: t("settings") },
      ].filter(Boolean) as NavItem[],
    },
  ].filter(g => g.items.length > 0), [t, lang, can, isAdmin, alertCount]);

  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const activeGroupKey = useMemo(() => {
    return groups.find(g => g.items.some(it => pathname === it.to || pathname.startsWith(it.to + "/")))?.key ?? null;
  }, [groups, pathname]);

  useEffect(() => {
    if (!activeGroupKey) return;
    setOpenMap(prev => {
      if (prev[activeGroupKey]) return prev;
      return { ...prev, [activeGroupKey]: true };
    });
  }, [pathname, activeGroupKey]);
  const toggle = (k: string) => setOpenMap(m => ({ ...m, [k]: !m[k] }));

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
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        <NavLink
          to={dashboardItem.to}
          end
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
          <LayoutDashboard className="size-[18px] shrink-0" />
          <span className="flex-1 truncate">{dashboardItem.label}</span>
        </NavLink>

        <div className="flex items-center justify-between px-2 pt-2 pb-1">
          <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">{lang === "ar" ? "التنقل" : "Navigation"}</span>
          <button
            type="button"
            onClick={() => {
              const anyOpen = groups.some(g => openMap[g.key]);
              const next: Record<string, boolean> = {};
              if (!anyOpen) groups.forEach(g => { next[g.key] = true; });
              setOpenMap(next);
            }}
            className="text-[10px] text-sidebar-foreground/60 hover:text-white"
          >
            {groups.some(g => openMap[g.key]) ? (lang === "ar" ? "طي الكل" : "Collapse all") : (lang === "ar" ? "فتح الكل" : "Expand all")}
          </button>
        </div>

        {groups.map((g) => {
          const isOpen = !!openMap[g.key];
          const hasActive = g.items.some(it => pathname === it.to || pathname.startsWith(it.to + "/"));
          return (
            <div key={g.key}>
              <button
                type="button"
                onClick={() => toggle(g.key)}
                aria-expanded={isOpen}
                aria-controls={`group-${g.key}`}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ease-out",
                  isOpen
                    ? "text-white bg-sidebar-accent/60 ring-1 ring-inset ring-white/10 shadow-sm"
                    : hasActive
                      ? "text-white bg-sidebar-accent/30"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-white"
                )}
              >
                <g.icon className="size-[18px] shrink-0" />
                <span className="flex-1 truncate text-start">{g.label}</span>
                {g.badge && g.badge > 0 ? (
                  <span className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 py-0.5 font-bold">{g.badge}</span>
                ) : null}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    isOpen ? "rotate-180 opacity-100" : "rotate-0 opacity-70"
                  )}
                />
              </button>
              <div
                id={`group-${g.key}`}
                role="region"
                aria-hidden={!isOpen}
                className={cn(
                  "grid transition-[grid-template-rows,opacity] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  isOpen
                    ? "grid-rows-[1fr] opacity-100 duration-300"
                    : "grid-rows-[0fr] opacity-0 duration-200"
                )}
              >
                <div className="overflow-hidden min-h-0">
                  <div className="ms-3 ps-3 border-s border-sidebar-border/40 mt-1 mb-1 space-y-1">
                    {g.items.map((it) => (
                      <NavLink key={it.to} to={it.to} onClick={onNavigate} tabIndex={isOpen ? 0 : -1}
                        className={({ isActive }) => cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150",
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
                </div>
              </div>
            </div>
          );
        })}
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
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-e border-sidebar-border h-dvh sticky top-0">
      <SidebarContent />
    </aside>
  );
}