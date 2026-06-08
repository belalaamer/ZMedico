import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DAYS = ["sun","mon","tue","wed","thu","fri","sat"] as const;

type Slot = { day_of_week: number; start_time: string; end_time: string; is_working_day: boolean; room?: string | null };

const blank = (start = "09:00", end = "17:00"): Slot[] =>
  Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, start_time: start, end_time: end, is_working_day: i !== 5 && i !== 6, room: null }));

export default function Schedules() {
  const { t, lang } = useI18n();
  const { currentBranchId, branches } = useBranch();
  const [staff, setStaff] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [staffId, setStaffId] = useState("");
  const [branchHours, setBranchHours] = useState<{ start: string; end: string }>({ start: "09:00", end: "17:00" });
  const [slots, setSlots] = useState<Slot[]>(blank());
  // Planner state
  const [allSchedules, setAllSchedules] = useState<Record<string, Slot[]>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [roomSuggestions, setRoomSuggestions] = useState<string[]>([]);
  const [pendingApply, setPendingApply] = useState<null | { kind: "branch" | "template"; template?: Slot[] }>(null);
  const [savingPlanner, setSavingPlanner] = useState(false);

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
      // Distinct rooms from appointments (suggestions, free text still allowed)
      let aq = supabase.from("appointments").select("room").not("room", "is", null).is("deleted_at", null).limit(1000);
      if (currentBranchId) aq = aq.eq("branch_id", currentBranchId);
      const { data: appts } = await aq;
      const set = new Set<string>();
      (appts ?? []).forEach((r: any) => { if (r.room) set.add(String(r.room).trim()); });
      setRoomSuggestions(Array.from(set).sort());
    })();
  }, [currentBranchId]);

  // Load all schedules for the branch (planner)
  useEffect(() => {
    (async () => {
      let q = supabase.from("work_schedules").select("staff_id,day_of_week,start_time,end_time,is_working_day,room");
      if (currentBranchId) q = q.eq("branch_id", currentBranchId);
      const { data } = await q;
      const byStaff: Record<string, Slot[]> = {};
      (data ?? []).forEach((row: any) => {
        if (!byStaff[row.staff_id]) byStaff[row.staff_id] = blank(branchHours.start, branchHours.end);
        const i = byStaff[row.staff_id].findIndex((s) => s.day_of_week === row.day_of_week);
        if (i >= 0) byStaff[row.staff_id][i] = {
          day_of_week: row.day_of_week,
          start_time: row.start_time?.slice(0,5) ?? "09:00",
          end_time: row.end_time?.slice(0,5) ?? "17:00",
          is_working_day: row.is_working_day,
          room: row.room ?? null,
        };
      });
      setAllSchedules(byStaff);
    })();
  }, [currentBranchId, branchHours.start, branchHours.end]);

  useEffect(() => {
    if (!staffId) { setSlots(blank(branchHours.start, branchHours.end)); return; }
    (async () => {
      const { data } = await supabase.from("work_schedules").select("*").eq("staff_id", staffId);
      const hasData = (data ?? []).length > 0;
      const next = blank(branchHours.start, branchHours.end);
      (data ?? []).forEach((row: any) => {
        const i = next.findIndex((s) => s.day_of_week === row.day_of_week);
        if (i >= 0) next[i] = { day_of_week: row.day_of_week, start_time: row.start_time?.slice(0,5) ?? "09:00", end_time: row.end_time?.slice(0,5) ?? "17:00", is_working_day: row.is_working_day, room: row.room ?? null };
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
      room: s.room ?? null,
    }));
    const { error } = await supabase.from("work_schedules").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(t("save"));
    // refresh planner cache
    setAllSchedules((prev) => ({ ...prev, [staffId]: slots.map((s) => ({ ...s })) }));
  };

  // ---------- Planner helpers ----------
  const filteredStaff = staff.filter((s) => {
    if (!search.trim()) return true;
    const name = profName(s.id).toLowerCase();
    return name.includes(search.toLowerCase()) || (s.employee_id ?? "").toLowerCase().includes(search.toLowerCase());
  });

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const updateCell = (sid: string, day: number, patch: Partial<Slot>) => {
    setAllSchedules((prev) => {
      const base = prev[sid] ?? blank(branchHours.start, branchHours.end);
      const next = base.map((s) => s.day_of_week === day ? { ...s, ...patch } : s);
      return { ...prev, [sid]: next };
    });
  };

  const saveStaffSchedule = async (sid: string, rows: Slot[]) => {
    await supabase.from("work_schedules").delete().eq("staff_id", sid).eq("branch_id", currentBranchId ?? "");
    const payload = rows.map((s) => ({
      staff_id: sid, branch_id: currentBranchId ?? null,
      day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time,
      is_working_day: s.is_working_day, room: s.room ?? null,
    }));
    return supabase.from("work_schedules").insert(payload);
  };

  const saveCell = async (sid: string) => {
    const rows = allSchedules[sid] ?? blank(branchHours.start, branchHours.end);
    const { error } = await saveStaffSchedule(sid, rows);
    if (error) toast.error(error.message); else toast.success(t("save"));
  };

  const copyFromAbove = (sid: string, index: number) => {
    if (index === 0) return;
    const aboveId = filteredStaff[index - 1].id;
    const above = allSchedules[aboveId] ?? blank(branchHours.start, branchHours.end);
    setAllSchedules((prev) => ({ ...prev, [sid]: above.map((s) => ({ ...s })) }));
    toast.message(t("copyFromAbove"));
  };

  const confirmApply = () => {
    if (selectedIds.length === 0) { toast.error(lang === "ar" ? "اختر موظفين أولاً" : "Select staff first"); return; }
    setPendingApply({ kind: "branch" });
  };

  const doApplyBranchHoursToSelected = async () => {
    setSavingPlanner(true);
    try {
      const template = blank(branchHours.start, branchHours.end);
      const next = { ...allSchedules };
      for (const sid of selectedIds) {
        next[sid] = template.map((s) => ({ ...s }));
        const { error } = await saveStaffSchedule(sid, template);
        if (error) { toast.error(error.message); return; }
      }
      setAllSchedules(next);
      toast.success(t("save"));
      setSelected({});
    } finally {
      setSavingPlanner(false);
      setPendingApply(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("shiftPlanner")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{currentBranchId ? branches.find((b) => b.id === currentBranchId)?.[lang === "ar" ? "name_ar" : "name_en"] : "—"}</p>
        </div>
      </div>

      <Tabs defaultValue="weekly" className="w-full">
        <TabsList>
          <TabsTrigger value="weekly">{t("weeklyView")}</TabsTrigger>
          <TabsTrigger value="detailed">{t("detailedEditor")}</TabsTrigger>
        </TabsList>

        {/* ============ Weekly Planner ============ */}
        <TabsContent value="weekly" className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search") ?? "Search"} className="w-64" />
            <Badge variant="outline">{selectedIds.length} {lang === "ar" ? "محدد" : "selected"}</Badge>
            <Button variant="outline" size="sm" onClick={() => { const m: Record<string, boolean> = {}; filteredStaff.forEach((s) => { m[s.id] = true; }); setSelected(m); }}>
              {lang === "ar" ? "تحديد الكل" : "Select all"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected({})}>{lang === "ar" ? "مسح" : "Clear"}</Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={confirmApply} disabled={selectedIds.length === 0 || savingPlanner} title={`${branchHours.start} - ${branchHours.end}`}>
              {t("applyToSelected")} ({branchHours.start}-{branchHours.end})
            </Button>
          </div>

          <Card className="shadow-card overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="text-start p-2 w-10"></th>
                  <th className="text-start p-2 min-w-[180px]">{lang === "ar" ? "الموظف" : "Staff"}</th>
                  {DAYS.map((d) => (<th key={d} className="text-start p-2 min-w-[120px]">{t(d as any)}</th>))}
                  <th className="p-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((s, rowIdx) => {
                  const rowSlots = allSchedules[s.id] ?? blank(branchHours.start, branchHours.end);
                  return (
                    <tr key={s.id} className="border-t border-border align-top">
                      <td className="p-2"><Checkbox checked={!!selected[s.id]} onCheckedChange={(v) => setSelected((p) => ({ ...p, [s.id]: !!v }))} /></td>
                      <td className="p-2">
                        <div className="font-medium truncate">{profName(s.id)}</div>
                        <div className="text-[11px] text-muted-foreground">{s.employee_id}</div>
                        {rowIdx > 0 && (
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-1 mt-1" onClick={() => copyFromAbove(s.id, rowIdx)}>
                            {t("copyFromAbove")}
                          </Button>
                        )}
                      </td>
                      {rowSlots.map((slot) => (
                        <td key={slot.day_of_week} className="p-1.5">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className={
                                  "w-full text-left rounded-md border px-2 py-1.5 transition-colors hover:bg-accent/40 " +
                                  (slot.is_working_day
                                    ? "border-primary/40 bg-primary/5"
                                    : "border-dashed border-muted bg-muted/20 text-muted-foreground")
                                }
                              >
                                {slot.is_working_day ? (
                                  <>
                                    <div className="text-xs font-medium tabular-nums">{slot.start_time}–{slot.end_time}</div>
                                    {slot.room
                                      ? <div className="text-[10px] mt-0.5"><Badge variant="outline" className="text-[10px] py-0 px-1">{slot.room}</Badge></div>
                                      : <div className="text-[10px] mt-0.5 text-muted-foreground">{t("room")}: —</div>}
                                  </>
                                ) : (
                                  <div className="text-xs italic">{t("off")}</div>
                                )}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs">{t("workingDay")}</Label>
                                <Switch checked={slot.is_working_day} onCheckedChange={(v) => updateCell(s.id, slot.day_of_week, { is_working_day: v })} />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-[11px] text-muted-foreground">{t("startTime")}</Label>
                                  <Input type="time" value={slot.start_time} disabled={!slot.is_working_day} onChange={(e) => updateCell(s.id, slot.day_of_week, { start_time: e.target.value })} />
                                </div>
                                <div>
                                  <Label className="text-[11px] text-muted-foreground">{t("endTime")}</Label>
                                  <Input type="time" value={slot.end_time} disabled={!slot.is_working_day} onChange={(e) => updateCell(s.id, slot.day_of_week, { end_time: e.target.value })} />
                                </div>
                              </div>
                              <div>
                                <Label className="text-[11px] text-muted-foreground">{t("room")}</Label>
                                <Input
                                  list={`rooms-${s.id}-${slot.day_of_week}`}
                                  value={slot.room ?? ""}
                                  disabled={!slot.is_working_day}
                                  placeholder="—"
                                  onChange={(e) => updateCell(s.id, slot.day_of_week, { room: e.target.value || null })}
                                />
                                <datalist id={`rooms-${s.id}-${slot.day_of_week}`}>
                                  {roomSuggestions.map((r) => <option key={r} value={r} />)}
                                </datalist>
                              </div>
                              <div className="flex justify-end">
                                <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => saveCell(s.id)}>{t("save")}</Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </td>
                      ))}
                      <td className="p-2">
                        <Button size="sm" variant="outline" onClick={() => saveCell(s.id)}>{t("save")}</Button>
                      </td>
                    </tr>
                  );
                })}
                {filteredStaff.length === 0 && (
                  <tr><td colSpan={9} className="p-10 text-center text-muted-foreground text-sm">—</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm bg-primary/5 border border-primary/40" /> {t("workingDay")}</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm bg-muted/20 border border-dashed border-muted" /> {t("off")}</span>
          </div>
        </TabsContent>

        {/* ============ Detailed editor (legacy single-staff) ============ */}
        <TabsContent value="detailed" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger className="w-64"><SelectValue placeholder={t("selectStaff")} /></SelectTrigger>
              <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{profName(s.id)} · {s.employee_id}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={applyBranchHours} disabled={!staffId} title={`${branchHours.start} - ${branchHours.end}`}>
              {lang === "ar" ? `تطبيق ساعات الفرع (${branchHours.start} - ${branchHours.end})` : `Apply branch hours (${branchHours.start} - ${branchHours.end})`}
            </Button>
            <Button className="gradient-primary text-primary-foreground" onClick={save} disabled={!staffId}>{t("save")}</Button>
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
                  <div>
                    <div className="text-[11px] text-muted-foreground">{t("room")}</div>
                    <Input list={`detailed-rooms-${i}`} value={s.room ?? ""} disabled={!s.is_working_day} placeholder="—" onChange={(e) => update(i, { room: e.target.value || null })} />
                    <datalist id={`detailed-rooms-${i}`}>{roomSuggestions.map((r) => <option key={r} value={r} />)}</datalist>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!pendingApply} onOpenChange={(o) => !o && setPendingApply(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("applyToSelected")}</AlertDialogTitle>
            <AlertDialogDescription>{t("overwriteScheduleConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={doApplyBranchHoursToSelected}>{t("save")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}