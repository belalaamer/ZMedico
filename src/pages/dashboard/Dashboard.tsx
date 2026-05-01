import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import {
  Wallet, Receipt, CalendarCheck, FileText, Clock, Users, UserPlus, Stethoscope, Inbox,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";

type ApptStatus = "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show" | "departed";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "hsl(var(--primary))",
  confirmed: "hsl(var(--info))",
  in_progress: "hsl(var(--warning))",
  completed: "hsl(var(--success))",
  cancelled: "hsl(var(--destructive))",
  no_show: "hsl(var(--muted-foreground))",
  departed: "hsl(var(--accent-foreground))",
};

function ageBucket(dob: string | null): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (age < 0 || age > 130) return null;
  if (age < 18) return "0-17";
  if (age < 30) return "18-29";
  if (age < 45) return "30-44";
  if (age < 60) return "45-59";
  return "60+";
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();

  const [loading, setLoading] = useState(true);
  const [todayAppts, setTodayAppts] = useState(0);
  const [apptStatusToday, setApptStatusToday] = useState<Record<string, number>>({});
  const [newPatientsToday, setNewPatientsToday] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [pendingInvoicesCount, setPendingInvoicesCount] = useState(0);
  const [pendingInvoicesAmount, setPendingInvoicesAmount] = useState(0);
  const [todayConsults, setTodayConsults] = useState(0);
  const [draftRecords, setDraftRecords] = useState(0);

  const [revenue7d, setRevenue7d] = useState<{ date: string; revenue: number }[]>([]);
  const [apptStatusAll, setApptStatusAll] = useState<{ name: string; value: number }[]>([]);
  const [ageGroups, setAgeGroups] = useState<{ name: string; value: number }[]>([]);

  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [recentAppts, setRecentAppts] = useState<any[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const todayDate = new Date().toISOString().slice(0, 10);
    const last7Start = new Date(); last7Start.setDate(last7Start.getDate() - 6); last7Start.setHours(0, 0, 0, 0);

    const branchEq = (q: any) => (currentBranchId ? q.eq("branch_id", currentBranchId) : q);

    const run = async () => {
      const [
        apptsTodayRes,
        newPtRes,
        payTodayRes,
        pendingInvRes,
        consultsRes,
        draftsRes,
        rev7Res,
        apptAllRes,
        ptAllRes,
        recentPtRes,
        recentApptRes,
        recentPayRes,
      ] = await Promise.all([
        branchEq(supabase.from("appointments").select("status")
          .gte("scheduled_at", start.toISOString()).lte("scheduled_at", end.toISOString())),
        branchEq(supabase.from("patients").select("id", { count: "exact", head: true })
          .gte("created_at", start.toISOString()).lte("created_at", end.toISOString())),
        branchEq(supabase.from("payments").select("amount").eq("payment_date", todayDate)),
        branchEq(supabase.from("invoices").select("total,paid_amount").in("status", ["pending", "partial"])),
        branchEq(supabase.from("medical_records").select("id", { count: "exact", head: true }).eq("visit_date", todayDate)),
        branchEq(supabase.from("medical_records").select("id", { count: "exact", head: true }).eq("status", "draft")),
        branchEq(supabase.from("payments").select("payment_date,amount").gte("payment_date", last7Start.toISOString().slice(0, 10))),
        branchEq(supabase.from("appointments").select("status").gte("scheduled_at", last7Start.toISOString())),
        branchEq(supabase.from("patients").select("dob")),
        branchEq(supabase.from("patients").select("id,first_name_en,first_name_ar,last_name_en,last_name_ar,phone,created_at")
          .order("created_at", { ascending: false }).limit(5)),
        branchEq(supabase.from("appointments").select("id,scheduled_at,status,patient:patients(first_name_en,first_name_ar,last_name_en,last_name_ar),doctor:profiles!appointments_doctor_id_fkey(full_name)")
          .order("created_at", { ascending: false }).limit(5)),
        branchEq(supabase.from("payments").select("id,amount,payment_method,payment_date,patient:patients(first_name_en,first_name_ar,last_name_en,last_name_ar)")
          .order("created_at", { ascending: false }).limit(5)),
      ]);
      if (cancelled) return;

      const apptRows = (apptsTodayRes.data ?? []) as { status: string }[];
      setTodayAppts(apptRows.length);
      const sb: Record<string, number> = {};
      for (const r of apptRows) sb[r.status] = (sb[r.status] ?? 0) + 1;
      setApptStatusToday(sb);

      setNewPatientsToday(newPtRes.count ?? 0);

      setTodayRevenue((payTodayRes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0));

      const inv = (pendingInvRes.data ?? []) as any[];
      setPendingInvoicesCount(inv.length);
      setPendingInvoicesAmount(inv.reduce((s, r) => s + (Number(r.total || 0) - Number(r.paid_amount || 0)), 0));

      setTodayConsults(consultsRes.count ?? 0);
      setDraftRecords(draftsRes.count ?? 0);

      // Last 7 days revenue
      const buckets = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        buckets.set(d.toISOString().slice(0, 10), 0);
      }
      for (const r of (rev7Res.data ?? []) as any[]) {
        const k = String(r.payment_date).slice(0, 10);
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + Number(r.amount || 0));
      }
      setRevenue7d(Array.from(buckets, ([date, revenue]) => ({ date: date.slice(5), revenue })));

      // Appt by status (last 7 days)
      const stCount: Record<string, number> = {};
      for (const r of (apptAllRes.data ?? []) as any[]) stCount[r.status] = (stCount[r.status] ?? 0) + 1;
      setApptStatusAll(Object.entries(stCount).map(([name, value]) => ({ name, value })));

      // Patient ages
      const ageMap = new Map<string, number>([["0-17", 0], ["18-29", 0], ["30-44", 0], ["45-59", 0], ["60+", 0]]);
      for (const r of (ptAllRes.data ?? []) as any[]) {
        const b = ageBucket(r.dob);
        if (b) ageMap.set(b, (ageMap.get(b) ?? 0) + 1);
      }
      setAgeGroups(Array.from(ageMap, ([name, value]) => ({ name, value })));

      setRecentPatients(recentPtRes.data ?? []);
      setRecentAppts(recentApptRes.data ?? []);
      setRecentPayments(recentPayRes.data ?? []);

      setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [currentBranchId]);

  const isEmpty = useMemo(() =>
    !loading && todayAppts === 0 && newPatientsToday === 0 && todayRevenue === 0 &&
    pendingInvoicesCount === 0 && todayConsults === 0 && draftRecords === 0 &&
    recentPatients.length === 0 && recentAppts.length === 0 && recentPayments.length === 0 &&
    revenue7d.every((r) => r.revenue === 0) && apptStatusAll.length === 0,
  [loading, todayAppts, newPatientsToday, todayRevenue, pendingInvoicesCount, todayConsults, draftRecords, recentPatients, recentAppts, recentPayments, revenue7d, apptStatusAll]);

  const fullName = (r: any) => {
    if (!r) return "—";
    const en = [r.first_name_en, r.last_name_en].filter(Boolean).join(" ");
    const ar = [r.first_name_ar, r.last_name_ar].filter(Boolean).join(" ");
    return lang === "ar" ? (ar || en || "—") : (en || ar || "—");
  };

  const StatCard = ({ label, value, sub, icon: Icon, tone, to, subValue }: any) => (
    <Card className="p-4 shadow-card border-border/60 hover:shadow-elegant transition-shadow">
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className={`size-8 rounded-lg bg-gradient-to-br ${tone} text-white flex items-center justify-center`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums">{loading ? <Skeleton className="h-7 w-24" /> : value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{loading ? <Skeleton className="h-3 w-20" /> : sub}</div>}
      {subValue !== undefined && !loading && (
        <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">{subValue}</div>
      )}
      {to && !loading && (
        <Button asChild variant="ghost" size="sm" className="mt-2 -ml-2 h-7 px-2 text-xs">
          <Link to={to}>→</Link>
        </Button>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("dashboard")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("tagline")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild><Link to="/patients">{t("addPatient")}</Link></Button>
          <Button asChild variant="outline"><Link to="/calendar">{t("newAppointment")}</Link></Button>
          <Button asChild variant="outline"><Link to="/invoices">{t("createInvoice")}</Link></Button>
        </div>
      </div>

      {isEmpty ? (
        <Card className="p-10 text-center shadow-card border-border/60">
          <div className="mx-auto size-14 rounded-2xl bg-muted flex items-center justify-center">
            <Inbox className="size-7 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-xl font-semibold">{t("noDataYet")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("noDataYetDesc")}</p>
          <div className="mt-5 flex justify-center gap-2 flex-wrap">
            <Button asChild><Link to="/patients">{t("addPatient")}</Link></Button>
            <Button asChild variant="outline"><Link to="/calendar">{t("newAppointment")}</Link></Button>
            <Button asChild variant="outline"><Link to="/invoices">{t("createInvoice")}</Link></Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
            <StatCard
              label={t("todayAppointments")} value={todayAppts}
              sub={`${apptStatusToday.completed ?? 0} ${t("statusCompleted")} · ${apptStatusToday.scheduled ?? 0} ${t("statusScheduled")}`}
              icon={CalendarCheck} tone="from-primary to-primary-glow" to="/calendar"
            />
            <StatCard
              label={t("newPatientsToday")} value={newPatientsToday}
              icon={UserPlus} tone="from-info to-info" to="/patients"
            />
            <StatCard
              label={t("todayRevenue")} value={formatMoney(todayRevenue, lang)}
              icon={Wallet} tone="from-success to-success" to="/payments"
            />
            <StatCard
              label={t("pendingInvoices")} value={pendingInvoicesCount}
              subValue={`${t("pendingAmount")}: ${formatMoney(pendingInvoicesAmount, lang)}`}
              icon={Receipt} tone="from-warning to-warning" to="/invoices"
            />
            <StatCard
              label={t("todaysConsultations")} value={todayConsults}
              icon={Stethoscope} tone="from-primary-glow to-primary" to="/medical/quick-consult"
            />
            <StatCard
              label={t("pendingRecords")} value={draftRecords}
              icon={FileText} tone="from-warning to-warning" to="/medical/records"
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="p-5 shadow-card border-border/60 lg:col-span-2">
              <div className="text-sm font-medium mb-3">{t("revenueLast7Days")}</div>
              {loading ? <Skeleton className="h-56 w-full" /> : (
                <div className="h-56">
                  <ResponsiveContainer>
                    <LineChart data={revenue7d}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => formatMoney(Number(v), lang)} />
                      <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-5 shadow-card border-border/60">
              <div className="text-sm font-medium mb-3">{t("appointmentsByStatus")}</div>
              {loading ? <Skeleton className="h-56 w-full" /> : apptStatusAll.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">{t("noDataYet")}</div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={apptStatusAll} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
                        {apptStatusAll.map((e, i) => (
                          <Cell key={i} fill={STATUS_COLORS[e.name] ?? "hsl(var(--primary))"} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5 shadow-card border-border/60">
            <div className="text-sm font-medium mb-3">{t("patientsByAge")}</div>
            {loading ? <Skeleton className="h-56 w-full" /> : (
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={ageGroups}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="p-5 shadow-card border-border/60">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium flex items-center gap-2"><Users className="size-4" /> {t("recentPatients2")}</div>
                <Button asChild variant="ghost" size="sm"><Link to="/patients">→</Link></Button>
              </div>
              {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />) :
                recentPatients.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">{t("noDataYet")}</div> :
                <ul className="divide-y divide-border">
                  {recentPatients.map((p) => (
                    <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/patients/${p.id}`} className="font-medium text-sm hover:underline truncate block">{fullName(p)}</Link>
                        <div className="text-xs text-muted-foreground truncate">{p.phone || "—"}</div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.created_at, lang)}</div>
                    </li>
                  ))}
                </ul>
              }
            </Card>

            <Card className="p-5 shadow-card border-border/60">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium flex items-center gap-2"><CalendarCheck className="size-4" /> {t("recentAppointments")}</div>
                <Button asChild variant="ghost" size="sm"><Link to="/calendar">→</Link></Button>
              </div>
              {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />) :
                recentAppts.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">{t("noDataYet")}</div> :
                <ul className="divide-y divide-border">
                  {recentAppts.map((a) => (
                    <li key={a.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{fullName(a.patient)}</div>
                        <div className="text-xs text-muted-foreground truncate">{a.doctor?.full_name || "—"}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">{formatDateTime(a.scheduled_at, lang)}</div>
                        <Badge variant="outline" className="text-[10px] mt-1">{t(`status${a.status?.charAt(0).toUpperCase() + a.status?.slice(1).replace(/_(.)/g, (_: any, c: string) => c.toUpperCase())}` as any) ?? a.status}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              }
            </Card>

            <Card className="p-5 shadow-card border-border/60">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium flex items-center gap-2"><Wallet className="size-4" /> {t("recentPayments")}</div>
                <Button asChild variant="ghost" size="sm"><Link to="/payments">→</Link></Button>
              </div>
              {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />) :
                recentPayments.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">{t("noDataYet")}</div> :
                <ul className="divide-y divide-border">
                  {recentPayments.map((p) => (
                    <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{fullName(p.patient)}</div>
                        <div className="text-xs text-muted-foreground truncate">{p.payment_method} · {formatDate(p.payment_date, lang)}</div>
                      </div>
                      <div className="font-semibold text-sm tabular-nums text-success whitespace-nowrap">{formatMoney(p.amount, lang)}</div>
                    </li>
                  ))}
                </ul>
              }
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
