import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DAYS = ["sun","mon","tue","wed","thu","fri","sat"] as const;

type Slot = { day_of_week: number; start_time: string; end_time: string; is_working_day: boolean };

const blank = (start = "09:00", end = "17:00"): Slot[] =>
  Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, start_time: start, end_time: end, is_working_day: i !== 5 && i !== 6 }));

export default function Schedules() {
  const { t, lang } = useI18n();
  const { currentBranchId, branches } = useBranch();
  const [staff, setStaff] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [staffId, setStaffId] = useState("");
  const [branchHours, setBranchHours] = useState<{ start: string; end: string }>({ start: "09:00", end: "17:00" });
  const [slots, setSlots] = useState<Slot[]>(blank());

  useEffect(() => {
    if (!currentBranchId) return;
    supabase.from("branches").select("working_hours_start,working_hours_end").eq("id", currentBranchId).maybeSingle()
      .then(({ data }) => {
        const start = (data?.working_hours_start as string | null)?.slice(0,5) ?? "09:00";
        const end = (data?.working_hours_end as string | null)?.slice(0,5) ?? "17:00";
        setBranchHours({ start, end });
      });
  }, [currentBranchId]);

  useEffect(() => {
    (async () => {
      let q = supabase.from("staff_profiles").select("id,employee_id");
      if (currentBranchId) q = q.eq("branch_id", currentBranchId);
      const { data } = await q;
      setStaff(data ?? []);
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email");
      setProfiles(profs ?? []);
    })();
  }, [currentBranchId]);

  useEffect(() => {
    if (!staffId) { setSlots(blank(branchHours.start, branchHours.end)); return; }
    (async () => {
      const { data } = await supabase.from("work_schedules").select("*").eq("staff_id", staffId);
      const hasData = (data ?? []).length > 0;
      const next = blank(branchHours.start, branchHours.end);
      (data ?? []).forEach((row: any) => {
        const i = next.findIndex((s) => s.day_of_week === row.day_of_week);
        if (i >= 0) next[i] = { day_of_week: row.day_of_week, start_time: row.start_time?.slice(0,5) ?? "09:00", end_time: row.end_time?.slice(0,5) ?? "17:00", is_working_day: row.is_working_day };
      });
      setSlots(next);
      void hasData;
    })();
  }, [staffId, branchHours.start, branchHours.end]);

  const profName = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? profiles.find((p) => p.id === id)?.email ?? id;
  const update = (i: number, patch: Partial<Slot>) => setSlots((arr) => arr.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const applyBranchHours = () => {
    setSlots((arr) => arr.map((s) => s.is_working_day ? { ...s, start_time: branchHours.start, end_time: branchHours.end } : s));
    toast.success(t("save"));
  };

  const save = async () => {
    if (!staffId) { toast.error("Select staff"); return; }
    await supabase.from("work_schedules").delete().eq("staff_id", staffId).eq("branch_id", currentBranchId ?? "");
    const rows = slots.map((s) => ({
      staff_id: staffId, branch_id: currentBranchId ?? null,
      day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time, is_working_day: s.is_working_day,
    }));
    const { error } = await supabase.from("work_schedules").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(t("save"));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("workSchedule")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{currentBranchId ? branches.find((b) => b.id === currentBranchId)?.[lang === "ar" ? "name_ar" : "name_en"] : "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger className="w-64"><SelectValue placeholder={t("selectStaff")} /></SelectTrigger>
            <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{profName(s.id)} · {s.employee_id}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={applyBranchHours} disabled={!staffId} title={`${branchHours.start} - ${branchHours.end}`}>
            {lang === "ar" ? `تطبيق ساعات الفرع (${branchHours.start} - ${branchHours.end})` : `Apply branch hours (${branchHours.start} - ${branchHours.end})`}
          </Button>
          <Button className="gradient-primary text-primary-foreground" onClick={save} disabled={!staffId}>{t("save")}</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {slots.map((s, i) => (
          <Card key={i} className="p-4 shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{t(DAYS[i] as any)}</div>
              <Switch checked={s.is_working_day} onCheckedChange={(v) => update(i, { is_working_day: v })} />
            </div>
            <div className="space-y-2">
              <div><div className="text-[11px] text-muted-foreground">{t("startTime")}</div><Input type="time" value={s.start_time} onChange={(e) => update(i, { start_time: e.target.value })} disabled={!s.is_working_day} /></div>
              <div><div className="text-[11px] text-muted-foreground">{t("endTime")}</div><Input type="time" value={s.end_time} onChange={(e) => update(i, { end_time: e.target.value })} disabled={!s.is_working_day} /></div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}