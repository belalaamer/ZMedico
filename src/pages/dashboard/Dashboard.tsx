import { useCallback, useEffect, useMemo, useState } from "react";
import { useDataSync } from "@/lib/dataSync";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import {
  Wallet, Receipt, CalendarCheck, FileText, Clock, Users, UserPlus, Stethoscope, Inbox, Landmark, ArrowDownUp, ArrowUpRight, Sparkles,
} from "lucide-react";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthorization } from "@/lib/authz/useAuthorization";
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

function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  // Role-aware composition (FINAL-03 UX audit): the Dashboard is reachable by
  // every authenticated role (see App.tsx route comment — no single
  // permission is held by all roles), so widget VISIBILITY here is gated on
  // the same authz.can(...) permission keys already used for navigation and
  // routing, not on a hardcoded role list. This keeps one Dashboard
  // implementation while each role only sees the sections relevant to their
  // actual responsibilities. This is presentation-only: every query below
  // already ran unconditionally for every role prior to this change, and
  // still does — Postgres RLS remains the sole data-authorization boundary.
  // Hiding a card here never substitutes for, or weakens, that boundary.
  const { authz } = useAuthorization("Dashboard");
  const canFinance = authz.can("invoices.view") || authz.can("treasury.view");
  const canTreasury = authz.can("treasury.view");
  const canFrontDeskIntake = authz.can("patients.create") || authz.can("appointments.create");
  const canClinical = authz.can("medical_records.view");
  const canOpsReports = authz.can("reports_operational.view");
  const canHR = authz.can("hr.view");

  const [loading, setLoading] = useState(true);
  const [todayAppts, setTodayAppts] = useState(0);
  const [myApptsToday, setMyApptsToday] = useState(0);
  const [apptStatusToday, setApptStatusToday] = useState<Record<string, number>>({});
  const [newPatientsToday, setNewPatientsToday] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [pendingInvoicesCount, setPendingInvoicesCount] = useState(0);
  const [pendingInvoicesAmount, setPendingInvoicesAmount] = useState(0);
  const [todayConsults, setTodayConsults] = useState(0);
  const [draftRecords, setDraftRecords] = useState(0);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState(0);

  // Treasury at-a-glance (today + last close)
  const [lastClose, setLastClose] = useState<{ business_date: string; counted_cash: number; variance: number } | null>(null);
  const [todayTreasuryIn, setTodayTreasuryIn] = useState(0);
  const [todayTreasuryOut, setTodayTreasuryOut] = useState(0);

  const [revenue7d, setRevenue7d] = useState<{ date: string; revenue: number }[]>([]);
  const [apptStatusAll, setApptStatusAll] = useState<{ name: string; value: number }[]>([]);
  const [ageGroups, setAgeGroups] = useState<{ name: string; value: number }[]>([]);
  const [referralGroups, setReferralGroups] = useState<{ name: string; value: number }[]>([]);
  const [doctorPerf, setDoctorPerf] = useState<{ name: string; value: number }[]>([]);
  const [topServices, setTopServices] = useState<{ name: string; count: number; revenue: number }[]>([]);

  // Date range for charts
  const [rangePreset, setRangePreset] = useState<"7d" | "30d" | "month" | "custom">("7d");
  const [rangeStart, setRangeStart] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10);
  });
  const [rangeEnd, setRangeEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const applyPreset = (p: "7d" | "30d" | "month" | "custom") => {
    setRangePreset(p);
    if (p === "custom") return;
    const end = new Date();
    const start = new Date();
    if (p === "7d") start.setDate(end.getDate() - 6);
    else if (p === "30d") start.setDate(end.getDate() - 29);
    else if (p === "month") start.setDate(1);
    setRangeStart(start.toISOString().slice(0, 10));
    setRangeEnd(end.toISOString().slice(0, 10));
  };

  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [recentAppts, setRecentAppts] = useState<any[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [doctorNames, setDoctorNames] = useState<Record<string, string>>({});

  const run = useCallback(async () => {
    setLoading(true);

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const todayDate = new Date().toISOString().slice(0, 10);
    const rs = new Date(rangeStart + "T00:00:00");
    const re = new Date(rangeEnd + "T23:59:59");

    const branchEq = (q: any) => (currentBranchId ? q.eq("branch_id", currentBranchId) : q);

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
        doctorApptRes,
        topItemsRes,
        pendingLeaveRes,
      ] = await Promise.all([
        branchEq(supabase.from("appointments").select("status,doctor_id")
          .is("deleted_at", null)
          .gte("scheduled_at", start.toISOString()).lte("scheduled_at", end.toISOString())),
        branchEq(supabase.from("patients").select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .gte("created_at", start.toISOString()).lte("created_at", end.toISOString())),
        branchEq(supabase.from("payments").select("amount").is("deleted_at", null).eq("payment_date", todayDate)),
        branchEq(supabase.from("invoices").select("total,paid_amount").is("deleted_at", null).in("status", ["pending", "partial"])),
        branchEq(supabase.from("medical_records").select("id", { count: "exact", head: true }).eq("visit_date", todayDate)),
        branchEq(supabase.from("medical_records").select("id", { count: "exact", head: true }).eq("status", "draft")),
        branchEq(supabase.from("payments").select("payment_date,amount").is("deleted_at", null)
          .gte("payment_date", rangeStart).lte("payment_date", rangeEnd)),
        branchEq(supabase.from("appointments").select("status").is("deleted_at", null).gte("scheduled_at", rs.toISOString()).lte("scheduled_at", re.toISOString())),
        branchEq(supabase.from("patients").select("dob,referral_source").is("deleted_at", null)),
        branchEq(supabase.from("patients").select("id,first_name_en,first_name_ar,last_name_en,last_name_ar,phone,created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(5)),
        branchEq(supabase.from("appointments").select("id,scheduled_at,status,doctor_id,patient:patients(first_name_en,first_name_ar,last_name_en,last_name_ar)")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(5)),
        branchEq(supabase.from("payments").select("id,amount,payment_method,payment_date,patient:patients(first_name_en,first_name_ar,last_name_en,last_name_ar)")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(5)),
        branchEq(supabase.from("appointments").select("doctor_id,status")
          .is("deleted_at", null)
          .gte("scheduled_at", rs.toISOString()).lte("scheduled_at", re.toISOString())
          .not("doctor_id", "is", null)),
        supabase.from("invoice_items").select("description_en,description_ar,quantity,total,invoice:invoices!inner(branch_id,invoice_date,deleted_at)")
          .is("invoice.deleted_at", null)
          .gte("invoice.invoice_date", rangeStart).lte("invoice.invoice_date", rangeEnd),
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);

      // Treasury (mirrors Treasury page: filter by treasury_id for this branch,
      // sum transaction_type income vs expense, exclude reversed expense pairs).
      const lastCloseRes = await branchEq(
        (supabase as any).from("treasury_daily_closes")
          .select("business_date,counted_cash,variance,branch_id")
          .order("business_date", { ascending: false })
          .limit(1)
      );
      const lc = (lastCloseRes?.data ?? [])[0] as any;
      setLastClose(lc ? { business_date: lc.business_date, counted_cash: Number(lc.counted_cash || 0), variance: Number(lc.variance || 0) } : null);

      let trQ = (supabase as any).from("treasury").select("id").is("deleted_at", null);
      if (currentBranchId) trQ = trQ.eq("branch_id", currentBranchId);
      const { data: trRows } = await trQ;
      const trIds = ((trRows ?? []) as any[]).map((r) => r.id);
      let tIn = 0, tOut = 0;
      if (trIds.length) {
        const { data: tt } = await (supabase as any).from("treasury_transactions")
          .select("transaction_type,amount,reference_type,reference_id,created_at")
          .in("treasury_id", trIds)
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString());
        const reversed = new Set(
          ((tt ?? []) as any[])
            .filter((r) => r.reference_type === "expense_reversal" && r.reference_id)
            .map((r) => r.reference_id as string)
        );
        const visible = ((tt ?? []) as any[]).filter((r) => {
          if (r.reference_type === "expense_reversal") return false;
          if (r.reference_type === "expense" && r.reference_id && reversed.has(r.reference_id)) return false;
          return true;
        });
        tIn  = visible.filter((r) => r.transaction_type === "income").reduce((s, r) => s + Number(r.amount || 0), 0);
        tOut = visible.filter((r) => r.transaction_type === "expense").reduce((s, r) => s + Number(r.amount || 0), 0);
      }
      setTodayTreasuryIn(tIn);
      setTodayTreasuryOut(tOut);

      const apptRows = (apptsTodayRes.data ?? []) as { status: string; doctor_id: string | null }[];
      setTodayAppts(apptRows.length);
      setMyApptsToday(user?.id ? apptRows.filter((r) => r.doctor_id === user.id).length : 0);
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
      setPendingLeaveRequests(pendingLeaveRes.count ?? 0);

      // Revenue over selected range
      const buckets = new Map<string, number>();
      const dayMs = 86400000;
      const startMs = new Date(rangeStart + "T00:00:00").getTime();
      const endMs = new Date(rangeEnd + "T00:00:00").getTime();
      const days = Math.max(1, Math.round((endMs - startMs) / dayMs) + 1);
      for (let i = 0; i < days; i++) {
        const d = new Date(startMs + i * dayMs);
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

      // Referral sources (top N + Unknown bucket). Light normalization only (trim + lowercase key).
      const refMap = new Map<string, { label: string; count: number }>();
      const unknownLabel = lang === "ar" ? "غير محدد" : "Unknown";
      for (const r of (ptAllRes.data ?? []) as any[]) {
        const raw = (r.referral_source ?? "").toString().trim();
        const key = raw ? raw.toLowerCase() : "__unknown__";
        const label = raw || unknownLabel;
        const cur = refMap.get(key) ?? { label, count: 0 };
        cur.count += 1;
        refMap.set(key, cur);
      }
      const sortedRefs = Array.from(refMap.values()).sort((a, b) => b.count - a.count);
      const topRefs = sortedRefs.slice(0, 6);
      const restRefs = sortedRefs.slice(6);
      // Merge tail into Unknown to keep chart readable
      if (restRefs.length) {
        const restTotal = restRefs.reduce((s, r) => s + r.count, 0);
        const existingIdx = topRefs.findIndex((r) => r.label === unknownLabel);
        if (existingIdx >= 0) topRefs[existingIdx].count += restTotal;
        else topRefs.push({ label: unknownLabel, count: restTotal });
      }
      setReferralGroups(topRefs.map((r) => ({ name: r.label, value: r.count })));

      setRecentPatients(recentPtRes.data ?? []);
      setRecentAppts(recentApptRes.data ?? []);
      setRecentPayments(recentPayRes.data ?? []);

      // Doctor performance over range
      const docCounts: Record<string, number> = {};
      for (const r of (doctorApptRes.data ?? []) as any[]) {
        if (!r.doctor_id) continue;
        docCounts[r.doctor_id] = (docCounts[r.doctor_id] ?? 0) + 1;
      }

      // Fetch doctor names for both recent appointments AND performance chart
      const doctorIds = Array.from(new Set([
        ...((recentApptRes.data ?? []) as any[]).map((a) => a.doctor_id),
        ...Object.keys(docCounts),
      ].filter(Boolean)));
      let nameMap: Record<string, string> = {};
      if (doctorIds.length) {
        const { data: docs } = await supabase.from("profiles").select("id,full_name").in("id", doctorIds);
        for (const d of (docs ?? []) as any[]) nameMap[d.id] = d.full_name ?? "";
        setDoctorNames(nameMap);
      } else {
        setDoctorNames({});
      }
      const perf = Object.entries(docCounts)
        .map(([id, value]) => ({ name: nameMap[id] || "—", value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
      setDoctorPerf(perf);

      // Top requested services from invoice items
      const svcMap = new Map<string, { count: number; revenue: number; ar?: string }>();
      for (const r of (topItemsRes.data ?? []) as any[]) {
        const inv = r.invoice;
        if (currentBranchId && inv?.branch_id && inv.branch_id !== currentBranchId) continue;
        const key = (lang === "ar" ? (r.description_ar || r.description_en) : (r.description_en || r.description_ar)) || "—";
        const cur = svcMap.get(key) ?? { count: 0, revenue: 0 };
        cur.count += Number(r.quantity || 0);
        cur.revenue += Number(r.total || 0);
        svcMap.set(key, cur);
      }
      setTopServices(Array.from(svcMap, ([name, v]) => ({ name, count: v.count, revenue: v.revenue }))
        .sort((a, b) => b.count - a.count).slice(0, 8));

      setLoading(false);
  }, [currentBranchId, rangeStart, rangeEnd, lang, user?.id]);

  // Initial load + refetch on branch change
  useEffect(() => { run(); }, [run]);

  // Refetch whenever any related data changes anywhere in the app, or on focus/visibility ("*")
  useDataSync(
    ["dashboard", "patients", "appointments", "invoices", "payments", "medical_records", "branches", "*"],
    () => { run(); },
  );

  // RBAC-07 fix: the empty-state check below predates the "Pending leave
  // requests" card added for hr.view holders and never accounted for it.
  // hr has no visibility into appointments/patients/invoices/payments (all
  // legitimately zero for that role via RLS), so every other counter here
  // was always zero for hr regardless of real HR activity -- meaning hr
  // would see the generic "No data yet" empty state instead of their own
  // dedicated card whenever there happened to be zero pending leave
  // requests, and would only ever see their card on days there IS a
  // pending request (an inconsistent, confusing experience). Adding the
  // `(!canHR || pendingLeaveRequests === 0)` clause so hr's own signal is
  // part of the emptiness decision, matching the treatment already given
  // to every other role-specific counter here.
  const isEmpty = useMemo(() =>
    !loading && todayAppts === 0 && newPatientsToday === 0 && todayRevenue === 0 &&
    pendingInvoicesCount === 0 && todayConsults === 0 && draftRecords === 0 &&
    recentPatients.length === 0 && recentAppts.length === 0 && recentPayments.length === 0 &&
    revenue7d.every((r) => r.revenue === 0) && apptStatusAll.length === 0 &&
    (!canHR || pendingLeaveRequests === 0),
  [loading, todayAppts, newPatientsToday, todayRevenue, pendingInvoicesCount, todayConsults, draftRecords, recentPatients, recentAppts, recentPayments, revenue7d, apptStatusAll, canHR, pendingLeaveRequests]);

  const fullName = (r: any) => {
    if (!r) return "—";
    const en = [r.first_name_en, r.last_name_en].filter(Boolean).join(" ");
    const ar = [r.first_name_ar, r.last_name_ar].filter(Boolean).join(" ");
    return lang === "ar" ? (ar || en || "—") : (en || ar || "—");
  };

  const StatCard = ({ label, value, sub, icon: Icon, tone, to, subValue }: any) => {
    const inner = (
      <>
        <div className="flex items-start justify-between">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className={`size-10 rounded-xl bg-gradient-to-br ${tone} text-white flex items-center justify-center shadow-sm`}>
            <Icon className="size-4" />
          </div>
        </div>
        <div className="mt-3 text-xl md:text-2xl font-bold tabular-nums truncate">{loading ? <Skeleton className="h-7 w-24" /> : value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{loading ? <Skeleton className="h-3 w-20" /> : sub}</div>}
        {subValue !== undefined && !loading && (
          <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">{subValue}</div>
        )}
      </>
    );
    const baseCls = "relative overflow-hidden rounded-2xl p-4 md:p-5 bg-card/90 shadow-card border-border/60 transition-all duration-200";
    if (to && !loading) {
      const ariaLabel = typeof label === "string"
        ? (value !== undefined && value !== null && value !== "" ? `${label}: ${value}` : label)
        : undefined;
      return (
        <Link
          to={to}
          aria-label={ariaLabel}
          className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Card className={`${baseCls} hover:-translate-y-0.5 hover:shadow-elegant hover:border-primary/40 cursor-pointer h-full`}>
            {inner}
          </Card>
        </Link>
      );
    }
    return <Card className={`${baseCls} hover:-translate-y-0.5 hover:shadow-elegant`}>{inner}</Card>;
  };

  return (
    <PullToRefresh onRefresh={run}>
    <div className="space-y-7 pb-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/75 p-5 md:p-7 text-primary-foreground shadow-elegant">
        <div className="absolute -end-10 -top-16 size-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
        <div className="absolute -bottom-24 start-1/3 size-48 rounded-full bg-black/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary-foreground/75 text-xs font-medium mb-3">
              <Sparkles className="size-4" aria-hidden="true" />
              <span>{lang === "ar" ? "نظرة سريعة على العيادة" : "Your clinic at a glance"}</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight">{t("dashboard")}</h1>
            <p className="text-sm md:text-base text-primary-foreground/80 mt-2 max-w-2xl">{t("tagline")}</p>
            <p className="text-xs text-primary-foreground/65 mt-4">{formatDate(new Date().toISOString(), lang)}</p>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
            {canFrontDeskIntake && <Button asChild className="bg-white text-primary hover:bg-white/90 shadow-sm"><Link to="/patients"><UserPlus className="size-4 me-2" />{t("addPatient")}</Link></Button>}
            <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Link to="/calendar"><CalendarCheck className="size-4 me-2" />{t("newAppointment")}</Link></Button>
            {canFinance && <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Link to="/invoices"><Receipt className="size-4 me-2" />{t("createInvoice")}</Link></Button>}
            <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Link to="/reports"><FileText className="size-4 me-2" />{t("viewAllReports")}</Link></Button>
          </div>
        </div>
      </section>

      {/* Mobile quick actions — scrollable pill row */}
      <div className="md:hidden -mx-4 px-4 overflow-x-auto">
        <div className="flex gap-2 w-max pb-1">
          {canFrontDeskIntake && (
            <Button asChild size="sm" className="rounded-full whitespace-nowrap">
              <Link to="/patients"><UserPlus className="size-4 me-1" />{t("addPatient")}</Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline" className="rounded-full whitespace-nowrap">
            <Link to="/calendar"><CalendarCheck className="size-4 me-1" />{t("newAppointment")}</Link>
          </Button>
          {canFinance && (
            <Button asChild size="sm" variant="outline" className="rounded-full whitespace-nowrap">
              <Link to="/invoices"><Receipt className="size-4 me-1" />{t("createInvoice")}</Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline" className="rounded-full whitespace-nowrap">
            <Link to="/reports"><FileText className="size-4 me-1" />{t("viewAllReports")}</Link>
          </Button>
        </div>
      </div>

      {/* Date range filter */}
      <Card className="rounded-2xl p-3 md:p-4 bg-card/80 shadow-card border-border/60 flex flex-col md:flex-row md:flex-wrap md:items-end gap-3">
        <div className="w-full md:w-auto md:min-w-[160px]">
          <div className="text-[11px] text-muted-foreground mb-1">{t("customRange")}</div>
          <Select value={rangePreset} onValueChange={(v) => applyPreset(v as any)}>
            <SelectTrigger className="h-9 w-full md:w-auto"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t("last7Days")}</SelectItem>
              <SelectItem value="30d">{t("last30Days")}</SelectItem>
              <SelectItem value="month">{t("thisMonthRange")}</SelectItem>
              <SelectItem value="custom">{t("customRange")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-auto">
          <div className="text-[11px] text-muted-foreground mb-1">{t("fromDate")}</div>
          <Input type="date" className="h-9 w-full md:w-40" value={rangeStart}
            onChange={(e) => { setRangeStart(e.target.value); setRangePreset("custom"); }} />
        </div>
        <div className="w-full md:w-auto">
          <div className="text-[11px] text-muted-foreground mb-1">{t("toDate")}</div>
          <Input type="date" className="h-9 w-full md:w-40" value={rangeEnd}
            onChange={(e) => { setRangeEnd(e.target.value); setRangePreset("custom"); }} />
        </div>
      </Card>

      {isEmpty ? (
        <Card className="p-10 text-center shadow-card border-border/60">
          <div className="mx-auto size-14 rounded-2xl bg-muted flex items-center justify-center">
            <Inbox className="size-7 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-xl font-semibold">{t("noDataYet")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("noDataYetDesc")}</p>
          <div className="mt-5 flex justify-center gap-2 flex-wrap">
            {canFrontDeskIntake && <Button asChild><Link to="/patients">{t("addPatient")}</Link></Button>}
            <Button asChild variant="outline"><Link to="/calendar">{t("newAppointment")}</Link></Button>
            {canFinance && <Button asChild variant="outline"><Link to="/invoices">{t("createInvoice")}</Link></Button>}
          </div>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-primary" aria-hidden="true" /><h2 className="text-base font-bold tracking-tight">{lang === "ar" ? "ملخص اليوم" : "Today at a glance"}</h2><span className="text-xs text-muted-foreground">{formatDate(new Date().toISOString(), lang)}</span></div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
            <StatCard
              label={t("todayAppointments")} value={todayAppts}
              sub={`${apptStatusToday.completed ?? 0} ${t("statusCompleted")} · ${apptStatusToday.scheduled ?? 0} ${t("statusScheduled")}`}
              icon={CalendarCheck} tone="from-primary to-primary-glow" to={`/calendar?date=${localToday()}`}
            />
            {canClinical && (
              <StatCard
                label={lang === "ar" ? "مواعيدي اليوم" : "My appointments today"} value={myApptsToday}
                icon={Stethoscope} tone="from-primary-glow to-primary" to={`/calendar?date=${localToday()}`}
              />
            )}
            {canFrontDeskIntake && (
              <StatCard
                label={t("newPatientsToday")} value={newPatientsToday}
                icon={UserPlus} tone="from-info to-info" to="/patients"
              />
            )}
            {canFinance && (
              <StatCard
                label={t("todayRevenue")} value={formatMoney(todayRevenue, lang)}
                icon={Wallet} tone="from-success to-success" to="/payments"
              />
            )}
            {canFinance && (
              <StatCard
                label={t("pendingInvoices")} value={pendingInvoicesCount}
                subValue={`${t("pendingAmount")}: ${formatMoney(pendingInvoicesAmount, lang)}`}
                icon={Receipt} tone="from-warning to-warning" to="/invoices"
              />
            )}
            {canClinical && (
              <StatCard
                label={t("todaysConsultations")} value={todayConsults}
                icon={Stethoscope} tone="from-primary-glow to-primary" to={`/calendar?date=${localToday()}`}
              />
            )}
            {canClinical && (
              <StatCard
                label={t("pendingRecords")} value={draftRecords}
                icon={FileText} tone="from-warning to-warning" to="/medical/records"
              />
            )}
            {canHR && (
              <StatCard
                label={lang === "ar" ? "طلبات إجازة معلقة" : "Pending leave requests"} value={pendingLeaveRequests}
                icon={Clock} tone="from-warning to-warning" to="/hr/leaves"
              />
            )}
          </div>
          {/* Treasury at-a-glance */}
          {canTreasury && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mt-3">
            <StatCard
              label={lang === "ar" ? "آخر إقفال يومي" : "Last daily close"}
              value={lastClose ? formatMoney(lastClose.counted_cash, lang) : (lang === "ar" ? "—" : "—")}
              sub={lastClose
                ? `${formatDate(lastClose.business_date, lang)} · ${lang === "ar" ? "فرق" : "variance"}: ${formatMoney(lastClose.variance, lang)}`
                : (lang === "ar" ? "لا يوجد إقفال بعد" : "No close yet")}
              icon={Landmark}
              tone={lastClose && Math.abs(lastClose.variance) > 0.01 ? "from-warning to-warning" : "from-success to-success"}
              to="/treasury/daily-close"
            />
            <StatCard
              label={lang === "ar" ? "حركات الخزينة اليوم" : "Treasury movements today"}
              value={formatMoney(todayTreasuryIn - todayTreasuryOut, lang)}
              sub={`${lang === "ar" ? "داخل" : "In"}: ${formatMoney(todayTreasuryIn, lang)} · ${lang === "ar" ? "خارج" : "Out"}: ${formatMoney(todayTreasuryOut, lang)}`}
              icon={ArrowDownUp} tone="from-info to-info" to="/treasury"
            />
          </div>
          )}
          </section>

          {canFinance && (
          <section className="space-y-3 pt-2 border-t border-border/40">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-info" aria-hidden="true" /><h2 className="text-base font-bold tracking-tight">{lang === "ar" ? "الاتجاهات — هذا الأسبوع" : "Trends — This week"}</h2></div><span className="text-xs text-muted-foreground hidden sm:block">{rangeStart} → {rangeEnd}</span></div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="rounded-2xl p-5 md:p-6 shadow-card border-border/60 bg-card/90 lg:col-span-2">
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

            <Card className="rounded-2xl p-5 md:p-6 shadow-card border-border/60 bg-card/90">
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
          </section>
          )}

          <section className="space-y-3 pt-2 border-t border-border/40">
          <div className="flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-success" aria-hidden="true" /><h2 className="text-base font-bold tracking-tight">{lang === "ar" ? "تحليل المرضى والأداء" : "Patients & performance insights"}</h2></div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="rounded-2xl p-5 md:p-6 shadow-card border-border/60 bg-card/90">
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

            <Card className="rounded-2xl p-5 md:p-6 shadow-card border-border/60 bg-card/90">
              <div className="text-sm font-medium mb-3">{t("patientsByReferral")}</div>
              {loading ? <Skeleton className="h-56 w-full" /> : referralGroups.length === 0 || referralGroups.every((r) => r.value === 0) ? (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">{t("noDataYet")}</div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer>
                    <BarChart data={referralGroups} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={110} />
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Bar dataKey="value" fill="hsl(var(--info))" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {(canOpsReports || canFinance) && (
          <div className="grid lg:grid-cols-2 gap-4">
            {canOpsReports && (
            <Card className="rounded-2xl p-5 md:p-6 shadow-card border-border/60 bg-card/90">
              <div className="text-sm font-medium mb-3 flex items-center gap-2">
                <Stethoscope className="size-4" /> {t("doctorPerformance")}
              </div>
              {loading ? <Skeleton className="h-64 w-full" /> : doctorPerf.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">{t("noDataYet")}</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={doctorPerf} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={120} />
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => [`${v}`, t("appointmentsCount")]} />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            )}

            {canFinance && (
            <Card className="rounded-2xl p-5 md:p-6 shadow-card border-border/60 bg-card/90">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Receipt className="size-4" /> {t("topRequestedServices")}
                </div>
                <Button asChild variant="ghost" size="sm" className="gap-1 text-primary"><Link to="/reports/financial">{lang === "ar" ? "عرض التقرير" : "View report"}<ArrowUpRight className="size-4" /></Link></Button>
              </div>
              {loading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />) :
                topServices.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center">{t("noDataYet")}</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {topServices.map((s, i) => (
                      <li key={i} className="py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.count} ×</div>
                        </div>
                        <div className="font-semibold text-sm tabular-nums whitespace-nowrap">{formatMoney(s.revenue, lang)}</div>
                      </li>
                    ))}
                  </ul>
                )
              }
            </Card>
            )}
          </div>
          )}

          </section>

          <section className="space-y-3 pt-2 border-t border-border/40">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-warning" aria-hidden="true" /><h2 className="text-base font-bold tracking-tight">{lang === "ar" ? "العمليات اليومية" : "Daily operations"}</h2></div><span className="text-xs text-muted-foreground">{lang === "ar" ? "أحدث النشاط" : "Recent activity"}</span></div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="rounded-2xl p-5 md:p-6 shadow-card border-border/60 bg-card/90">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium flex items-center gap-2"><Users className="size-4" /> {t("recentPatients2")}</div>
                <Button asChild variant="ghost" size="sm" className="gap-1 text-primary"><Link to="/patients">{lang === "ar" ? "عرض الكل" : "View all"}<ArrowUpRight className="size-4" /></Link></Button>
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

            <Card className="rounded-2xl p-5 md:p-6 shadow-card border-border/60 bg-card/90">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium flex items-center gap-2"><CalendarCheck className="size-4" /> {t("recentAppointments")}</div>
                <Button asChild variant="ghost" size="sm" className="gap-1 text-primary"><Link to="/calendar">{lang === "ar" ? "عرض الكل" : "View all"}<ArrowUpRight className="size-4" /></Link></Button>
              </div>
              {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />) :
                recentAppts.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">{t("noDataYet")}</div> :
                <ul className="divide-y divide-border">
                  {recentAppts.map((a) => (
                    <li key={a.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{fullName(a.patient)}</div>
                        <div className="text-xs text-muted-foreground truncate">{(a.doctor_id && doctorNames[a.doctor_id]) || "—"}</div>
                      </div>
                      <div className="text-end shrink-0">
                        <div className="text-xs text-muted-foreground">{formatDateTime(a.scheduled_at, lang)}</div>
                        <Badge variant="outline" className="text-[10px] mt-1">{t(`status${a.status?.charAt(0).toUpperCase() + a.status?.slice(1).replace(/_(.)/g, (_: any, c: string) => c.toUpperCase())}` as any) ?? a.status}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              }
            </Card>

            {canFinance && (
            <Card className="rounded-2xl p-5 md:p-6 shadow-card border-border/60 bg-card/90">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium flex items-center gap-2"><Wallet className="size-4" /> {t("recentPayments")}</div>
                <Button asChild variant="ghost" size="sm" className="gap-1 text-primary"><Link to="/payments">{lang === "ar" ? "عرض الكل" : "View all"}<ArrowUpRight className="size-4" /></Link></Button>
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
            )}
          </div>
          </section>
        </>
      )}
    </div>
    </PullToRefresh>
  );
}
