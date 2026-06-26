import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus, TrendingUp, TrendingDown, Minus, Trash2, AlertCircle, Calendar, BellRing } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Can } from "@/components/Can";
import { usePermissions } from "@/hooks/usePermissions";
import { ListSkeleton } from "@/components/ListSkeleton";
import { subscribeResilient } from "@/lib/realtime";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

export default function PhysioCaseDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { can } = usePermissions();
  const [c, setC] = useState<any>(null);
  const [status, setStatus] = useState<"loading" | "notfound" | "error" | "loaded">("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [reassessments, setReassessments] = useState<any[]>([]);
  const [therapists, setTherapists] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [appointmentMap, setAppointmentMap] = useState<Record<string, any>>({});
  const [sessOpen, setSessOpen] = useState(false);
  const [reOpen, setReOpen] = useState(false);

  const loadAll = async () => {
    if (!id) return;
    const [caseRes, sessRes, rasRes] = await Promise.all([
      supabase.from("physio_cases" as any)
        .select("*, patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code), branches(name_en,name_ar)")
        .eq("id", id).is("deleted_at", null).maybeSingle(),
      supabase.from("physio_sessions" as any).select("*").eq("case_id", id).is("deleted_at", null).order("session_number", { ascending: true }),
      supabase.from("physio_reassessments" as any).select("*").eq("case_id", id).is("deleted_at", null).order("assessment_date", { ascending: false }),
    ]);
    if (caseRes.error) { setErrMsg(caseRes.error.message); setStatus("error"); return; }
    if (!caseRes.data) { setStatus("notfound"); return; }
    setC(caseRes.data);
    setSessions((sessRes.data as any) ?? []);
    setReassessments((rasRes.data as any) ?? []);
    setStatus("loaded");
    const branchId = (caseRes.data as any).branch_id;
    const patientId = (caseRes.data as any).patient_id;
    // Load patient's appointments at this branch for linking + display.
    if (branchId && patientId) {
      const { data: appts } = await supabase.from("appointments")
        .select("id,scheduled_at,status,doctor_id,duration_minutes")
        .eq("branch_id", branchId).eq("patient_id", patientId)
        .is("deleted_at", null).order("scheduled_at", { ascending: false }).limit(100);
      const list = (appts as any) ?? [];
      setAppointments(list);
      const map: Record<string, any> = {};
      list.forEach((a: any) => { map[a.id] = a; });
      setAppointmentMap(map);
    }
    if (branchId) {
      const { data: rs } = await supabase.from("user_roles").select("user_id").in("role", ["doctor", "admin"] as any);
      const ids = Array.from(new Set((rs ?? []).map((r: any) => r.user_id))).filter(Boolean);
      if (ids.length) {
        const { data: tps } = await supabase.from("staff_profiles").select("id,first_name_en,last_name_en").eq("branch_id", branchId).in("id", ids).limit(500);
        setTherapists((tps as any) ?? []);
      } else {
        setTherapists([]);
      }
    }
  };
  useEffect(() => { loadAll(); }, [id]);

  // Resilient realtime — refresh sessions & reassessments for this case.
  useEffect(() => {
    if (!id) return;
    const refresh = () => { void loadAll(); };
    const off1 = subscribeResilient({
      name: `physio_sessions:${id}`,
      bind: (ch) => ch.on("postgres_changes" as any,
        { event: "*", schema: "public", table: "physio_sessions", filter: `case_id=eq.${id}` },
        () => refresh()),
      onReconnect: refresh,
    });
    const off2 = subscribeResilient({
      name: `physio_reassessments:${id}`,
      bind: (ch) => ch.on("postgres_changes" as any,
        { event: "*", schema: "public", table: "physio_reassessments", filter: `case_id=eq.${id}` },
        () => refresh()),
      onReconnect: refresh,
    });
    return () => { off1(); off2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const patientName = (p: any) => lang === "ar"
    ? `${p?.first_name_ar ?? p?.first_name_en ?? ""} ${p?.last_name_ar ?? p?.last_name_en ?? ""}`.trim()
    : `${p?.first_name_en ?? ""} ${p?.last_name_en ?? ""}`.trim();

  const done = sessions.filter(s => s.attendance === "done").length;
  const remaining = Math.max(0, (c?.expected_sessions ?? 0) - done);
  const lastDone = useMemo(() => {
    const d = sessions.filter(s => s.attendance === "done").map(s => s.session_date).sort();
    return d.length ? d[d.length - 1] : null;
  }, [sessions]);
  const nextPlanned = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = sessions
      .filter(s => s.attendance === "scheduled" && s.session_date >= today)
      .map(s => s.session_date)
      .sort();
    return upcoming[0] ?? null;
  }, [sessions]);

  const updateStatus = async (status: string) => {
    const patch: any = { status };
    if (status === "completed") {
      const summary = prompt("Completion summary (optional)") ?? "";
      patch.completion_summary = summary || c?.completion_summary || null;
      patch.completed_at = new Date().toISOString();
    } else if (status === "paused") {
      const reason = prompt("Pause reason (optional)") ?? "";
      patch.pause_reason = reason || c?.pause_reason || null;
    } else if (status === "active") {
      patch.completed_at = null;
    }
    const { error } = await supabase.from("physio_cases" as any).update(patch).eq("id", id!);
    if (error) return toast.error(error.message);
    toast.success("Updated"); loadAll();
  };

  const saveFollowup = async (patch: any) => {
    const { error } = await supabase.from("physio_cases" as any).update(patch).eq("id", id!);
    if (error) return toast.error(error.message);
    toast.success("Updated"); loadAll();
  };

  const softDeleteCase = async () => {
    if (!confirm("Soft-delete this physiotherapy case?")) return;
    const { error } = await supabase.from("physio_cases" as any).update({ deleted_at: new Date().toISOString() } as any).eq("id", id!);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    window.history.back();
  };

  if (status === "loading") return <div className="p-6"><ListSkeleton rows={6} /></div>;
  if (status === "notfound") return (
    <div className="p-10 text-center space-y-3">
      <div className="text-muted-foreground">Case not found or has been removed.</div>
      <Button asChild variant="outline"><Link to="/physio"><ArrowLeft className="size-4 me-2" />Back</Link></Button>
    </div>
  );
  if (status === "error") return (
    <div className="p-10 text-center space-y-3">
      <AlertCircle className="size-6 text-destructive mx-auto" />
      <div className="text-sm text-destructive">{errMsg ?? "Failed to load."}</div>
      <Button variant="outline" onClick={loadAll}>Retry</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link to="/physio"><ArrowLeft className="size-4" /></Link></Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{patientName(c.patients)}</h1>
            <p className="text-sm text-muted-foreground">{c.diagnosis || "—"} · start {formatDate(c.start_date, lang)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {can("medical_records", "edit") ? (
            <Select value={c.status} onValueChange={updateStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline">{c.status}</Badge>
          )}
          <Can module="medical_records" action="delete">
            <Button variant="ghost" size="icon" onClick={softDeleteCase} title="Delete case">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </Can>
        </div>
      </div>

      {c.status === "completed" && c.completion_summary && (
        <Card className="p-3 border-success/30 bg-success/5 text-sm">
          <div className="font-semibold mb-1">Completion summary</div>
          <div className="whitespace-pre-wrap">{c.completion_summary}</div>
        </Card>
      )}
      {c.status === "paused" && (
        <Card className="p-3 border-warning/30 bg-warning/5 text-sm">
          <div className="font-semibold mb-1">Paused</div>
          <div className="whitespace-pre-wrap">{c.pause_reason || "—"}</div>
        </Card>
      )}
      {c.status === "active" && c.followup_enabled && c.followup_due_date && c.followup_due_date < new Date().toISOString().slice(0,10) && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm flex items-center gap-2">
          <AlertCircle className="size-4 text-destructive" />
          <span>Follow-up overdue (due {formatDate(c.followup_due_date, lang)}). Consider a reassessment.</span>
        </Card>
      )}
      {(c.expected_sessions ?? 0) > 0 && sessions.filter(s => s.attendance === "done").length >= (c.expected_sessions ?? 0) && c.status === "active" && (
        <Card className="p-3 border-primary/30 bg-primary/5 text-sm">
          Expected sessions reached. Consider a reassessment or marking the case as completed.
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Completed</div><div className="text-2xl font-bold">{done}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Remaining</div><div className="text-2xl font-bold">{remaining}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Last session</div><div className="text-sm font-medium">{lastDone ? formatDate(lastDone, lang) : "—"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Next planned</div><div className="text-sm font-medium">{nextPlanned ? formatDate(nextPlanned, lang) : "—"}</div></Card>
      </div>

      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="reassessments">Reassessments</TabsTrigger>
          <TabsTrigger value="overview">Plan</TabsTrigger>
          <TabsTrigger value="followup">Follow-up</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-3">
          <Can module="medical_records" action="create">
            <div className="flex justify-end">
              <SessionDialog
                open={sessOpen} setOpen={setSessOpen}
                caseId={c.id} nextNumber={(sessions[sessions.length - 1]?.session_number ?? 0) + 1}
                defaultTherapistId={c.therapist_id}
                therapists={therapists}
                appointments={appointments}
                onSaved={loadAll}
              />
            </div>
          </Can>
          <Card className="overflow-hidden">
            {sessions.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">No sessions yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {sessions.map(s => (
                  <div key={s.id} className="p-4 space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">Session #{s.session_number} · {formatDate(s.session_date, lang)}</div>
                      <Badge variant="outline" className={
                        s.attendance === "done" ? "status-completed" :
                        s.attendance === "missed" ? "status-cancelled" :
                        s.attendance === "cancelled" ? "status-cancelled" : "status-pending"
                      }>{s.attendance}</Badge>
                    </div>
                    {s.appointment_id ? (
                      appointmentMap[s.appointment_id] ? (
                        <div className="text-xs flex items-center gap-1 text-muted-foreground">
                          <Calendar className="size-3" />
                          Linked appointment · {new Date(appointmentMap[s.appointment_id].scheduled_at).toLocaleString()} · {appointmentMap[s.appointment_id].status}
                        </div>
                      ) : (
                        <div className="text-xs flex items-center gap-1 text-muted-foreground">
                          <Calendar className="size-3" />
                          Linked appointment · <span className="font-mono">#{String(s.appointment_id).slice(0, 8)}</span>
                        </div>
                      )
                    ) : (
                      <div className="text-[11px] text-muted-foreground">Standalone (no appointment)</div>
                    )}
                    {(s.pain_level !== null && s.pain_level !== undefined) && <div className="text-xs text-muted-foreground">Pain: {s.pain_level}/10</div>}
                    {s.interventions && <div className="text-sm"><span className="text-muted-foreground">Interventions: </span>{s.interventions}</div>}
                    {s.progress_note && <div className="text-sm"><span className="text-muted-foreground">Progress: </span>{s.progress_note}</div>}
                    {s.next_recommendation && <div className="text-sm"><span className="text-muted-foreground">Next: </span>{s.next_recommendation}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="reassessments" className="space-y-3">
          <Can module="medical_records" action="create">
            <div className="flex justify-end">
              <ReassessmentDialog
                open={reOpen} setOpen={setReOpen}
                caseId={c.id} initialFromCase={c.diagnosis ?? ""}
                therapists={therapists} defaultTherapistId={c.therapist_id}
                onSaved={loadAll}
              />
            </div>
          </Can>
          <Card className="overflow-hidden">
            {reassessments.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">No reassessments yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {reassessments.map(r => (
                  <div key={r.id} className="p-4 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{formatDate(r.assessment_date, lang)}</div>
                      <Badge variant="outline" className={r.trend === "improving" ? "status-completed" : r.trend === "worsening" ? "status-cancelled" : "status-pending"}>
                        {r.trend === "improving" ? <TrendingUp className="size-3 me-1 inline" /> : r.trend === "worsening" ? <TrendingDown className="size-3 me-1 inline" /> : <Minus className="size-3 me-1 inline" />}
                        {r.trend}
                      </Badge>
                    </div>
                    {r.initial_condition && <div className="text-sm"><span className="text-muted-foreground">Initial: </span>{r.initial_condition}</div>}
                    {r.current_condition && <div className="text-sm"><span className="text-muted-foreground">Current: </span>{r.current_condition}</div>}
                    {r.plan_update && <div className="text-sm"><span className="text-muted-foreground">Plan update: </span>{r.plan_update}</div>}
                    {r.notes && <div className="text-sm text-muted-foreground">{r.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="overview">
          <Card className="p-4 space-y-3">
            <Field label="Goal" value={c.treatment_goal} />
            <Field label="Plan" value={c.treatment_plan} />
            <Field label="Notes" value={c.notes} />
            <Field label="Expected sessions" value={String(c.expected_sessions ?? 0)} />
          </Card>
        </TabsContent>

        <TabsContent value="followup">
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium flex items-center gap-2"><BellRing className="size-4" />Follow-up reminders</div>
                <div className="text-xs text-muted-foreground">Track when this case needs a reassessment or check-in.</div>
              </div>
              <Can module="medical_records" action="edit" fallback={<Badge variant="outline">{c.followup_enabled ? "On" : "Off"}</Badge>}>
                <Switch checked={!!c.followup_enabled} onCheckedChange={(v) => saveFollowup({ followup_enabled: v })} />
              </Can>
            </div>
            <Can module="medical_records" action="edit">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Interval (days)</Label>
                  <Input type="number" min={1} defaultValue={c.followup_interval_days ?? 14}
                    onBlur={(e) => saveFollowup({ followup_interval_days: Number(e.target.value) || 14 })} />
                </div>
                <div>
                  <Label>Next follow-up due</Label>
                  <Input type="date" defaultValue={c.followup_due_date ?? ""}
                    onBlur={(e) => saveFollowup({ followup_due_date: e.target.value || null })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  const d = new Date(); d.setDate(d.getDate() + (c.followup_interval_days ?? 14));
                  saveFollowup({ followup_enabled: true, followup_due_date: d.toISOString().slice(0,10) });
                }}>Suggest from interval</Button>
                {reassessments[0]?.assessment_date && (
                  <Button variant="outline" size="sm" onClick={() => {
                    const d = new Date(reassessments[0].assessment_date); d.setDate(d.getDate() + (c.followup_interval_days ?? 14));
                    saveFollowup({ followup_enabled: true, followup_due_date: d.toISOString().slice(0,10) });
                  }}>From last reassessment</Button>
                )}
              </div>
            </Can>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm whitespace-pre-wrap">{value || "—"}</div>
    </div>
  );
}

function SessionDialog({ open, setOpen, caseId, nextNumber, defaultTherapistId, therapists, appointments, onSaved }: any) {
  const [form, setForm] = useState<any>({
    session_number: nextNumber, session_date: new Date().toISOString().slice(0, 10),
    therapist_id: defaultTherapistId ?? "", attendance: "done", pain_level: "",
    pain_note: "", interventions: "", progress_note: "", symptom_change: "",
    mobility_note: "", strength_note: "", adherence: "", home_exercise: "",
    therapist_assessment: "", next_recommendation: "", next_review_plan: "",
    appointment_id: "",
  });
  useEffect(() => { setForm((f: any) => ({ ...f, session_number: nextNumber, therapist_id: defaultTherapistId ?? "" })); }, [nextNumber, defaultTherapistId]);

  const save = async () => {
    const { data: u } = await supabase.auth.getUser();
    // Resolve session_number against the latest DB state to avoid races.
    const { data: last } = await supabase.from("physio_sessions" as any)
      .select("session_number").eq("case_id", caseId).is("deleted_at", null)
      .order("session_number", { ascending: false }).limit(1).maybeSingle();
    const nextNum = ((last as any)?.session_number ?? 0) + 1;
    const desired = Number(form.session_number) || nextNum;
    const payload: any = {
      ...form, case_id: caseId,
      session_number: Math.max(desired, nextNum),
      pain_level: form.pain_level === "" ? null : Number(form.pain_level),
      therapist_id: form.therapist_id || null,
      appointment_id: form.appointment_id || null,
      created_by: u.user?.id ?? null,
    };
    const { error } = await supabase.from("physio_sessions" as any).insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved"); setOpen(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />Log session</Button></DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Log physio session</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Session #</Label><Input type="number" value={form.session_number} onChange={e => setForm({ ...form, session_number: e.target.value })} /></div>
          <div><Label>Date</Label><Input type="date" value={form.session_date} onChange={e => setForm({ ...form, session_date: e.target.value })} /></div>
          <div className="md:col-span-2">
            <Label>Link to appointment (optional)</Label>
            <Select value={form.appointment_id || "_none"} onValueChange={v => {
              const aid = v === "_none" ? "" : v;
              const appt = (appointments ?? []).find((a: any) => a.id === aid);
              setForm((f: any) => ({
                ...f, appointment_id: aid,
                session_date: appt ? new Date(appt.scheduled_at).toISOString().slice(0, 10) : f.session_date,
              }));
            }}>
              <SelectTrigger><SelectValue placeholder="Standalone session" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Standalone —</SelectItem>
                {(appointments ?? []).slice(0, 50).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{new Date(a.scheduled_at).toLocaleString()} · {a.status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Therapist</Label>
            <Select value={form.therapist_id || "_none"} onValueChange={v => setForm({ ...form, therapist_id: v === "_none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Therapist" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">—</SelectItem>
                {therapists.map((s: any) => <SelectItem key={s.id} value={s.id}>{`${s.first_name_en ?? ""} ${s.last_name_en ?? ""}`.trim() || s.id.slice(0,8)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Attendance</Label>
            <Select value={form.attendance} onValueChange={v => setForm({ ...form, attendance: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="missed">Missed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Pain (0–10)</Label><Input type="number" min={0} max={10} value={form.pain_level} onChange={e => setForm({ ...form, pain_level: e.target.value })} /></div>
          <div><Label>Symptom change</Label><Input value={form.symptom_change} onChange={e => setForm({ ...form, symptom_change: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Interventions / exercises performed</Label><Textarea rows={2} value={form.interventions} onChange={e => setForm({ ...form, interventions: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Progress note</Label><Textarea rows={2} value={form.progress_note} onChange={e => setForm({ ...form, progress_note: e.target.value })} /></div>
          <div><Label>Mobility / ROM</Label><Input value={form.mobility_note} onChange={e => setForm({ ...form, mobility_note: e.target.value })} /></div>
          <div><Label>Strength / function</Label><Input value={form.strength_note} onChange={e => setForm({ ...form, strength_note: e.target.value })} /></div>
          <div><Label>Adherence</Label><Input value={form.adherence} onChange={e => setForm({ ...form, adherence: e.target.value })} /></div>
          <div><Label>Home exercise</Label><Input value={form.home_exercise} onChange={e => setForm({ ...form, home_exercise: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Therapist assessment</Label><Textarea rows={2} value={form.therapist_assessment} onChange={e => setForm({ ...form, therapist_assessment: e.target.value })} /></div>
          <div><Label>Next session recommendation</Label><Input value={form.next_recommendation} onChange={e => setForm({ ...form, next_recommendation: e.target.value })} /></div>
          <div><Label>Plan for next review</Label><Input value={form.next_review_plan} onChange={e => setForm({ ...form, next_review_plan: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} className="gradient-primary text-primary-foreground">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassessmentDialog({ open, setOpen, caseId, initialFromCase, therapists, defaultTherapistId, onSaved }: any) {
  const [form, setForm] = useState<any>({
    assessment_date: new Date().toISOString().slice(0, 10),
    therapist_id: defaultTherapistId ?? "",
    initial_condition: initialFromCase ?? "",
    current_condition: "", trend: "unchanged", plan_update: "", notes: "",
  });
  useEffect(() => {
    setForm((f: any) => ({ ...f, initial_condition: initialFromCase ?? f.initial_condition, therapist_id: defaultTherapistId ?? f.therapist_id }));
  }, [initialFromCase, defaultTherapistId]);

  const save = async () => {
    const { data: u } = await supabase.auth.getUser();
    const payload: any = { ...form, case_id: caseId, therapist_id: form.therapist_id || null, created_by: u.user?.id ?? null };
    const { error } = await supabase.from("physio_reassessments" as any).insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved"); setOpen(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />Add reassessment</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Reassessment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={form.assessment_date} onChange={e => setForm({ ...form, assessment_date: e.target.value })} /></div>
          <div>
            <Label>Therapist</Label>
            <Select value={form.therapist_id || "_none"} onValueChange={v => setForm({ ...form, therapist_id: v === "_none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Therapist" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">—</SelectItem>
                {therapists.map((s: any) => <SelectItem key={s.id} value={s.id}>{`${s.first_name_en ?? ""} ${s.last_name_en ?? ""}`.trim() || s.id.slice(0,8)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2"><Label>Initial condition</Label><Textarea rows={2} value={form.initial_condition} onChange={e => setForm({ ...form, initial_condition: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Current condition</Label><Textarea rows={2} value={form.current_condition} onChange={e => setForm({ ...form, current_condition: e.target.value })} /></div>
          <div>
            <Label>Trend</Label>
            <Select value={form.trend} onValueChange={v => setForm({ ...form, trend: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="improving">Improving</SelectItem>
                <SelectItem value="unchanged">Unchanged</SelectItem>
                <SelectItem value="worsening">Worsening</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2"><Label>Plan update</Label><Textarea rows={2} value={form.plan_update} onChange={e => setForm({ ...form, plan_update: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} className="gradient-primary text-primary-foreground">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}