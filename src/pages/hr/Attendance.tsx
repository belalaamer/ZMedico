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
import { MapPin, CheckCircle2, AlertTriangle } from "lucide-react";
import GpsCheckDialog from "@/components/attendance/GpsCheckDialog";

export default function Attendance() {
  const { t } = useI18n();
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
    let q = supabase.from("staff").select("id,employee_id,department_id" as any);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data: s } = await q;
    setStaff(s ?? []);
    const { data: profs } = await supabase.from("profiles").select("id,full_name,email");
    setProfiles(profs ?? []);
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
    if (!existing) { toast.error("Check in first"); return; }
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
      await supabase.from("attendance").update({ status }).eq("id", existing.id);
    } else {
      await supabase.from("attendance").insert({ staff_id: sid, branch_id: currentBranchId, date, status, created_by: user?.id } as any);
    }
    load();
  };

  const visibleStaff = staff.filter((s) => {
    if (zoneFilter === "all") return true;
    const r = recOf(s.id);
    if (!r || r.is_within_branch_radius == null) return zoneFilter === "all";
    return zoneFilter === "within" ? r.is_within_branch_radius : !r.is_within_branch_radius;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("attendance")}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={zoneFilter} onValueChange={(v: any) => setZoneFilter(v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("locationStatus")}: —</SelectItem>
              <SelectItem value="within">{t("withinAllowedZone")}</SelectItem>
              <SelectItem value="outside">{t("outsideAllowedZone")}</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t("presentToday")} value={counts.present} />
        <StatCard label={t("absentToday")} value={counts.absent} />
        <StatCard label={t("lateToday")} value={counts.late} />
        <StatCard label={t("onLeaveToday")} value={counts.onLeave} />
      </div>
      <Card className="shadow-card overflow-hidden">
        <div className="divide-y divide-border">
          {visibleStaff.map((s) => {
            const r = recOf(s.id);
            return (
              <div key={s.id} className="flex items-center gap-3 p-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{profName(s.id)}</div>
                  <div className="text-xs text-muted-foreground">{s.employee_id}</div>
                </div>
                {r?.is_within_branch_radius != null && (
                  r.is_within_branch_radius
                    ? <Badge className="bg-emerald-500/10 text-emerald-600 border-0"><CheckCircle2 className="size-3 me-1" />{t("withinAllowedZone")}</Badge>
                    : <Badge className="bg-destructive/10 text-destructive border-0"><AlertTriangle className="size-3 me-1" />{t("outsideAllowedZone")}</Badge>
                )}
                <div className="text-xs text-muted-foreground">{r?.check_in_time ?? "—"} → {r?.check_out_time ?? "—"}</div>
                {r && <Badge variant="outline">{r.working_hours} {t("workingHours")}</Badge>}
                <Select value={r?.status ?? "absent"} onValueChange={(v) => setStatus(s.id, v)}>
                  <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">{t("statusPresent")}</SelectItem>
                    <SelectItem value="absent">{t("statusAbsent")}</SelectItem>
                    <SelectItem value="late">{t("statusLate")}</SelectItem>
                    <SelectItem value="early_leave">{t("statusEarlyLeave")}</SelectItem>
                    <SelectItem value="half_day">{t("statusHalfDay")}</SelectItem>
                    <SelectItem value="on_leave">{t("statusOnLeave")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => setGpsOpen({ mode: "in", staffId: s.id })}>
                  <MapPin className="size-3 me-1" />{t("checkIn")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setGpsOpen({ mode: "out", staffId: s.id })}>
                  <MapPin className="size-3 me-1" />{t("checkOut")}
                </Button>
              </div>
            );
          })}
          {visibleStaff.length === 0 && <div className="p-10 text-center text-muted-foreground">—</div>}
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4 shadow-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}