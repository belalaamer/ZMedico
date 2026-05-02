import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatMoney } from "@/lib/format";
import { StatCard, ReportPageHeader } from "./_shared";
import { DollarSign, Users, CalendarDays, FileWarning, BarChart3, Briefcase, Stethoscope, Boxes, ClipboardList } from "lucide-react";

export default function ReportsDashboard() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [stats, setStats] = useState({ revenue: 0, patients: 0, appts: 0, pending: 0 });

  useEffect(() => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    (async () => {
      let pq = supabase.from("payments").select("amount").gte("payment_date", monthStart);
      if (currentBranchId) pq = pq.eq("branch_id", currentBranchId);
      const { data: pays } = await pq;
      const revenue = (pays ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0);

      let ptq = supabase.from("patients").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", monthStart);
      if (currentBranchId) ptq = ptq.eq("branch_id", currentBranchId);
      const { count: patients } = await ptq;

      let aq = supabase.from("appointments").select("id", { count: "exact", head: true }).gte("scheduled_at", monthStart);
      if (currentBranchId) aq = aq.eq("branch_id", currentBranchId);
      const { count: appts } = await aq;

      let iq = supabase.from("invoices").select("id", { count: "exact", head: true }).in("status", ["pending", "partial"]);
      if (currentBranchId) iq = iq.eq("branch_id", currentBranchId);
      const { count: pending } = await iq;

      setStats({ revenue, patients: patients ?? 0, appts: appts ?? 0, pending: pending ?? 0 });
    })();
  }, [currentBranchId]);

  const links = [
    { to: "/reports/financial", icon: DollarSign, label: t("financialReports") },
    { to: "/reports/operational", icon: BarChart3, label: t("operationalReports") },
    { to: "/reports/medical", icon: Stethoscope, label: t("medicalReports") },
    { to: "/reports/hr", icon: Briefcase, label: t("hrReports") },
    { to: "/reports/inventory", icon: Boxes, label: t("inventoryReports") },
    { to: "/reports/scheduled", icon: ClipboardList, label: t("scheduledReports") },
  ];

  return (
    <div className="space-y-6">
      <ReportPageHeader title={t("reportsDashboard")} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("revenueThisMonth")} value={formatMoney(stats.revenue, lang)} />
        <StatCard label={t("patientsThisMonth")} value={stats.patients} />
        <StatCard label={t("appointmentsThisMonth")} value={stats.appts} />
        <StatCard label={t("pendingInvoices")} value={stats.pending} />
      </div>
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("quickReports")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {links.map((l) => (
            <Link key={l.to} to={l.to}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-6 flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <l.icon className="size-5 text-primary" />
                  </div>
                  <div className="font-medium">{l.label}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}