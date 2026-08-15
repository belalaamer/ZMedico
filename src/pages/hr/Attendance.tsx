import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, CheckCircle2, AlertTriangle, UserCheck, UserX, Clock, CalendarRange, LogIn, LogOut } from "lucide-react";
import GpsCheckDialog from "@/components/attendance/GpsCheckDialog";

export default function Attendance() {
  // UX fix: `lang` is now pulled from useI18n() alongside `t` so the
  // "Check in first" validation message below can be localized -- it
  // previously couldn't reference `lang` at all since this file never
  // destructured it, so the message was hardcoded English regardless of
  // the active language.
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { currentBranchId } = useBranch();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [staff, setStaff] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [att, setAtt] = useState<any[]>([]);
  const [branch, setBranch] = useState<any>(null);
  const [zoneFilter, setZoneFilter] = useState<"all" | "within" | "outside">("all");
  const [gpsOpen, setGpsOpen] = useState<{ mode: "in" | "out"; staffId: string } | null>(null);

  const load = async () => {
    let q = supabase.from("staff_profiles").select("id,employee_id,department_id");
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data: s } = await q;
    setStaff(s ?? []);
    // Only load profile identity for the staff visible on this page/branch —
    // avoids pulling the entire profiles table just to render name/email labels.
    const staffIds = (s ?? []).map((row: any) => row.id).filter(Boolean);
    if (staffIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("id", staffIds);
      setProfiles(profs ?? []);
    } else {
      setProfiles([]);
    }
    let qa = supabase.from("attendance").select("*").eq("date", date);
    if (currentBranchId) qa = qa.eq("branch_id", currentBranchId);
    const { data: a } = await qa;
    setAtt(a ?? []);
    if (currentBranchId) {
      const { data: b } = await supabase.from("branches").select("*").eq("id", currentBranchId).maybeSingle();
      setBranch(b);
    } else {
      setBranch(null);
    }
  };
  useEffect(() => { load(); }, [date, currentBranchId]);

  const profName = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? profiles.find((p) => p.id === id)?.email ?? id;
  const recOf = (sid: string) => att.find((a) => a.staff_id === sid);

  const counts = useMemo(() => {
    const by = (st: string) => att.filter((a) => a.status === st).length;
    return { present: by("present"), absent: by("absent"), late: by("late"), onLeave: by("on_leave") };
  }, [att]);

  const performCheckIn = async (sid: string, payload: { coords: { lat: number; lon: number; accuracy?: number }; within: boolean; reason?: string }) => {
    const time = new Date().toTimeString().slice(0, 8);
    const existing = recOf(sid);
    const baseLoc = {
      check_in_latitude: payload.coords.lat,
      check_in_longitude: payload.coords.lon,
      check_in_accuracy: payload.coords.accuracy ?? null,
      is_within_branch_radius: payload.within,
      check_in_reason: payload.reason ?? null,
    };
    if (existing) {
      const { error } = await supabase.from("attendance").update({ check_in_time: time, check_in_method: "gps", status: "present", ...baseLoc } as any).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("attendance").insert({ staff_id: sid, branch_id: currentBranchId, date, check_in_time: time, check_in_method: "gps", status: "present", created_by: user?.id, ...baseLoc } as any);
      if (error) return toast.error(error.message);
    }
    if (!payload.within) toast.warning(t("outsideAllowedZone"));
    else toast.success(t("checkIn"));
    load();
  };
  const performCheckOut = async (sid: string, payload: { coords: { lat: number; lon: number; accuracy?: number }; within: boolean; reason?: string }) => {
    const time = new Date().toTimeString().slice(0, 8);
    const existing = recOf(sid);
    // UX fix: hardcoded English regardless of `lang` -- localized to match
    // every other toast in this file (t("outsideAllowedZone"), t("checkIn"),
    // t("checkOut")).
    if (!existing) { toast.error(lang === "ar" ? "يجب تسجيل الحضور أولاً" : "Check in first"); return; }
    const { error } = await supabase.from("attendance").update({
      check_out_time: time, check_out_method: "gps",
      check_out_latitude: payload.coords.lat,
      check_out_longitude: payload.coords.lon,
      check_out_accuracy: payload.coords.accuracy ?? null,
    } as any).eq("id", existing.id);
    if (error) return toast.error(error.message);
    toast.success(t("checkOut"));
    load();
  };
  const setStatus = async (sid: string, status: any) => {
    const existing = recOf(sid);
    if (existing) {
      const { error } = await supabase.from("attendance").update({ status }).eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("attendance").insert({ staff_id: sid, branch_id: currentBranchId, date, status, created_by: user?.id } as any);
      if (error) { toast.error(error.message); return; }
    }
    load();
  };

  const visibleStaff = staff.filter((s) => {
    if (zoneFilter === "all") return true;
    const r = recOf(s.id);
    if (!r || r.is_within_branch_radius == null) return false;
    return zoneFilter === "within" ? r.is_within_branch_radius : !r.is_within_branch_radius;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("attendance")}</h1>
          <p className="text-sm text-muted-foreground mt-1">Timesheet &amp; workforce presence overview</p>
        </div>
        <div className="bg-card border shadow-sm rounded-lg p-2 flex items-center gap-3">
          <Select value={zoneFilter} onValueChange={(v: any) => setZoneFilter(v)}>
            <SelectTrigger className="w-44 h-9 border-0 bg-muted/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("locationStatus")}: —</SelectItem>
              <SelectItem value="within">{t("withinAllowedZone")}</SelectItem>
              <SelectItem value="outside">{t("outsideAllowedZone")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="h-6 w-px bg-border" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44 h-9 border-0 bg-muted/50" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("presentToday")} value={counts.present} icon={UserCheck} tint="bg-emerald-500/10 text-emerald-600" />
        <KpiCard label={t("absentToday")} value={counts.absent} icon={UserX} tint="bg-destructive/10 text-destructive" />
        <KpiCard label={t("lateToday")} value={counts.late} icon={Clock} tint="bg-amber-500/10 text-amber-600" />
        <KpiCard label={t("onLeaveToday")} value={counts.onLeave} icon={CalendarRange} tint="bg-sky-500/10 text-sky-600" />
      </div>

      <Card className="shadow-card overflow-hidden">
        <div className="sticky top-0 bg-muted/80 backdrop-blur z-10 border-b px-4 py-2 text-xs font-medium uppercase text-muted-foreground grid grid-cols-12 gap-3">
          <div className="col-span-3">Employee</div>
          <div className="col-span-2">Location</div>
          <div className="col-span-2">Time In → Out</div>
          <div className="col-span-1">Hours</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        <div className="divide-y divide-border">
          {visibleStaff.map((s) => {
            const r = recOf(s.id);
            return (
              <div key={s.id} className="grid grid-cols-12 gap-3 items-center px-4 py-3 hover:bg-muted/40 transition-colors group">
                <div className="col-span-3 min-w-0">
                  <div className="font-semibold truncate">{profName(s.id)}</div>
                  <div className="text-xs text-muted-foreground">{s.employee_id}</div>
                </div>
                <div className="col-span-2">
                  {r?.is_within_branch_radius != null ? (
                    r.is_within_branch_radius
                      ? <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/15"><CheckCircle2 className="size-3 me-1" />{t("withinAllowedZone")}</Badge>
                      : <Badge className="bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/15"><AlertTriangle className="size-3 me-1" />{t("outsideAllowedZone")}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <div className="col-span-2 font-mono text-sm tabular-nums">
                  <span className="text-foreground">{r?.check_in_time ?? "—"}</span>
                  <span className="text-muted-foreground mx-1">→</span>
                  <span className="text-foreground">{r?.check_out_time ?? "—"}</span>
                </div>
                <div className="col-span-1">
                  {r ? <Badge variant="outline" className="tabular-nums">{r.working_hours}h</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                </div>
                <div className="col-span-2">
                  <Select value={r?.status ?? "absent"} onValueChange={(v) => setStatus(s.id, v)}>
                    <SelectTrigger className="h-8 rounded-full bg-muted/50 border-0 px-3 text-xs font-medium"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="present">{t("statusPresent")}</SelectItem>
                      <SelectItem value="absent">{t("statusAbsent")}</SelectItem>
                      <SelectItem value="late">{t("statusLate")}</SelectItem>
                      <SelectItem value="early_leave">{t("statusEarlyLeave")}</SelectItem>
                      <SelectItem value="half_day">{t("statusHalfDay")}</SelectItem>
                      <SelectItem value="on_leave">{t("statusOnLeave")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <div className="inline-flex rounded-md border bg-background overflow-hidden opacity-70 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 rounded-none hover:bg-emerald-500/10 hover:text-emerald-600"
                      onClick={() => setGpsOpen({ mode: "in", staffId: s.id })}
                      title={t("checkIn")}
                    >
                      <LogIn className="size-3.5 me-1" />
                      <span className="text-xs">{t("checkIn")}</span>
                    </Button>
                    <div className="w-px bg-border" />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 rounded-none hover:bg-primary/10 hover:text-primary"
                      onClick={() => setGpsOpen({ mode: "out", staffId: s.id })}
                      title={t("checkOut")}
                    >
                      <LogOut className="size-3.5 me-1" />
                      <span className="text-xs">{t("checkOut")}</span>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          {visibleStaff.length === 0 && (
            <div className="p-16 text-center text-muted-foreground flex flex-col items-center gap-2">
              <MapPin className="size-8 opacity-30" />
              <span className="text-sm">{t("noAttendanceRecords")}</span>
            </div>
          )}
        </div>
      </Card>

      <GpsCheckDialog
        open={!!gpsOpen}
        mode={gpsOpen?.mode ?? "in"}
        branch={branch}
        onClose={() => setGpsOpen(null)}
        onConfirm={async (payload) => {
          if (!gpsOpen) return;
          if (gpsOpen.mode === "in") await performCheckIn(gpsOpen.staffId, payload);
          else await performCheckOut(gpsOpen.staffId, payload);
        }}
      />
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, tint }: { label: string; value: number; icon: any; tint: string }) {
  return (
    <Card className="p-4 shadow-card hover:shadow-elegant transition-all duration-300 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-3xl font-bold tabular-nums mt-2">{value}</div>
        </div>
        <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  );
}
