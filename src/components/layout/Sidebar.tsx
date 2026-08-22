import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Calendar, Users, Bell, Boxes, Settings, Stethoscope, Building2, FileText, CreditCard, Receipt, Banknote, Package, FolderTree, Truck, BarChart3, ClipboardList, AlertTriangle, HeartPulse, Pill, Activity, Zap, FolderOpen, Briefcase, UserCog, Clock, CalendarDays, DollarSign, Star, Target, Ticket, ListChecks, ChevronDown, Wallet, ScrollText, Percent, type LucideIcon } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { subscribeResilient } from "@/lib/realtime";
import { useBranch } from "@/contexts/BranchContext";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { visibleReportNavigation, type ReportNavigationKey } from "@/lib/reportNavigation";

type NavItem = { to: string; icon: LucideIcon; label: string; end?: boolean; badge?: number };

const REPORT_ICONS: Record<ReportNavigationKey, LucideIcon> = {
  financial: DollarSign,
  operational: BarChart3,
  medical: Stethoscope,
  hr: Briefcase,
  inventory: Boxes,
  scheduled: ClipboardList,
  commissions: Percent,
  doctorPerformance: Target,
};

export function SidebarContent({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { t, lang } = useI18n();
  const { currentBranchId, isModuleEnabled } = useBranch();
  const { pathname } = useLocation();
  const [alertCount, setAlertCount] = useState(0);
  const { authz } = useAuthorization();

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
  const reportItems = useMemo(() => {
    const labels: Record<ReportNavigationKey, string> = {
      financial: t("financialReports"),
      operational: t("operationalReports"),
      medical: t("medicalReports"),
      hr: t("hrReports"),
      inventory: t("inventoryReports"),
      scheduled: t("scheduledReports"),
      commissions: t("doctorCommissions"),
      doctorPerformance: t("doctorPerformance"),
    };
    return visibleReportNavigation((permission) => authz.can(permission)).map((item) => ({
      to: item.to,
      icon: REPORT_ICONS[item.key],
      label: labels[item.key],
    }));
  }, [authz, t]);

  const groups: { key: string; label: string; icon: LucideIcon; items: NavItem[]; badge?: number }[] = useMemo(() => [
    {
      key: "clinic_operations",
      label: lang === "ar" ? "تشغيل العيادة" : "Clinic Operations",
      icon: Stethoscope,
      items: [
        authz.can("appointments.view") && { to: "/calendar", icon: Calendar, label: t("calendar") },
        authz.can("leads.view") && { to: "/leads", icon: Target, label: lang === "ar" ? "العملاء المحتملون" : "Leads" },
        authz.can("appointments.view") && { to: "/queue", icon: ListChecks, label: t("queue") },
        authz.can("appointments.view") && { to: "/queue/audit", icon: ScrollText, label: lang === "ar" ? "تدقيق الطابور" : "Queue Audit" },
        authz.can("patients.view") && { to: "/patients", icon: Users, label: t("patients") },
        authz.can("appointments.view") && { to: "/reminders", icon: Bell, label: t("notifications") },
        authz.can("medical_records.view") && { to: "/medical/records", icon: FileText, label: t("medicalRecords") },
        authz.can("medical_records.view") && { to: "/medical/quick-consult", icon: Zap, label: t("quickConsult") },
        authz.can("medical_records.view") && { to: "/medical/prescriptions", icon: Pill, label: t("prescriptions") },
        authz.can("medical_records.view") && { to: "/medical/documents", icon: FolderOpen, label: t("documentsCenter") },
        authz.can("medical_records.view") && { to: "/medical/specialties", icon: Stethoscope, label: t("specialties") },
        authz.can("medical_records.view") && { to: "/medical/diagnoses", icon: HeartPulse, label: t("diagnoses") },
        authz.can("medical_records.view") && { to: "/medical/medications", icon: Pill, label: t("medications") },
        authz.can("medical_records.view") && { to: "/medical/procedures", icon: Activity, label: t("proceduresCatalog") },
      ].filter(Boolean) as NavItem[],
    },
    {
      key: "physio",
      label: lang === "ar" ? "العلاج الطبيعي" : "Physiotherapy",
      icon: Activity,
      items: !isModuleEnabled("physio") ? [] : [
        authz.can("medical_records.view") && { to: "/physio", icon: Activity, label: lang === "ar" ? "الحالات" : "Cases" },
        authz.can("medical_records.view") && { to: "/physio/dashboard", icon: BarChart3, label: lang === "ar" ? "لوحة العلاج الطبيعي" : "Physio Dashboard" },
        authz.can("medical_records.view") && { to: "/physio/reports", icon: FileText, label: lang === "ar" ? "التقارير" : "Reports" },
        authz.can("medical_records.view") && { to: "/physio/followups", icon: ListChecks, label: lang === "ar" ? "المتابعات" : "Follow-ups" },
      ].filter(Boolean) as NavItem[],
    },
    {
      key: "finance",
      label: lang === "ar" ? "المالية" : "Finance",
      icon: Wallet,
      items: [
        authz.can("invoices.view") && { to: "/invoices", icon: FileText, label: t("invoices") },
        authz.can("invoices.view") && { to: "/payments", icon: CreditCard, label: t("payments") },
        authz.can("coupons.view") && { to: "/coupons", icon: Ticket, label: lang === "ar" ? "الكوبونات" : "Coupons" },
        authz.can("treasury.view") && { to: "/treasury", icon: Banknote, label: t("treasury") },
        authz.can("treasury.view") && { to: "/expenses", icon: Receipt, label: t("expenses") },
      ].filter(Boolean) as NavItem[],
    },
    {
      key: "reports",
      label: lang === "ar" ? "التقارير" : "Reports",
      icon: BarChart3,
      items: reportItems,
    },
    {
      key: "inventory",
      label: t("inventoryHub"),
      icon: Boxes,
      badge: alertCount,
      items: !isModuleEnabled("inventory") || !authz.can("inventory.view") ? [] : [
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
      label: lang === "ar" ? "الموارد البشرية" : "HR & Staff",
      icon: UserCog,
      items: !isModuleEnabled("hr") || !authz.can("hr.view") ? [] : [
        { to: "/hr/staff", icon: UserCog, label: t("staffDirectory") },
        { to: "/hr/departments", icon: Building2, label: t("departments") },
        { to: "/hr/positions", icon: Briefcase, label: t("positions") },
        { to: "/hr/schedules", icon: CalendarDays, label: t("schedules") },
        { to: "/hr/attendance", icon: Clock, label: t("attendance") },
        { to: "/hr/leaves", icon: FileText, label: t("leaves") },
        { to: "/hr/payroll", icon: DollarSign, label: t("payroll") },
        // Same "hr" module permission as the rest of this group. Was not
        // reachable from anywhere in the UI before.
        { to: "/hr/pending-commissions", icon: Percent, label: lang === "ar" ? "العمولات المستحقة" : "Pending Commissions" },
        { to: "/hr/performance", icon: Star, label: t("performance") },
        { to: "/hr/target-bonuses", icon: Target, label: lang === "ar" ? "أهداف ومكافآت" : "Target Bonuses" },
      ],
    },
    {
      key: "setup",
      label: lang === "ar" ? "الإعداد والإدارة" : "Setup & Admin",
      icon: Settings,
      items: [
        authz.holdsAnyRole("system_owner") && { to: "/platform", icon: Building2, label: lang === "ar" ? "إدارة المنصة" : "Platform Console" },
        authz.isSuperAdmin() && { to: "/branches", icon: Building2, label: t("branches") },
        // Same adminOnly gate as /branches (and the same audience the existing
        // "Branch dashboard" quick-link inside Branches.tsx already targets),
        // surfaced directly instead of one extra click deep.
        authz.isSuperAdmin() && { to: "/branches/dashboard", icon: LayoutDashboard, label: lang === "ar" ? "لوحة الفرع" : "Branch Dashboard" },
        authz.isSuperAdmin() && { to: "/settings", icon: Settings, label: t("settings") },
      ].filter(Boolean) as NavItem[],
    },
  ].filter(g => g.items.length > 0), [t, lang, authz, alertCount, reportItems, isModuleEnabled]);

  const platformOnly = pathname.startsWith("/platform") && authz.holdsAnyRole("system_owner");
  const visibleGroups = platformOnly ? groups.filter((group) => group.key === "setup") : groups;

  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const activeGroupKey = useMemo(() => {
    return visibleGroups.find(g => g.items.some(it => pathname === it.to || pathname.startsWith(it.to + "/")))?.key ?? null;
  }, [visibleGroups, pathname]);

  useEffect(() => {
    if (!activeGroupKey) return;
    setOpenMap(prev => {
      if (prev[activeGroupKey]) return prev;
      return { ...prev, [activeGroupKey]: true };
    });
  }, [pathname, activeGroupKey]);
  const toggle = (k: string) => setOpenMap(m => ({ ...m, [k]: !m[k] }));

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 min-h-16 items-center gap-3 border-b border-sidebar-border px-4 sm:px-5">
        <div className="size-9 rounded-xl bg-sidebar-accent flex items-center justify-center">
          <Stethoscope className="size-5 text-sidebar-accent-foreground" />
        </div>
        <div>
          <div className="text-base font-bold text-sidebar-primary leading-tight">{t("appName")}</div>
          <div className="text-[11px] text-sidebar-foreground/70">{t("tagline")}</div>
        </div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-3 sm:py-4 space-y-3 sm:space-y-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavLink
          to={dashboardItem.to}
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors touch-manipulation",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-s-2 border-sidebar-primary rounded-s-none"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground font-medium"
            )
          }
        >
          <LayoutDashboard className="size-[18px] shrink-0" />
          <span className="flex-1 truncate">{dashboardItem.label}</span>
        </NavLink>

            {visibleGroups.map((g) => {
          const isOpen = !!openMap[g.key];
          return (
            <div key={g.key} className="space-y-1">
              <button
                type="button"
                onClick={() => toggle(g.key)}
                aria-expanded={isOpen}
                aria-controls={`group-${g.key}`}
                className="w-full min-h-11 flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wide text-sidebar-foreground/60 hover:text-sidebar-accent-foreground transition-colors"
              >
                <g.icon className="size-3.5 shrink-0 opacity-70" />
                <span className="flex-1 truncate text-start">{g.label}</span>
                {g.badge && g.badge > 0 ? (
                  <span className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 py-0.5 font-bold">{g.badge}</span>
                ) : null}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 opacity-60 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    isOpen ? "rotate-180" : "rotate-0"
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
                  <div className="space-y-1 pt-1">
                    {g.items.map((it) => (
                      <NavLink key={it.to} to={it.to} onClick={onNavigate} tabIndex={isOpen ? 0 : -1}
                        className={({ isActive }) => cn(
                          "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150 touch-manipulation",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-s-2 border-sidebar-primary rounded-s-none"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground font-medium"
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
      <div className="border-t border-sidebar-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] text-[11px] text-sidebar-foreground/60 sm:p-4">
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
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-e border-sidebar-border bg-sidebar h-dvh sticky top-0">
      <SidebarContent />
    </aside>
  );
}
