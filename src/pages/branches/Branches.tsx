import { useCallback, useEffect, useMemo, useState } from "react";
import { useDataSync } from "@/lib/dataSync";
import { Plus, Search, Pencil, Trash2, Building2, Star, MapPin, ListChecks, Users, ScrollText, CalendarDays, Clock, LayoutDashboard, Archive, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useBranch } from "@/contexts/BranchContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import LocationMap from "@/components/LocationMap";
import { Slider } from "@/components/ui/slider";
import { getCurrentLocation } from "@/lib/geo";
import { Loader2 } from "lucide-react";
import { fetchQueueSettings, saveQueueSettings, DEFAULT_QUEUE_SETTINGS, type QueueSettings } from "@/lib/queueSettings";
import { ALL_DAYS, dayShort, formatWorkingDays, normalizeDays, fmtTime } from "@/lib/branchSchedule";

type Branch = {
  id: string; name_ar: string; name_en: string; code: string | null;
  phone: string | null; email: string | null; address: string | null; city: string | null;
  is_main_branch: boolean; is_active: boolean; manager_id: string | null;
  tenant_id: string | null;
  working_hours_start: string | null; working_hours_end: string | null;
  working_days?: number[] | null;
  allowed_latitude: number | null; allowed_longitude: number | null; allowed_radius: number | null;
};

type Staff = { id: string; full_name: string | null; email: string | null };
type TenantOption = { id: string; name: string; slug: string };

const empty = {
  name: "", code: "", phone: "", email: "", address: "", city: "",
  manager_id: "", tenant_id: "", working_hours_start: "09:00", working_hours_end: "21:00",
  working_days: [...ALL_DAYS] as number[],
  is_main_branch: false, is_active: true,
};

export default function Branches() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { isSystemOwner } = useUserRole();
  const { toast } = useToast();
  const { currentBranchId, subscription, subscriptionLoading } = useBranch();
  const workspaceTenantId = currentBranchId ? subscription?.tenant_id ?? null : null;
  const isWorkspaceScoped = Boolean(currentBranchId);
  const [items, setItems] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [editId, setEditId] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [forceMode, setForceMode] = useState(false);
  const [locBranch, setLocBranch] = useState<Branch | null>(null);
  const [locCenter, setLocCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [locRadius, setLocRadius] = useState(100);
  const [locLoading, setLocLoading] = useState(false);
  // Queue settings editor (Phase 8)
  const [qsBranch, setQsBranch] = useState<Branch | null>(null);
  const [qsValue, setQsValue] = useState<QueueSettings>(DEFAULT_QUEUE_SETTINGS);
  const [qsLoading, setQsLoading] = useState(false);
  const [qsSaving, setQsSaving] = useState(false);
  // Branch summary panel (Phase 9): show active queue settings for the
  // currently-selected branch + quick links to operational pages.
  const [summary, setSummary] = useState<QueueSettings | null>(null);
  const currentBranch = useMemo(
    () => items.find((b) => b.id === currentBranchId) ?? null,
    [items, currentBranchId]
  );
  useEffect(() => {
    setItems([]);
    setStaff([]);
    setTenants([]);
  }, [currentBranchId]);
  useEffect(() => {
    let cancelled = false;
    if (!currentBranchId) { setSummary(null); return; }
    fetchQueueSettings(currentBranchId).then((v) => { if (!cancelled) setSummary(v); });
    return () => { cancelled = true; };
  }, [currentBranchId, qsBranch]);

  const openQueueSettings = async (b: Branch) => {
    setQsBranch(b);
    setQsLoading(true);
    setQsValue(DEFAULT_QUEUE_SETTINGS);
    try {
      const v = await fetchQueueSettings(b.id);
      setQsValue(v);
    } finally {
      setQsLoading(false);
    }
  };

  const saveQueueSettingsClick = async () => {
    if (!qsBranch) return;
    setQsSaving(true);
    const res = await saveQueueSettings(qsBranch.id, qsValue);
    setQsSaving(false);
    if (!res.ok) { toast({ title: res.error ?? "Save failed", variant: "destructive" }); return; }
    toast({ title: t("saved") });
    setQsBranch(null);
  };

  const load = useCallback(async () => {
    // A System Owner is global on the platform surface, but once a workspace
    // branch is selected this page must fail closed to that tenant only.
    if (isWorkspaceScoped && (!workspaceTenantId || subscriptionLoading)) {
      if (!subscriptionLoading) { setItems([]); setStaff([]); setTenants([]); }
      return;
    }
    let branchQuery = supabase.from("branches").select("*").order("created_at");
    if (isWorkspaceScoped && workspaceTenantId) branchQuery = branchQuery.eq("tenant_id", workspaceTenantId);
    const { data } = await branchQuery;
    const scopedBranches = (data ?? []) as Branch[];
    let staffQuery = supabase.from("profiles").select("id, full_name, email").order("full_name");
    if (isWorkspaceScoped) {
      const branchIds = scopedBranches.map((branch) => branch.id);
      if (branchIds.length === 0) {
        setItems([]); setStaff([]); setTenants([]); return;
      }
      const { data: assignments } = await supabase.from("staff_branches").select("user_id").in("branch_id", branchIds);
      const staffIds = Array.from(new Set((assignments ?? []).map((row) => String((row as { user_id: string }).user_id))));
      if (staffIds.length === 0) {
        setItems(scopedBranches); setStaff([]); setTenants([]); return;
      }
      staffQuery = staffQuery.in("id", staffIds);
    }
    const { data: staffData } = await staffQuery;
    setItems(scopedBranches);
    setStaff((staffData ?? []) as Staff[]);
    if (isSystemOwner) {
      let tenantQuery = supabase.from("tenants").select("id,name,slug").order("name");
      if (isWorkspaceScoped && workspaceTenantId) tenantQuery = tenantQuery.eq("id", workspaceTenantId);
      const { data: tenantData } = await tenantQuery;
      setTenants((tenantData ?? []) as TenantOption[]);
    } else {
      setTenants([]);
    }
  }, [isSystemOwner, isWorkspaceScoped, subscriptionLoading, workspaceTenantId]);
  useEffect(() => { void load(); }, [load]);
  useDataSync(["branches"], () => { load(); });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((b) =>
      !q || b.name_en.toLowerCase().includes(q) || b.name_ar.includes(q) ||
      (b.code ?? "").toLowerCase().includes(q) || (b.city ?? "").toLowerCase().includes(q));
  }, [items, search]);

  const openNew = () => {
    const currentTenantId = items.find((branch) => branch.id === currentBranchId)?.tenant_id ?? "";
    const defaultTenantId = isSystemOwner && tenants.length === 1 ? tenants[0].id : currentTenantId;
    setEditId(null);
    setForm({ ...empty, tenant_id: defaultTenantId });
    setOpen(true);
  };
  const openEdit = (b: Branch) => {
    setEditId(b.id);
    setForm({
      name: b.name_en || b.name_ar || "",
      code: b.code ?? "",
      phone: b.phone ?? "",
      email: b.email ?? "",
      address: b.address ?? "",
      city: b.city ?? "",
      manager_id: b.manager_id ?? "",
      tenant_id: b.tenant_id ?? "",
      working_hours_start: b.working_hours_start ?? "09:00",
      working_hours_end: b.working_hours_end ?? "21:00",
      working_days: normalizeDays(b.working_days),
      is_main_branch: b.is_main_branch,
      is_active: b.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: t("name"), variant: "destructive" }); return; }
    if (isWorkspaceScoped && form.tenant_id !== workspaceTenantId) {
      toast({ title: lang === "ar" ? "لا يمكن نقل فرع خارج مساحة العمل الحالية" : "A branch cannot be moved outside the current workspace", variant: "destructive" });
      return;
    }
    if (!form.tenant_id) {
      toast({ title: lang === "ar" ? "اختر العميل المرتبط بالفرع" : "Choose the tenant for this branch", variant: "destructive" });
      return;
    }
    const payload = {
      name_en: form.name, name_ar: form.name,
      tenant_id: form.tenant_id,
      code: form.code || null,
      phone: form.phone || null, email: form.email || null,
      address: form.address || null, city: form.city || null,
      manager_id: form.manager_id || null,
      working_hours_start: form.working_hours_start || null,
      working_hours_end: form.working_hours_end || null,
      working_days: normalizeDays(form.working_days),
      is_main_branch: form.is_main_branch, is_active: form.is_active,
    };
    let error;
    let savedBranchId = editId;
    const isNewBranch = !editId;
    if (editId) {
      ({ error } = await supabase.from("branches").update(payload).eq("id", editId));
    } else {
      const created = await supabase.from("branches").insert(payload).select("id").single();
      error = created.error;
      savedBranchId = created.data?.id ?? null;
    }
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    // Newly created branches need explicit staff_branches rows — branch-scoped
    // RLS everywhere requires one (see user_has_branch_access()). Without this,
    // the branch exists but nobody can access it until someone manually
    // assigns access later via User Management. Grant the creating admin (and
    // the assigned manager, if different) access right away. This is a
    // best-effort grant: if it fails, the branch itself still stands — warn
    // instead of blocking.
    if (isNewBranch && savedBranchId) {
      const grantUserIds = new Set<string>();
      if (user?.id) grantUserIds.add(user.id);
      if (form.manager_id) grantUserIds.add(form.manager_id);
      const grantErrors: string[] = [];
      for (const grantUserId of grantUserIds) {
        const { error: grantError } = await supabase
          .from("staff_branches")
          .insert({ user_id: grantUserId, branch_id: savedBranchId });
        if (grantError) grantErrors.push(grantError.message);
      }
      if (grantErrors.length > 0) {
        toast({
          title: lang === "ar"
            ? "تم إنشاء الفرع، لكن يجب منح صلاحية الوصول يدويًا من إدارة المستخدمين"
            : "Branch created, but access must be granted manually via User Management",
          description: grantErrors.join(" · "),
          variant: "destructive",
        });
      }
    }
    // Keep the main-branch invariant inside this tenant only.
    if (form.is_main_branch && savedBranchId) {
      const { error: mainBranchError } = await supabase
        .from("branches")
        .update({ is_main_branch: false })
        .eq("tenant_id", form.tenant_id)
        .neq("id", savedBranchId);
      if (mainBranchError) {
        toast({ title: mainBranchError.message, variant: "destructive" });
        return;
      }
    }
    setOpen(false); void load();
    toast({ title: t("saved") });
  };

  const remove = async () => {
    if (!delId) return;
    setDeleteBusy(true);
    try {
      // First attempt: plain delete (works when no dependent data).
      const { error } = await supabase.from("branches").delete().eq("id", delId);
      if (!error) {
        toast({ title: t("deleted") });
        setDelId(null); setForceMode(false); load();
        return;
      }
      // FK violation → offer force-cascade (system_owner only) or archive.
      const msg = (error.message || "").toLowerCase();
      const isFk = msg.includes("foreign key") || msg.includes("violates") || (error as { code?: string }).code === "23503";
      if (isFk && !forceMode) {
        setForceMode(true);
        toast({
          title: lang === "ar" ? "لا يمكن الحذف — يوجد بيانات مرتبطة" : "Can't delete — this branch has linked data",
          description: lang === "ar" ? "اختر الأرشفة أو الحذف الإجباري (لمالك النظام فقط)." : "Choose Archive or Force Delete (system owner only).",
          variant: "destructive",
        });
        return;
      }
      toast({ title: error.message, variant: "destructive" });
    } finally {
      setDeleteBusy(false);
    }
  };

  const archiveBranch = async () => {
    if (!delId) return;
    setDeleteBusy(true);
    const { error } = await supabase.rpc("admin_archive_branch" as never, { _branch_id: delId });
    setDeleteBusy(false);
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    toast({ title: lang === "ar" ? "تمت الأرشفة" : "Branch archived" });
    setDelId(null); setForceMode(false); load();
  };

  const forceDeleteBranch = async () => {
    if (!delId) return;
    setDeleteBusy(true);
    const { error } = await supabase.rpc("admin_force_delete_branch" as never, { _branch_id: delId });
    setDeleteBusy(false);
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    toast({ title: lang === "ar" ? "تم الحذف نهائيًا" : "Branch and all linked data deleted" });
    setDelId(null); setForceMode(false); load();
  };

  const openLocation = (b: Branch) => {
    setLocBranch(b);
    setLocRadius(b.allowed_radius ?? 100);
    if (b.allowed_latitude != null && b.allowed_longitude != null) {
      setLocCenter({ lat: Number(b.allowed_latitude), lon: Number(b.allowed_longitude) });
    } else {
      setLocCenter({ lat: 30.0444, lon: 31.2357 }); // Cairo default
    }
  };

  const useMyLocation = async () => {
    setLocLoading(true);
    try {
      const c = await getCurrentLocation();
      setLocCenter({ lat: c.lat, lon: c.lon });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast({ title: message, variant: "destructive" });
    } finally {
      setLocLoading(false);
    }
  };

  const saveLocation = async () => {
    if (!locBranch || !locCenter) return;
    const { error } = await supabase.from("branches").update({
      allowed_latitude: locCenter.lat,
      allowed_longitude: locCenter.lon,
      allowed_radius: locRadius,
    } as never).eq("id", locBranch.id);
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    toast({ title: t("locationSaved") });
    setLocBranch(null); load();
  };

  const staffName = (id: string | null) => {
    if (!id) return "—";
    const s = staff.find((x) => x.id === id);
    return s?.full_name || s?.email || "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="size-6 text-primary" /> {t("branches")}</h1>
          <p className="text-sm text-muted-foreground">{t("branches")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="size-4 me-1" />{t("add")} {t("branch")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editId ? t("edit") : t("add")} {t("branch")}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>{t("name")} / الاسم</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>{t("code")}</Label>
                <Input value={form.code} placeholder="auto" onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              {isSystemOwner ? (
                <div>
                  <Label>{lang === "ar" ? "العميل المرتبط" : "Tenant"}</Label>
                  <Select value={form.tenant_id || "none"} onValueChange={(v) => setForm({ ...form, tenant_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder={lang === "ar" ? "اختر العميل" : "Choose tenant"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{lang === "ar" ? "اختر العميل" : "Choose tenant"}</SelectItem>
                      {tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.slug}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <Label>{lang === "ar" ? "العميل المرتبط" : "Tenant"}</Label>
                  <div className="mt-1 text-muted-foreground">{form.tenant_id || (lang === "ar" ? "سيتم تحديده من الفرع الحالي" : "Inherited from the current branch")}</div>
                </div>
              )}
              <div>
                <Label>{t("phone")}</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>{t("email")}</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>{t("city")}</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>{t("address")}</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <Label>{t("manager")}</Label>
                <Select value={form.manager_id || "none"} onValueChange={(v) => setForm({ ...form, manager_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("workingHoursStart") ?? "Open"}</Label>
                  <Input type="time" value={form.working_hours_start} onChange={(e) => setForm({ ...form, working_hours_start: e.target.value })} />
                </div>
                <div>
                  <Label>{t("workingHoursEnd") ?? "Close"}</Label>
                  <Input type="time" value={form.working_hours_end} onChange={(e) => setForm({ ...form, working_hours_end: e.target.value })} />
                </div>
              </div>
              <div className="md:col-span-2">
                <Label>{lang === "ar" ? "أيام العمل" : "Working days"}</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ALL_DAYS.map((d) => {
                    const active = form.working_days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            working_days: active
                              ? form.working_days.filter((x) => x !== d)
                              : [...form.working_days, d].sort((a, b) => a - b),
                          })
                        }
                        aria-pressed={active}
                        className={`px-3 py-1.5 rounded-full text-xs border transition ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-transparent hover:bg-muted/70"
                        }`}
                      >
                        {dayShort(d, lang)}
                      </button>
                    );
                  })}
                </div>
                {form.working_days.length === 0 && (
                  <p className="mt-1 text-xs text-destructive">
                    {lang === "ar" ? "الفرع مغلق — لم يتم اختيار أي يوم." : "Branch will be marked closed — no days selected."}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-2"><Star className="size-4 text-primary" /><span className="text-sm font-medium">{t("mainBranch") ?? "Main Branch"}</span></div>
                <Switch checked={form.is_main_branch} onCheckedChange={(v) => setForm({ ...form, is_main_branch: v })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm font-medium">{t("active")}</span>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              <Button onClick={save}>{t("save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {currentBranch && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              {lang === "ar" ? currentBranch.name_ar : currentBranch.name_en}
              <Badge variant="outline" className="ms-1 text-[10px] font-normal">{lang === "ar" ? "الفرع الحالي" : "Current branch"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <CalendarDays className="size-3.5" />
                {lang === "ar" ? "أيام العمل" : "Working days"}:
              </span>
              <span className="font-medium">{formatWorkingDays(currentBranch.working_days, lang)}</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground ms-2">
                <Clock className="size-3.5" />
                {lang === "ar" ? "الدوام" : "Hours"}:
              </span>
              <span className="font-medium">
                {currentBranch.working_hours_start && currentBranch.working_hours_end
                  ? `${fmtTime(currentBranch.working_hours_start)}–${fmtTime(currentBranch.working_hours_end)}`
                  : "—"}
              </span>
              <div className="flex flex-wrap gap-1 ms-auto">
                {ALL_DAYS.map((d) => {
                  const active = normalizeDays(currentBranch.working_days).includes(d);
                  return (
                    <span
                      key={d}
                      className={`px-1.5 py-0.5 rounded text-[10px] border ${
                        active
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-muted text-muted-foreground/60 border-transparent line-through"
                      }`}
                    >
                      {dayShort(d, lang)}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border p-2 flex items-center gap-2">
                <Clock className="size-3.5 text-muted-foreground" />
                <div>
                  <div className="text-muted-foreground">{t("longWaitThresholdMin")}</div>
                  <div className="font-medium">{summary ? `${summary.longWaitMinutes} min` : "—"}</div>
                </div>
              </div>
              <div className="rounded-md border p-2 flex items-center gap-2">
                <Users className="size-3.5 text-muted-foreground" />
                <div>
                  <div className="text-muted-foreground">{t("defaultMyQueueLabel")}</div>
                  <div className="font-medium">{summary?.defaultMyQueue ? (lang === "ar" ? "مفعل" : "On") : (lang === "ar" ? "متوقف" : "Off")}</div>
                </div>
              </div>
              <div className="rounded-md border p-2 flex items-center gap-2">
                <ListChecks className="size-3.5 text-muted-foreground" />
                <div>
                  <div className="text-muted-foreground">{t("showNoShowsInDefaultLabel")}</div>
                  <div className="font-medium">{summary?.showNoShowsInDefault ? (lang === "ar" ? "نعم" : "Yes") : (lang === "ar" ? "لا" : "No")}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><Link to="/queue"><Users className="size-3.5 me-1" />{t("queue") ?? "Queue"}</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/queue/audit"><ScrollText className="size-3.5 me-1" />{t("queueAuditTitle") ?? "Audit"}</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/calendar"><CalendarDays className="size-3.5 me-1" />{t("appointments") ?? "Appointments"}</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/branches/dashboard"><LayoutDashboard className="size-3.5 me-1" />{lang === "ar" ? "لوحة الفرع" : "Branch dashboard"}</Link></Button>
              <Button size="sm" variant="ghost" onClick={() => openQueueSettings(currentBranch)}>
                <ListChecks className="size-3.5 me-1" />{t("queueSettings")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                {isSystemOwner && <TableHead>{lang === "ar" ? "العميل" : "Tenant"}</TableHead>}
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("city")}</TableHead>
                <TableHead>{t("manager")}</TableHead>
                <TableHead>{lang === "ar" ? "الجدول" : "Schedule"}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="w-32">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    {lang === "ar" ? b.name_ar : b.name_en}
                    {b.is_main_branch && <Badge className="ms-2" variant="secondary"><Star className="size-3 me-1" />{t("mainBranch") ?? "Main"}</Badge>}
                  </TableCell>
                  {isSystemOwner && <TableCell><div className="text-sm">{tenants.find((tenant) => tenant.id === b.tenant_id)?.name ?? "—"}</div><div className="font-mono text-[11px] text-muted-foreground">{tenants.find((tenant) => tenant.id === b.tenant_id)?.slug ?? "—"}</div></TableCell>}
                  <TableCell className="font-mono text-xs">{b.code ?? "—"}</TableCell>
                  <TableCell>{b.city ?? "—"}</TableCell>
                  <TableCell>{staffName(b.manager_id)}</TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium">{formatWorkingDays(b.working_days, lang)}</div>
                    <div className="text-muted-foreground">
                      {b.working_hours_start && b.working_hours_end
                        ? `${fmtTime(b.working_hours_start)}–${fmtTime(b.working_hours_end)}`
                        : "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {b.is_active
                      ? <Badge className="bg-emerald-500/10 text-emerald-600 border-0">{t("active")}</Badge>
                      : <Badge variant="outline">{t("inactive") ?? "Inactive"}</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openLocation(b)} title={t("setLocation")}>
                        <MapPin className={`size-4 ${b.allowed_latitude ? "text-emerald-600" : "text-muted-foreground"}`} />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openQueueSettings(b)} title={t("queueSettings")}>
                        <ListChecks className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(b)}><Pencil className="size-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDelId(b.id)}><Trash2 className="size-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={isSystemOwner ? 8 : 7} className="text-center text-muted-foreground py-10">{t("noData") ?? "No data"}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {forceMode && <AlertTriangle className="size-5 text-destructive" />}
              {forceMode
                ? (lang === "ar" ? "الفرع يحتوي على بيانات" : "This branch has linked data")
                : (t("confirmDelete") ?? "Delete?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {forceMode
                ? (lang === "ar"
                    ? "اختر الأرشفة لإخفاء الفرع مع الحفاظ على البيانات، أو الحذف الإجباري لإزالة الفرع وجميع البيانات المرتبطة به نهائيًا."
                    : "Archive to hide this branch while keeping its data, or Force Delete to permanently remove the branch and every record linked to it.")
                : (t("actionIrreversible") ?? "This action cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap gap-2">
            <AlertDialogCancel onClick={() => setForceMode(false)} disabled={deleteBusy}>{t("cancel")}</AlertDialogCancel>
            {forceMode ? (
              <>
                <Button variant="outline" onClick={archiveBranch} disabled={deleteBusy}>
                  <Archive className="size-4 me-1" />
                  {lang === "ar" ? "أرشفة" : "Archive"}
                </Button>
                {isSystemOwner && (
                  <Button variant="destructive" onClick={forceDeleteBranch} disabled={deleteBusy}>
                    {deleteBusy ? <Loader2 className="size-4 animate-spin me-1" /> : <Trash2 className="size-4 me-1" />}
                    {lang === "ar" ? "حذف إجباري" : "Force Delete"}
                  </Button>
                )}
              </>
            ) : (
              <AlertDialogAction onClick={remove} disabled={deleteBusy}>
                {deleteBusy ? <Loader2 className="size-4 animate-spin me-1" /> : null}
                {t("delete")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!locBranch} onOpenChange={(o) => !o && setLocBranch(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="size-5 text-primary" />{t("setLocation")} — {locBranch ? (lang === "ar" ? locBranch.name_ar : locBranch.name_en) : ""}</DialogTitle>
          </DialogHeader>
          {locCenter && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">{t("pickOnMap")}</div>
              <LocationMap
                center={locCenter}
                radius={locRadius}
                pickable
                onPick={(lat, lon) => setLocCenter({ lat, lon })}
              />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Lat: <span className="font-mono">{locCenter.lat.toFixed(6)}</span></div>
                <div>Lon: <span className="font-mono">{locCenter.lon.toFixed(6)}</span></div>
              </div>
              <div>
                <Label>{t("allowedRadius")}: {locRadius} m</Label>
                <Slider min={50} max={500} step={10} value={[locRadius]} onValueChange={(v) => setLocRadius(v[0])} className="mt-2" />
              </div>
              <Button variant="outline" size="sm" onClick={useMyLocation} disabled={locLoading}>
                {locLoading ? <Loader2 className="size-4 animate-spin me-1" /> : <MapPin className="size-4 me-1" />}
                {t("useCurrentLocation")}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocBranch(null)}>{t("cancel")}</Button>
            <Button onClick={saveLocation}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qsBranch} onOpenChange={(o) => !o && setQsBranch(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="size-5 text-primary" />
              {t("queueSettings")} — {qsBranch ? (lang === "ar" ? qsBranch.name_ar : qsBranch.name_en) : ""}
            </DialogTitle>
          </DialogHeader>
          {qsLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin inline me-2" />…</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("longWaitThresholdMin")}</Label>
                <Input
                  type="number"
                  min={5}
                  max={240}
                  value={qsValue.longWaitMinutes}
                  onChange={(e) => setQsValue({ ...qsValue, longWaitMinutes: Math.max(5, Math.min(240, Number(e.target.value) || 30)) })}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <Label className="font-normal">{t("defaultMyQueueLabel")}</Label>
                <Switch checked={qsValue.defaultMyQueue} onCheckedChange={(v) => setQsValue({ ...qsValue, defaultMyQueue: v })} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <Label className="font-normal">{t("showNoShowsInDefaultLabel")}</Label>
                <Switch checked={qsValue.showNoShowsInDefault} onCheckedChange={(v) => setQsValue({ ...qsValue, showNoShowsInDefault: v })} />
              </div>
              <div className="pt-2 border-t">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {lang === "ar" ? "حدود التنبيهات" : "Alert thresholds"}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{lang === "ar" ? "نسبة عدم الحضور %" : "No-show rate %"}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={qsValue.noShowRateThreshold}
                      onChange={(e) => setQsValue({ ...qsValue, noShowRateThreshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{lang === "ar" ? "حد ازدحام الطابور" : "Busy queue (waiting)"}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={qsValue.busyQueueThreshold}
                      onChange={(e) => setQsValue({ ...qsValue, busyQueueThreshold: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })}
                    />
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {lang === "ar" ? "عرض التنبيهات" : "Show alerts on"}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <Label className="font-normal">{lang === "ar" ? "لوحة الفرع" : "Branch Dashboard"}</Label>
                  <Switch checked={qsValue.alertsOnDashboard} onCheckedChange={(v) => setQsValue({ ...qsValue, alertsOnDashboard: v })} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border p-3 mt-2">
                  <Label className="font-normal">{lang === "ar" ? "صفحة الطابور" : "Queue page"}</Label>
                  <Switch checked={qsValue.alertsOnQueue} onCheckedChange={(v) => setQsValue({ ...qsValue, alertsOnQueue: v })} />
                </div>
              </div>
              <div className="pt-2 border-t">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {lang === "ar" ? "ساعات العمل والصمت" : "Business & quiet hours"}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{lang === "ar" ? "بداية العمل" : "Opens at"}</Label>
                    <Input
                      type="time"
                      value={qsValue.businessHoursStart}
                      onChange={(e) => setQsValue({ ...qsValue, businessHoursStart: e.target.value || "08:00" })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{lang === "ar" ? "نهاية العمل" : "Closes at"}</Label>
                    <Input
                      type="time"
                      value={qsValue.businessHoursEnd}
                      onChange={(e) => setQsValue({ ...qsValue, businessHoursEnd: e.target.value || "18:00" })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border p-3 mt-2">
                  <div>
                    <Label className="font-normal">{lang === "ar" ? "ساعات الصمت" : "Quiet hours"}</Label>
                    <p className="text-[11px] text-muted-foreground">
                      {lang === "ar"
                        ? "خارج ساعات العمل، يتم كتم تنبيهات الازدحام ونسبة عدم الحضور."
                        : "Outside business hours, busy-queue and no-show alerts are suppressed."}
                    </p>
                  </div>
                  <Switch checked={qsValue.quietHoursEnabled} onCheckedChange={(v) => setQsValue({ ...qsValue, quietHoursEnabled: v })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQsBranch(null)}>{t("cancel")}</Button>
            <Button onClick={saveQueueSettingsClick} disabled={qsSaving || qsLoading}>
              {qsSaving ? <Loader2 className="size-4 animate-spin me-1" /> : null}{t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
