import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Activity, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ListSkeleton } from "@/components/ListSkeleton";
import { Can } from "@/components/Can";
import { usePermissions } from "@/hooks/usePermissions";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

type Patient = { id: string; first_name_en?: string; last_name_en?: string; first_name_ar?: string; last_name_ar?: string; patient_code?: number };
type Therapist = { id: string; first_name_en?: string | null; last_name_en?: string | null };

export default function PhysioCases() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { can } = usePermissions();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    patient_id: "", therapist_id: "", diagnosis: "", treatment_goal: "",
    treatment_plan: "", start_date: new Date().toISOString().slice(0, 10),
    expected_sessions: 10, notes: "",
  });

  const load = async () => {
    if (!currentBranchId) { setItems([]); setLoading(false); return; }
    setLoading(true); setLoadError(null);
    const { data, error } = await supabase
      .from("physio_cases" as any)
      .select("*, patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
      .eq("branch_id", currentBranchId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) setLoadError(error.message);
    setItems((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (currentBranchId) {
      supabase.from("patients").select("id,first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code")
        .is("deleted_at", null).eq("branch_id", currentBranchId).order("created_at", { ascending: false }).limit(500)
        .then(({ data }) => setPatients((data as any) ?? []));
      // Restrict therapist picker to clinical staff (doctor / admin roles).
      (async () => {
        const { data: rs } = await supabase
          .from("user_roles").select("user_id").in("role", ["doctor", "admin"] as any);
        const ids = Array.from(new Set((rs ?? []).map((r: any) => r.user_id))).filter(Boolean);
        if (!ids.length) { setTherapists([]); return; }
        const { data } = await supabase.from("staff_profiles")
          .select("id,first_name_en,last_name_en")
          .eq("branch_id", currentBranchId).in("id", ids).limit(500);
        setTherapists((data as any) ?? []);
      })();
    }
  }, [currentBranchId]);

  const patientName = (p: any) =>
    lang === "ar"
      ? `${p?.first_name_ar ?? p?.first_name_en ?? ""} ${p?.last_name_ar ?? p?.last_name_en ?? ""}`.trim()
      : `${p?.first_name_en ?? ""} ${p?.last_name_en ?? ""}`.trim();

  const create = async () => {
    if (!currentBranchId) { toast.error("Select a branch first"); return; }
    if (!form.patient_id) { toast.error("Patient is required"); return; }
    const { data: u } = await supabase.auth.getUser();
    const payload: any = {
      ...form,
      branch_id: currentBranchId,
      therapist_id: form.therapist_id || null,
      expected_sessions: Number(form.expected_sessions) || 0,
      created_by: u.user?.id ?? null,
    };
    const { error } = await supabase.from("physio_cases" as any).insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved") ?? "Saved");
    setOpen(false);
    setForm({ ...form, patient_id: "", diagnosis: "", treatment_goal: "", treatment_plan: "", notes: "" });
    load();
  };

  const statusVariant = (s: string) =>
    s === "active" ? "status-progress" : s === "completed" ? "status-completed" : s === "paused" ? "status-pending" : "status-cancelled";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Physical Therapy</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} cases</p>
        </div>
        <Can module="medical_records" action="create">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />New case</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New physiotherapy case</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>Patient</Label>
                <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>{patients.map(p => (
                    <SelectItem key={p.id} value={p.id}>{patientName(p)} {p.patient_code ? `· #${p.patient_code}` : ""}</SelectItem>
                  ))}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Therapist</Label>
                <Select value={form.therapist_id || "_none"} onValueChange={(v) => setForm({ ...form, therapist_id: v === "_none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Therapist" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">—</SelectItem>
                    {therapists.map(s => (
                      <SelectItem key={s.id} value={s.id}>{`${s.first_name_en ?? ""} ${s.last_name_en ?? ""}`.trim() || s.id.slice(0,8)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Start date</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Expected sessions</Label>
                <Input type="number" min={0} value={form.expected_sessions} onChange={e => setForm({ ...form, expected_sessions: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <div className="text-sm text-muted-foreground py-2">Active (default)</div>
              </div>
              <div className="md:col-span-2">
                <Label>Diagnosis / complaint</Label>
                <Input value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Treatment goal</Label>
                <Input value={form.treatment_goal} onChange={e => setForm({ ...form, treatment_goal: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Treatment plan</Label>
                <Textarea rows={3} value={form.treatment_plan} onChange={e => setForm({ ...form, treatment_plan: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel") ?? "Cancel"}</Button>
              <Button onClick={create} className="gradient-primary text-primary-foreground">{t("save") ?? "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </Can>
      </div>

      <Card className="shadow-card overflow-hidden">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : loadError ? (
          <div className="p-10 text-center text-destructive flex flex-col items-center gap-2">
            <AlertCircle className="size-5" />
            <div className="text-sm">{loadError}</div>
            <Button variant="outline" size="sm" onClick={load}>Retry</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No physiotherapy cases yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {items.map(c => (
              <Link to={`/physio/${c.id}`} key={c.id} className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors">
                <Activity className="size-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{patientName(c.patients)} {c.patients?.patient_code ? <span className="text-xs text-muted-foreground">#{c.patients.patient_code}</span> : null}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.diagnosis || "—"} · start {formatDate(c.start_date, lang)} · {c.expected_sessions} sessions</div>
                </div>
                <Badge variant="outline" className={statusVariant(c.status)}>{c.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}