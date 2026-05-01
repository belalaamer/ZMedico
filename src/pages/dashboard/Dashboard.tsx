import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Wallet, ArrowDownToLine, Receipt, CalendarCheck, Coins, PiggyBank, FileText, Clock } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

function formatEGP(n: number, lang: string) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    style: "currency", currency: "EGP", maximumFractionDigits: 2,
  }).format(n);
}

const metrics = [
  { key: "totalRevenue", value: 503751.99, growth: 1.5, icon: TrendingUp, tone: "from-primary to-primary-glow" },
  { key: "totalPayments", value: 312840.5, growth: 2.3, icon: Wallet, tone: "from-info to-info" },
  { key: "deposits", value: 88200, growth: 4.1, icon: ArrowDownToLine, tone: "from-success to-success" },
  { key: "additionalFees", value: 12450, growth: -0.6, icon: Receipt, tone: "from-warning to-warning" },
  { key: "fees", value: 9800, growth: 0.8, icon: Coins, tone: "from-primary-glow to-primary" },
  { key: "balance", value: 81461.49, growth: 3.2, icon: PiggyBank, tone: "from-success to-success" },
] as const;

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [todayCount, setTodayCount] = useState<number>(0);
  const [patientCount, setPatientCount] = useState<number>(0);
  const [todayRevenue, setTodayRevenue] = useState<number>(0);
  const [pendingInvoices, setPendingInvoices] = useState<number>(0);
  const [todayConsults, setTodayConsults] = useState<number>(0);
  const [draftRecords, setDraftRecords] = useState<number>(0);

  useEffect(() => {
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    let q = supabase.from("appointments").select("*", { count: "exact", head: true })
      .gte("scheduled_at", start.toISOString()).lte("scheduled_at", end.toISOString());
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    q.then(({ count }) => setTodayCount(count ?? 0));

    let pq = supabase.from("patients").select("*", { count: "exact", head: true });
    if (currentBranchId) pq = pq.eq("branch_id", currentBranchId);
    pq.then(({ count }) => setPatientCount(count ?? 0));

    let rq = supabase.from("payments").select("amount")
      .gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
    if (currentBranchId) rq = rq.eq("branch_id", currentBranchId);
    rq.then(({ data }) => setTodayRevenue((data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0)));

    let iq = supabase.from("invoices").select("*", { count: "exact", head: true }).in("status", ["pending", "partial"]);
    if (currentBranchId) iq = iq.eq("branch_id", currentBranchId);
    iq.then(({ count }) => setPendingInvoices(count ?? 0));

    const today = new Date().toISOString().slice(0, 10);
    let cq = supabase.from("medical_records").select("*", { count: "exact", head: true }).eq("visit_date", today);
    if (currentBranchId) cq = cq.eq("branch_id", currentBranchId);
    cq.then(({ count }) => setTodayConsults(count ?? 0));

    let dq = supabase.from("medical_records").select("*", { count: "exact", head: true }).eq("status", "draft");
    if (currentBranchId) dq = dq.eq("branch_id", currentBranchId);
    dq.then(({ count }) => setDraftRecords(count ?? 0));
  }, [currentBranchId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("dashboard")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("tagline")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild><Link to="/patients">{t("addPatient")}</Link></Button>
          <Button asChild variant="outline"><Link to="/calendar">{t("newAppointment")}</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        {metrics.map((m) => (
          <Card key={m.key} className="p-4 shadow-card border-border/60 hover:shadow-elegant transition-shadow">
            <div className="flex items-start justify-between">
              <div className="text-xs font-medium text-muted-foreground">{t(m.key as any)}</div>
              <div className={`size-8 rounded-lg bg-gradient-to-br ${m.tone} text-white flex items-center justify-center`}>
                <m.icon className="size-4" />
              </div>
            </div>
            <div className="mt-3 text-xl font-bold tabular-nums">{formatEGP(m.value, lang)}</div>
            <div className={`mt-1 text-[11px] font-medium ${m.growth >= 0 ? "text-success" : "text-destructive"}`}>
              {m.growth >= 0 ? "▲" : "▼"} {Math.abs(m.growth)}% {t("growth")}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-5 shadow-card border-border/60 hover:shadow-elegant transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-muted-foreground">{t("todayRevenue")}</div>
              <div className="mt-2 text-3xl font-bold tabular-nums text-success">{formatEGP(todayRevenue, lang)}</div>
              <div className="text-xs text-muted-foreground mt-1">{t("todayRevenueDesc")}</div>
            </div>
            <div className="size-11 rounded-xl bg-gradient-to-br from-success to-success text-white flex items-center justify-center">
              <Wallet className="size-5" />
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/payments">{t("payments")}</Link>
          </Button>
        </Card>

        <Card className="p-5 shadow-card border-border/60 hover:shadow-elegant transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-muted-foreground">{t("pendingInvoices")}</div>
              <div className="mt-2 text-3xl font-bold tabular-nums text-warning">{pendingInvoices}</div>
              <div className="text-xs text-muted-foreground mt-1">{t("pendingInvoicesDesc")}</div>
            </div>
            <div className="size-11 rounded-xl bg-gradient-to-br from-warning to-warning text-white flex items-center justify-center">
              <Clock className="size-5" />
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/invoices">{t("invoices")}</Link>
          </Button>
        </Card>

        <Card className="p-5 shadow-card border-border/60 hover:shadow-elegant transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-muted-foreground">{t("todaysConsultations")}</div>
              <div className="mt-2 text-3xl font-bold tabular-nums text-primary">{todayConsults}</div>
            </div>
            <div className="size-11 rounded-xl bg-gradient-to-br from-primary to-primary-glow text-white flex items-center justify-center">
              <FileText className="size-5" />
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/medical/quick-consult">{t("quickConsult")}</Link>
          </Button>
        </Card>

        <Card className="p-5 shadow-card border-border/60 hover:shadow-elegant transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-muted-foreground">{t("pendingRecords")}</div>
              <div className="mt-2 text-3xl font-bold tabular-nums text-warning">{draftRecords}</div>
            </div>
            <div className="size-11 rounded-xl bg-gradient-to-br from-info to-info text-white flex items-center justify-center">
              <Clock className="size-5" />
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/medical/records">{t("medicalRecords")}</Link>
          </Button>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5 shadow-card md:col-span-1 gradient-primary text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-white/15 flex items-center justify-center">
              <CalendarCheck className="size-5" />
            </div>
            <div>
              <div className="text-sm text-white/80">{t("todaySessions")}</div>
              <div className="text-3xl font-bold tabular-nums">{todayCount}</div>
            </div>
          </div>
          <Button asChild variant="secondary" size="sm" className="mt-4 bg-white/15 hover:bg-white/25 text-white border-0">
            <Link to="/calendar">{t("calendar")}</Link>
          </Button>
        </Card>

        <Card className="p-5 shadow-card md:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">{t("patients")}</div>
              <div className="text-3xl font-bold tabular-nums">{patientCount}</div>
            </div>
            <Badge variant="outline" className="status-progress">{t("statusInProgress")}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              { l: t("statusCompleted"), v: Math.max(0, Math.floor(patientCount * 0.62)), c: "status-completed" },
              { l: t("statusInProgress"), v: Math.max(0, Math.floor(patientCount * 0.28)), c: "status-progress" },
              { l: t("statusNoShow"), v: Math.max(0, Math.floor(patientCount * 0.10)), c: "status-departed" },
            ].map((s) => (
              <div key={s.l} className={`rounded-lg border px-3 py-3 ${s.c}`}>
                <div className="text-xs">{s.l}</div>
                <div className="text-lg font-semibold tabular-nums">{s.v}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}