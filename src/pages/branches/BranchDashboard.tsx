import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, CheckCheck, UserX, Timer, ArrowUp, ArrowDown, Minus, CalendarDays, ScrollText, ListChecks, Building2, Play, Printer, AlertTriangle, BellOff, Check, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDataSync } from "@/lib/dataSync";
import { fetchQueueSettings, type QueueSettings } from "@/lib/queueSettings";
import {
  syncBranchAlerts, listRecentAlerts, snoozeAlert, acknowledgeAlert, unsnoozeAlert,
  effectiveState, snoozePresets,
  type QueueAlert, type AlertType,
} from "@/lib/queueAlerts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ApptStatus } from "@/lib/appointmentStatus";

type Row = {
  id: string;
  status: ApptStatus;
  scheduled_at: string;
  checked_in_at: string | null;
  started_at: string | null;
  patients?: { first_name_en: string; last_name_en: string | null; first_name_ar: string | null; last_name_ar: string | null } | null;
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDur(ms: number) {
  if (ms <= 0) return "0m";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

type Metrics = {
  total: number;
  waiting: number;
  inSession: number;
  completed: number;
  noShow: number;
  avgWaitMs: number;
  longestWaitMs: number;
  longestName: string | null;
};

function computeMetrics(rows: Row[], lang: "en" | "ar", now: number): Metrics {
  let waiting = 0, inSession = 0, completed = 0, noShow = 0;
  let totalWait = 0, waitCount = 0;
  let longestWaitMs = 0;
  let longestName: string | null = null;
  for (const r of rows) {
    if (r.status === "scheduled" || r.status === "confirmed") waiting++;
    else if (r.status === "in_progress") inSession++;
    else if (r.status === "completed") completed++;
    else if (r.status === "no_show") noShow++;
    // Wait time = checked_in -> started_at (or now if still waiting)
    if (r.checked_in_at) {
      const ci = new Date(r.checked_in_at).getTime();
      if (r.started_at) {
        const w = new Date(r.started_at).getTime() - ci;
        if (w > 0) { totalWait += w; waitCount++; }
      } else if (r.status === "scheduled" || r.status === "confirmed") {
        const w = now - ci;
        if (w > longestWaitMs) {
          longestWaitMs = w;
          const p = r.patients;
          longestName = p ? (lang === "ar"
            ? `${p.first_name_ar ?? p.first_name_en} ${p.last_name_ar ?? p.last_name_en ?? ""}`.trim()
            : `${p.first_name_en} ${p.last_name_en ?? ""}`.trim()) : null;
        }
      }
    }
  }
  return {
    total: rows.length,
    waiting, inSession, completed, noShow,
    avgWaitMs: waitCount ? Math.round(totalWait / waitCount) : 0,
    longestWaitMs, longestName,
  };
}

function Delta({ today, prev, invert = false, suffix = "" }: { today: number; prev: number; invert?: boolean; suffix?: string }) {
  if (prev === 0 && today === 0) return <span className="text-muted-foreground inline-flex items-center gap-0.5"><Minus className="size-3" /></span>;
  const diff = today - prev;
  if (diff === 0) return <span className="text-muted-foreground inline-flex items-center gap-0.5"><Minus className="size-3" />0{suffix}</span>;
  const up = diff > 0;
  const good = invert ? !up : up;
  return (
    <span className={`inline-flex items-center gap-0.5 ${good ? "text-emerald-600" : "text-destructive"}`}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(diff)}{suffix}
    </span>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function BranchDashboard() {
  const { lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [branchName, setBranchName] = useState<string>("");
  const [today, setToday] = useState<Row[]>([]);
  const [yesterday, setYesterday] = useState<Row[]>([]);
  const [week, setWeek] = useState<Row[]>([]);
  const [settings, setSettings] = useState<QueueSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => { const i = setInterval(() => setTick((x) => x + 1), 60_000); return () => clearInterval(i); }, []);

  const load = async () => {
    if (!currentBranchId) { setToday([]); setYesterday([]); setLoading(false); return; }
    setLoading(true);
    const now = new Date();
    const tStart = startOfDay(now).toISOString();
    const tEnd = endOfDay(now).toISOString();
    const yStart = startOfDay(addDays(now, -1)).toISOString();
    const yEnd = endOfDay(addDays(now, -1)).toISOString();
    // 7-day window covers the 7 days preceding today (yesterday back 7 days),
    // used as the baseline to compare against today.
    const wStart = startOfDay(addDays(now, -7)).toISOString();
    const wEnd = endOfDay(addDays(now, -1)).toISOString();
    const sel = "id, status, scheduled_at, checked_in_at, started_at, patients(first_name_en, last_name_en, first_name_ar, last_name_ar)";
    const [{ data: tData }, { data: yData }, { data: wData }, { data: br }, qs] = await Promise.all([
      supabase.from("appointments").select(sel).eq("branch_id", currentBranchId).gte("scheduled_at", tStart).lte("scheduled_at", tEnd),
      supabase.from("appointments").select(sel).eq("branch_id", currentBranchId).gte("scheduled_at", yStart).lte("scheduled_at", yEnd),
      supabase.from("appointments").select(sel).eq("branch_id", currentBranchId).gte("scheduled_at", wStart).lte("scheduled_at", wEnd),
      supabase.from("branches").select("name_en, name_ar").eq("id", currentBranchId).maybeSingle(),
      fetchQueueSettings(currentBranchId).catch(() => null),
    ]);
    setToday((tData ?? []) as any);
    setYesterday((yData ?? []) as any);
    setWeek((wData ?? []) as any);
    setSettings(qs as QueueSettings | null);
    setBranchName((br as any) ? (lang === "ar" ? (br as any).name_ar : (br as any).name_en) : "");
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId, lang]);
  useDataSync(["appointments", "branches"], () => { load(); });

  const now = Date.now();
  const m = useMemo(() => computeMetrics(today, lang, now), [today, lang, tick]);
  const p = useMemo(() => computeMetrics(yesterday, lang, now), [yesterday, lang]);
  const w = useMemo(() => computeMetrics(week, lang, now), [week, lang]);
  const isAr = lang === "ar";

  const noShowRate = m.total ? Math.round((m.noShow / m.total) * 100) : 0;
  const prevNoShowRate = p.total ? Math.round((p.noShow / p.total) * 100) : 0;
  // 7-day daily averages (baseline to compare today against)
  const wAvgTotal = Math.round(w.total / 7);
  const wAvgWaiting = Math.round(w.waiting / 7);
  const wAvgInSession = Math.round(w.inSession / 7);
  const wAvgCompleted = Math.round(w.completed / 7);
  const wNoShowRate = w.total ? Math.round((w.noShow / w.total) * 100) : 0;
  const wAvgWaitMs = w.avgWaitMs; // already an average across the window

  // Alerts
  const longWaitMin = settings?.longWaitMinutes ?? 20;
  const longestWaitMin = Math.floor(m.longestWaitMs / 60000);
  const noShowAlertAt = settings?.noShowRateThreshold ?? 25;
  const busyAt = settings?.busyQueueThreshold ?? 8;
  const alertsEnabled = settings ? settings.alertsOnDashboard : true;
  const alerts: string[] = [];
  if (longestWaitMin >= longWaitMin) {
    alerts.push(isAr
      ? `مريض ينتظر منذ ${longestWaitMin} دقيقة (الحد ${longWaitMin})`
      : `Patient waiting ${longestWaitMin}m (threshold ${longWaitMin}m)`);
  }
  if (noShowRate >= noShowAlertAt && m.total >= 4) {
    alerts.push(isAr
      ? `نسبة عدم الحضور مرتفعة (${noShowRate}% / ${noShowAlertAt}%)`
      : `High no-show rate (${noShowRate}% / ${noShowAlertAt}%)`);
  }
  if (m.waiting >= busyAt) {
    alerts.push(isAr
      ? `الطابور مزدحم (${m.waiting} / ${busyAt})`
      : `Queue is busy (${m.waiting} / ${busyAt})`);
  }

  // Optional cheap time-of-day breakdown for today's appointments
  const dayParts = useMemo(() => {
    const buckets = { morning: 0, afternoon: 0, evening: 0 };
    for (const r of today) {
      const h = new Date(r.scheduled_at).getHours();
      if (h < 12) buckets.morning++;
      else if (h < 17) buckets.afternoon++;
      else buckets.evening++;
    }
    return buckets;
  }, [today]);

  const printedAt = new Date().toLocaleString(isAr ? "ar" : "en");

  return (
    <div className="space-y-6 print:space-y-3">
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          aside, nav, header[role="banner"] { display: none !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}</style>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="size-6 text-primary" />
            {isAr ? "لوحة الفرع" : "Branch dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {branchName ? `${branchName} · ` : ""}
            {isAr ? "نشاط العيادة اليوم" : "Today's clinic activity"}
          </p>
          <p className="print-only text-xs text-muted-foreground">{isAr ? "طُبع في" : "Printed"}: {printedAt}</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button asChild size="sm" variant="outline"><Link to="/queue"><Users className="size-3.5 me-1" />{isAr ? "الطابور" : "Queue"}</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/queue/audit"><ScrollText className="size-3.5 me-1" />{isAr ? "السجل" : "Audit"}</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/calendar"><CalendarDays className="size-3.5 me-1" />{isAr ? "المواعيد" : "Appointments"}</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/branches"><ListChecks className="size-3.5 me-1" />{isAr ? "إعدادات الفرع" : "Branch settings"}</Link></Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-3.5 me-1" />{isAr ? "طباعة" : "Print"}</Button>
        </div>
      </div>

      {!currentBranchId && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">{isAr ? "اختر فرعًا للمتابعة." : "Select a branch to continue."}</CardContent></Card>
      )}

      {currentBranchId && (
        <>
          {/* Daily operational summary card */}
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                {isAr ? "ملخص اليوم" : "Today at a glance"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "مواعيد اليوم" : "Appointments"}</div>
                  <div className="text-xl font-semibold">{loading ? "—" : m.total}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "في الانتظار الآن" : "Waiting now"}</div>
                  <div className="text-xl font-semibold">{loading ? "—" : m.waiting}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "أطول انتظار" : "Longest wait"}</div>
                  <div className="text-xl font-semibold">{m.longestWaitMs ? fmtDur(m.longestWaitMs) : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "لم يحضر" : "No-shows"}</div>
                  <div className="text-xl font-semibold">{loading ? "—" : m.noShow} <span className="text-xs text-muted-foreground">({noShowRate}%)</span></div>
                </div>
              </div>
              {alertsEnabled && alerts.length > 0 && (
                <div className="space-y-1">
                  {alerts.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 rounded px-2 py-1.5">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Time-of-day breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                {isAr ? "توزيع اليوم" : "Time of day"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{isAr ? "صباحًا (قبل 12)" : "Morning (<12)"}</div>
                  <div className="text-xl font-semibold">{dayParts.morning}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{isAr ? "ظهرًا (12–17)" : "Afternoon (12–17)"}</div>
                  <div className="text-xl font-semibold">{dayParts.afternoon}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{isAr ? "مساءً (17+)" : "Evening (17+)"}</div>
                  <div className="text-xl font-semibold">{dayParts.evening}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Stat
              icon={<Activity className="size-3.5" />}
              label={isAr ? "إجمالي اليوم" : "Total today"}
              value={loading ? "—" : m.total}
              sub={<>vs {isAr ? "أمس" : "yesterday"}: <Delta today={m.total} prev={p.total} /></>}
            />
            <Stat
              icon={<Users className="size-3.5" />}
              label={isAr ? "في الانتظار" : "Waiting"}
              value={loading ? "—" : m.waiting}
              sub={<>vs {isAr ? "أمس" : "yesterday"}: <Delta today={m.waiting} prev={p.waiting} /></>}
            />
            <Stat
              icon={<Play className="size-3.5" />}
              label={isAr ? "في الجلسة" : "In session"}
              value={loading ? "—" : m.inSession}
            />
            <Stat
              icon={<CheckCheck className="size-3.5" />}
              label={isAr ? "مكتمل" : "Completed"}
              value={loading ? "—" : m.completed}
              sub={<>vs {isAr ? "أمس" : "yesterday"}: <Delta today={m.completed} prev={p.completed} /></>}
            />
            <Stat
              icon={<UserX className="size-3.5" />}
              label={isAr ? "لم يحضر" : "No-shows"}
              value={loading ? "—" : <>{m.noShow} <span className="text-sm text-muted-foreground">({noShowRate}%)</span></>}
              sub={<>vs {isAr ? "أمس" : "yesterday"}: <Delta today={noShowRate} prev={prevNoShowRate} invert suffix="%" /></>}
            />
          </div>

          {/* 7-day trend rollup */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                {isAr ? "اتجاه آخر 7 أيام" : "7-day trend"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-2">
                {isAr ? "اليوم مقابل متوسط الأيام السبعة السابقة" : "Today vs. average of the previous 7 days"}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2 text-sm">
                <TrendRow label={isAr ? "الإجمالي" : "Total"} today={m.total} avg={wAvgTotal} />
                <TrendRow label={isAr ? "الانتظار" : "Waiting"} today={m.waiting} avg={wAvgWaiting} />
                <TrendRow label={isAr ? "الجلسة" : "In session"} today={m.inSession} avg={wAvgInSession} />
                <TrendRow label={isAr ? "مكتمل" : "Completed"} today={m.completed} avg={wAvgCompleted} />
                <TrendRow label={isAr ? "لم يحضر%" : "No-show %"} today={noShowRate} avg={wNoShowRate} invert suffix="%" />
                <TrendRow label={isAr ? "متوسط الانتظار" : "Avg wait"} today={Math.round(m.avgWaitMs / 60000)} avg={Math.round(wAvgWaitMs / 60000)} invert suffix="m" />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Timer className="size-4 text-primary" />{isAr ? "أطول انتظار حالي" : "Longest waiting now"}</CardTitle></CardHeader>
              <CardContent>
                {m.longestWaitMs > 0 ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{m.longestName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{isAr ? "في الانتظار منذ تسجيل الدخول" : "Waiting since check-in"}</div>
                    </div>
                    <Badge variant="outline" className="text-base px-3 py-1">{fmtDur(m.longestWaitMs)}</Badge>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">{isAr ? "لا أحد في الانتظار" : "No one waiting"}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Timer className="size-4 text-primary" />{isAr ? "متوسط الانتظار" : "Average wait"}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-semibold">{m.avgWaitMs ? fmtDur(m.avgWaitMs) : "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      vs {isAr ? "أمس" : "yesterday"}:{" "}
                      <Delta today={Math.round(m.avgWaitMs / 60000)} prev={Math.round(p.avgWaitMs / 60000)} invert suffix="m" />
                    </div>
                  </div>
                  <Activity className="size-6 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function TrendRow({ label, today, avg, invert = false, suffix = "" }: { label: string; today: number; avg: number; invert?: boolean; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/40 py-1 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">
        {today}{suffix} <span className="text-xs text-muted-foreground">/ {avg}{suffix}</span>{" "}
        <Delta today={today} prev={avg} invert={invert} suffix={suffix} />
      </span>
    </div>
  );
}