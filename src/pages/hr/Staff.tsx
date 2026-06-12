import { useEffect, useState } from "react";
import { useDataSync } from "@/lib/dataSync";
import { Link } from "react-router-dom";
import { Plus, Search, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { RowActions } from "@/components/RowActions";
import { useNavigate } from "react-router-dom";
import { Copy } from "lucide-react";

const ROLES = ["admin", "manager", "doctor", "nurse", "receptionist", "accountant", "hr", "staff"] as const;

export function statusLabel(s: string, t: (k: any) => string) {
  const map: Record<string, string> = { active: "statusActive", on_leave: "statusOnLeave", terminated: "statusTerminated", suspended: "statusSuspended" };
  return map[s] ? t(map[s]) : s;
}

export default function Staff() {
  const { t, lang } = useI18n();
  const { branches, currentBranchId } = useBranch();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [newUser, setNewUser] = useState({ email: "", full_name: "", role: "staff" as string, password: "" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState<any>({
    profile_id: "", position_id: "", department_id: "", branch_id: "",
    hire_date: new Date().toISOString().slice(0, 10), contract_type: "full_time",
    salary: "0", commission_percent: "0", bank_name: "", bank_account: "", working_hours_per_week: 40,
    annual_leave_balance: 21, sick_leave_balance: 10,
    emergency_contact_name: "", emergency_contact_phone: "",
    national_id: "", date_of_birth: "", address: "",
  });

  const load = async () => {
    let q1 = supabase.from("staff_profiles").select("*, profile:profiles!staff_profiles_id_fkey(full_name,email,avatar_url)");
    if (currentBranchId) q1 = q1.eq("branch_id", currentBranchId);
    const { data } = await q1.is("deleted_at", null).order("created_at", { ascending: false });
    setItems(data ?? []);
    const { data: profs } = await supabase.from("profiles").select("id,full_name,email,avatar_url");
    setProfiles(profs ?? []);
    const { data: d } = await supabase.from("departments").select("id,name_en,name_ar").is("deleted_at", null);
    setDepts(d ?? []);
    const { data: pos } = await supabase.from("staff_positions").select("id,title_en,title_ar,department_id").is("deleted_at", null);
    setPositions(pos ?? []);
  };
  useEffect(() => { load(); }, [currentBranchId]);
  useDataSync(["staff", "departments", "positions"], () => { load(); });

  const save = async () => {
    let profileId = form.profile_id;

    const effectiveBranchId = form.branch_id || currentBranchId;
    if (!effectiveBranchId) {
      toast.error("Select a branch before saving");
      return;
    }

    if (mode === "new") {
      if (!newUser.email || !newUser.full_name) { toast.error(t("fullName") + " / Email"); return; }
      setCreatingUser(true);
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: newUser.email.trim().toLowerCase(),
          full_name: newUser.full_name.trim(),
          role: newUser.role,
          branch_id: effectiveBranchId,
          password: newUser.password || undefined,
        },
      });
      setCreatingUser(false);
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error ?? error?.message ?? "Failed to create user");
        return;
      }
      profileId = (data as any).user_id;
      setCreatedInfo({ email: (data as any).email, password: (data as any).password });
    }

    if (!profileId) { toast.error("Profile required"); return; }

    const payload: any = {
      id: profileId,
      position_id: form.position_id || null,
      department_id: form.department_id || null,
      branch_id: effectiveBranchId,
      hire_date: form.hire_date,
      contract_type: form.contract_type,
      salary: Number(form.salary || 0),
      commission_percent: Number(form.commission_percent || 0),
      bank_name: form.bank_name || null,
      bank_account: form.bank_account || null,
      working_hours_per_week: Number(form.working_hours_per_week || 40),
      annual_leave_balance: Number(form.annual_leave_balance || 21),
      sick_leave_balance: Number(form.sick_leave_balance || 10),
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      national_id: form.national_id || null,
      date_of_birth: form.date_of_birth || null,
      address: form.address || null,
    };
    const { error } = await supabase.from("staff_profiles").upsert(payload, { onConflict: "id" });
    if (error) return toast.error(error.message);
    toast.success(t("save"));
    if (mode !== "new") setOpen(false);
    load();
  };

  const profName = (id: string) => { const p = profiles.find((x) => x.id === id); return p?.full_name ?? p?.email ?? "—"; };
  const posName = (id: string | null) => { const p = positions.find((x) => x.id === id); return p ? (lang === "ar" ? p.title_ar : p.title_en) : "—"; };
  const deptName = (id: string | null) => { const d = depts.find((x) => x.id === id); return d ? (lang === "ar" ? d.name_ar : d.name_en) : "—"; };

  const usedIds = new Set(items.map((s) => s.id));
  const availableProfiles = profiles.filter((p) => !usedIds.has(p.id));

  const softDelete = async (s: any): Promise<void> => {
    const { error } = await supabase.from("staff_profiles").update({ deleted_at: new Date().toISOString() } as any).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    const { error: delErr } = await supabase.functions.invoke("admin-delete-user", { body: { user_id: s.id } });
    if (delErr) { toast.error(delErr.message); return; }
    toast.success(t("delete")); load();
  };

  const filtered = items.filter((s) => {
    if (filterDept !== "all" && s.department_id !== filterDept) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (!q) return true;
    const text = `${profName(s.id)} ${s.employee_id} ${s.profile?.email ?? ""}`.toLowerCase();
    return text.includes(q.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("staffDirectory")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-64"><Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9" /></div>
          <Select value={filterDept} onValueChange={setFilterDept}><SelectTrigger className="w-40"><SelectValue placeholder={t("department")} /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("filterAll") || "All"}</SelectItem>{depts.map((d) => <SelectItem key={d.id} value={d.id}>{lang === "ar" ? d.name_ar : d.name_en}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-32"><SelectValue placeholder={t("status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll") || "All"}</SelectItem>
              <SelectItem value="active">{t("statusActive")}</SelectItem>
              <SelectItem value="on_leave">{t("statusOnLeave")}</SelectItem>
              <SelectItem value="terminated">{t("statusTerminated")}</SelectItem>
              <SelectItem value="suspended">{t("statusSuspended")}</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />{t("addStaff")}</Button></DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("newStaff")}</DialogTitle></DialogHeader>
              <div className="flex gap-2 mb-2">
                <Button type="button" size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>+ New user</Button>
                <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>Existing user</Button>
              </div>
              {createdInfo && (
                <Card className="p-3 mb-2 border-success/40 bg-success/5 text-sm">
                  <div className="font-medium">User created ✓</div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">Email:</span><span className="font-mono">{createdInfo.email}</span>
                    <span className="text-muted-foreground ms-3">Password:</span><span className="font-mono">{createdInfo.password}</span>
                    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(createdInfo.password); toast.success("Copied"); }}><Copy className="size-3" /></Button>
                  </div>
                </Card>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mode === "existing" ? (
                  <div className="space-y-2 sm:col-span-2"><Label>{t("fullName")}</Label>
                    <Select value={form.profile_id} onValueChange={(v) => setForm({ ...form, profile_id: v })}>
                      <SelectTrigger><SelectValue placeholder={t("selectStaff")} /></SelectTrigger>
                      <SelectContent>{availableProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2"><Label>{t("fullName")}</Label>
                      <Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} placeholder="Ahmed Ali" />
                    </div>
                    <div className="space-y-2"><Label>Email</Label>
                      <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="user@example.com" />
                    </div>
                    <div className="space-y-2"><Label>Role</Label>
                      <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Password (optional)</Label>
                      <Input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Auto-generated if empty" />
                    </div>
                  </>
                )}
                <div className="space-y-2"><Label>{t("position")}</Label>
                  <Select value={form.position_id || "none"} onValueChange={(v) => setForm({ ...form, position_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">— {t("none")} —</SelectItem>{positions.map((p) => <SelectItem key={p.id} value={p.id}>{lang === "ar" ? p.title_ar : p.title_en}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t("department")}</Label>
                  <Select value={form.department_id || "none"} onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">— {t("none")} —</SelectItem>{depts.map((d) => <SelectItem key={d.id} value={d.id}>{lang === "ar" ? d.name_ar : d.name_en}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t("branch")}</Label>
                  <Select value={form.branch_id || "none"} onValueChange={(v) => setForm({ ...form, branch_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">— {t("none")} —</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t("hireDate")}</Label><Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("contractType")}</Label>
                  <Select value={form.contract_type} onValueChange={(v) => setForm({ ...form, contract_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">{t("fullTime")}</SelectItem>
                      <SelectItem value="part_time">{t("partTime")}</SelectItem>
                      <SelectItem value="contract">{t("contract")}</SelectItem>
                      <SelectItem value="freelance">{t("freelance")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t("salary")}</Label><Input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("commissionPercent")}</Label><Input type="number" step="0.01" min="0" max="100" value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("weeklyHours")}</Label><Input type="number" value={form.working_hours_per_week} onChange={(e) => setForm({ ...form, working_hours_per_week: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("bankName")}</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("bankAccount")}</Label><Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("nationalId")}</Label><Input value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("dob")}</Label><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("emergencyContact")}</Label><Input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("emergencyPhone")}</Label><Input value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></div>
                <div className="space-y-2 sm:col-span-2"><Label>{t("address")}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setOpen(false); setCreatedInfo(null); }}>{t("cancel")}</Button>
                <Button className="gradient-primary text-primary-foreground" onClick={save} disabled={creatingUser}>{creatingUser ? "..." : t("save")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((s) => (
          <Card key={s.id} className="p-4 shadow-card hover:shadow-elegant transition-shadow flex items-center gap-3">
            <Link to={`/hr/staff/${s.id}`} className="flex items-center gap-3 flex-1 min-w-0">
              <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center overflow-hidden">
                {s.profile_image_url ? <img src={s.profile_image_url} alt="" className="w-full h-full object-cover" /> : <User className="size-6" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{profName(s.id)}</div>
                <div className="text-xs text-muted-foreground truncate">{s.employee_id} · {posName(s.position_id)}</div>
                <div className="text-[11px] text-muted-foreground truncate">{deptName(s.department_id)} · {formatMoney(s.salary, lang, s.salary_currency)}</div>
              </div>
              <Badge variant="outline" className={s.status === "active" ? "status-completed" : "status-departed"}>{statusLabel(s.status, t)}</Badge>
            </Link>
            <RowActions onEdit={() => navigate(`/hr/staff/${s.id}`)} onDelete={() => softDelete(s)} />
          </Card>
        ))}
        {filtered.length === 0 && <Card className="p-10 col-span-full text-center text-muted-foreground">{t("noPatients")}</Card>}
      </div>
    </div>
  );
}