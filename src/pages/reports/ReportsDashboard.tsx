import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { usePermissions } from "@/hooks/usePermissions";
import { formatMoney } from "@/lib/format";
import { StatCard, ReportPageHeader } from "./_shared";
import { DollarSign, Users, CalendarDays, FileWarning, BarChart3, Briefcase, Stethoscope, Boxes, ClipboardList, Percent, Award, Activity } from "lucide-react";

export default function ReportsDashboard() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { can } = usePermissions();
  const [stats, setStats] = useState({ revenue: 0, patients: 0, appts: 0, pending: 0 });

  useEffect(() => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    (async () => {
      let pq = supabase.from("payments").select("amount").is("deleted_at", null).gte("payment_date", monthStart);
      if (currentBranchId) pq = pq.eq("branch_id", currentBranchId);
      const { data: pays } = await pq;
      const revenue = (pays ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0);

      let ptq = supabase.from("patients").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", monthStart);
      if (currentBranchId) ptq = ptq.eq("branch_id", currentBranchId);
      const { count: patients } = await ptq;

      let aq = supabase.from("appointments").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("scheduled_at", monthStart);
      if (currentBranchId) aq = aq.eq("branch_id", currentBranchId);
      const { count: appts } = await aq;

      let iq = supabase.from("invoices").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["pending", "partial"]);
      if (currentBranchId) iq = iq.eq("branch_id", currentBranchId);
      const { count: pending } = await iq;

      setStats({ revenue, patients: patients ?? 0, appts: appts ?? 0, pending: pending ?? 0 });
    })();
  }, [currentBranchId]);

  const links = [
    { to: "/reports/financial", permission: "reports_finance.view", icon: DollarSign, label: t("financialReports"), desc: lang === "ar" ? "الإيرادات والمصروفات والتدفقات النقدية" : "Revenue, expenses, and cash flow" },
    { to: "/reports/operational", permission: "reports_operational.view", icon: BarChart3, label: t("operationalReports"), desc: lang === "ar" ? "أداء العيادة والإنتاجية اليومية" : "Clinic performance and daily productivity" },
    { to: "/reports/medical", permission: "reports_medical.view", icon: Stethoscope, label: t("medicalReports"), desc: lang === "ar" ? "التشخيصات والعلاجات والنتائج السريرية" : "Diagnoses, treatments, and clinical outcomes" },
    { to: "/reports/hr", permission: "reports_hr.view", icon: Briefcase, label: t("hrReports"), desc: lang === "ar" ? "الحضور والرواتب وأداء الموظفين" : "Attendance, payroll, and staff performance" },
    { to: "/reports/inventory", permission: "reports_inventory.view", icon: Boxes, label: t("inventoryReports"), desc: lang === "ar" ? "المخزون والحركة وتنبيهات النفاد" : "Stock levels, movement, and low-stock alerts" },
    { to: "/reports/scheduled", permission: "reports.view", icon: ClipboardList, label: t("scheduledReports"), desc: lang === "ar" ? "التقارير المجدولة والمهام الدورية" : "Automated recurring report deliveries" },
    { to: "/reports/commissions", permission: "reports_medical.view", icon: Percent, label: t("doctorCommissions"), desc: lang === "ar" ? "حساب عمولات الأطباء والمستحقات" : "Doctor commission calculations and payouts" },
    { to: "/reports/doctor-performance", permission: "reports_medical.view", icon: Award, label: t("doctorPerformance"), desc: lang === "ar" ? "مؤشرات أداء الأطباء والإنتاجية" : "Doctor productivity and performance KPIs" },
    { to: "/physio/reports", permission: "medical_records.view", icon: Activity, label: lang === "ar" ? "تقارير العلاج الطبيعي" : "Physiotherapy Reports", desc: lang === "ar" ? "جلسات العلاج الطبيعي وتقدم المرضى" : "Therapy sessions and patient progress" },
  ].filter((link) => {
    const [module, action] = link.permission.split(".");
    return can(module, action);
  });

  const kpis = [
    {
      label: t("revenueThisMonth"),
      value: formatMoney(stats.revenue, lang),
      icon: DollarSign,
      iconWrap: "bg-emerald-500/10 text-emerald-600",
      accent: "from-emerald-500/5 to-transparent",
    },
    {
      label: t("patientsThisMonth"),
      value: stats.patients,
      icon: Users,
      iconWrap: "bg-primary/10 text-primary",
      accent: "from-primary/5 to-transparent",
    },
    {
      label: t("appointmentsThisMonth"),
      value: stats.appts,
      icon: CalendarDays,
      iconWrap: "bg-sky-500/10 text-sky-600",
      accent: "from-sky-500/5 to-transparent",
    },
    {
      label: t("pendingInvoices"),
      value: stats.pending,
      icon: FileWarning,
      iconWrap: "bg-warning/15 text-warning-foreground",
      accent: "from-warning/10 to-transparent",
    },
  ];

  return (
    <div className="space-y-6">
      <ReportPageHeader title={t("reportsDashboard")} />
      <p className="text-sm text-muted-foreground -mt-4">
        {lang === "ar" ? "نظرة عامة على الشهر الحالي" : "Current month overview"}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className={`relative overflow-hidden bg-gradient-to-br ${k.accent} border-border/60`}>
            <CardContent className="pt-6 pb-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {k.label}
                  </div>
                  <div className="mt-2 text-2xl sm:text-3xl font-black tabular-nums leading-tight whitespace-nowrap truncate">
                    {k.value}
                  </div>
                </div>
                <div className={`size-11 shrink-0 rounded-xl flex items-center justify-center ${k.iconWrap}`}>
                  <k.icon className="size-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">{t("quickReports")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="group">
              <Card className="h-full cursor-pointer border-border/60 hover:-translate-y-1 hover:shadow-elegant hover:border-primary/30 transition-all duration-300">
                <CardContent className="pt-6 pb-5 flex items-start gap-4">
                  <div className="size-12 shrink-0 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <l.icon className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-base leading-tight group-hover:text-primary transition-colors">
                      {l.label}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {l.desc}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}