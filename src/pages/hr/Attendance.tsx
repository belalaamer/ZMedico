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

export default function Attendance() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { currentBranchId } = useBranch();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [staff, setStaff] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [att, setAtt] = useState<any[]>([]);

  const load = async () => {
    let q = supabase.from("staff_profiles").select("id,employee_id,department_id");
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data: s } = await q;
    setStaff(s ?? []);
    const { data: profs } = await supabase.from("profiles").select("id,full_name,email");
    setProfiles(profs ?? []);
    let qa = supabase.from("attendance").select("*").eq("date", date);
    if (currentBranchId) qa = qa.eq("branch_id", currentBranchId);
    const { data: a } = await qa;
    setAtt(a ?? []);
  };
  useEffect(() => { load(); }, [date, currentBranchId]);

  const profName = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? profiles.find((p) => p.id === id)?.email ?? id;
  const recOf = (sid: string) => att.find((a) => a.staff_id === sid);

  const counts = useMemo(() => {
    const by = (st: string) => att.filter((a) => a.status === st).length;
    return { present: by("present"), absent: by("absent"), late: by("late"), onLeave: by("on_leave") };
  }, [att]);

  const checkIn = async (sid: string) => {
    const time = new Date().toTimeString().slice(0, 8);
    const existing = recOf(sid);
    if (existing) {
      const { error } = await supabase.from("attendance").update({ check_in_time: time, check_in_method: "manual", status: "present" }).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("attendance").insert({ staff_id: sid, branch_id: currentBranchId, date, check_in_time: time, check_in_method: "manual", status: "present", created_by: user?.id });
      if (error) return toast.error(error.message);
    }
    load();
  };
  const checkOut = async (sid: string) => {
    const time = new Date().toTimeString().slice(0, 8);
    const existing = recOf(sid);
    if (!existing) { toast.error("Check in first"); return; }
    const { error } = await supabase.from("attendance").update({ check_out_time: time, check_out_method: "manual" }).eq("id", existing.id);
    if (error) return toast.error(error.message);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("attendance")}</h1>
        </div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t("presentToday")} value={counts.present} />
        <StatCard label={t("absentToday")} value={counts.absent} />
        <StatCard label={t("lateToday")} value={counts.late} />
        <StatCard label={t("onLeaveToday")} value={counts.onLeave} />
      </div>
      <Card className="shadow-card overflow-hidden">
        <div className="divide-y divide-border">
          {staff.map((s) => {
            const r = recOf(s.id);
            return (
              <div key={s.id} className="flex items-center gap-3 p-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{profName(s.id)}</div>
                  <div className="text-xs text-muted-foreground">{s.employee_id}</div>
                </div>
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
                <Button size="sm" variant="outline" onClick={() => checkIn(s.id)}>{t("checkIn")}</Button>
                <Button size="sm" variant="outline" onClick={() => checkOut(s.id)}>{t("checkOut")}</Button>
              </div>
            );
          })}
          {staff.length === 0 && <div className="p-10 text-center text-muted-foreground">—</div>}
        </div>
      </Card>
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