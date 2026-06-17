import { useEffect, useMemo, useState } from "react";
import { useDataSync } from "@/lib/dataSync";
import { Plus, Search, Pencil, Trash2, Building2, Star, MapPin, ListChecks, Users, ScrollText, CalendarDays, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
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

type Branch = {
  id: string; name_ar: string; name_en: string; code: string | null;
  phone: string | null; email: string | null; address: string | null; city: string | null;
  is_main_branch: boolean; is_active: boolean; manager_id: string | null;
  working_hours_start: string | null; working_hours_end: string | null;
  allowed_latitude: number | null; allowed_longitude: number | null; allowed_radius: number | null;
};

type Staff = { id: string; full_name: string | null; email: string | null };

const empty = {
  name: "", code: "", phone: "", email: "", address: "", city: "",
  manager_id: "", working_hours_start: "09:00", working_hours_end: "21:00",
  is_main_branch: false, is_active: true,
};

export default function Branches() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [editId, setEditId] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
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

  const load = async () => {
    const { data } = await supabase.from("branches").select("*").order("created_at");
    setItems((data ?? []) as Branch[]);
    const { data: s } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
    setStaff((s ?? []) as Staff[]);
  };
  useEffect(() => { load(); }, []);
  useDataSync(["branches"], () => { load(); });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((b) =>
      !q || b.name_en.toLowerCase().includes(q) || b.name_ar.includes(q) ||
      (b.code ?? "").toLowerCase().includes(q) || (b.city ?? "").toLowerCase().includes(q));
  }, [items, search]);

  const openNew = () => { setEditId(null); setForm({ ...empty }); setOpen(true); };
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
      working_hours_start: b.working_hours_start ?? "09:00",
      working_hours_end: b.working_hours_end ?? "21:00",
      is_main_branch: b.is_main_branch,
      is_active: b.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: t("name"), variant: "destructive" }); return; }
    const payload: any = {
      name_en: form.name, name_ar: form.name,
      code: form.code || null,
      phone: form.phone || null, email: form.email || null,
      address: form.address || null, city: form.city || null,
      manager_id: form.manager_id || null,
      working_hours_start: form.working_hours_start || null,
      working_hours_end: form.working_hours_end || null,
      is_main_branch: form.is_main_branch, is_active: form.is_active,
    };
    let error;
    if (editId) {
      ({ error } = await supabase.from("branches").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("branches").insert(payload));
    }
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    // ensure single main branch
    if (form.is_main_branch) {
      await supabase.from("branches").update({ is_main_branch: false }).neq("id", editId ?? "00000000-0000-0000-0000-000000000000");
    }
    setOpen(false); load();
    toast({ title: t("saved") });
  };

  const remove = async () => {
    if (!delId) return;
    const { error } = await supabase.from("branches").delete().eq("id", delId);
    if (error) toast({ title: error.message, variant: "destructive" });
    else toast({ title: t("deleted") });
    setDelId(null); load();
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
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
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
    } as any).eq("id", locBranch.id);
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
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("city")}</TableHead>
                <TableHead>{t("manager")}</TableHead>
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
                  <TableCell className="font-mono text-xs">{b.code ?? "—"}</TableCell>
                  <TableCell>{b.city ?? "—"}</TableCell>
                  <TableCell>{staffName(b.manager_id)}</TableCell>
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
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">{t("noData") ?? "No data"}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete") ?? "Delete?"}</AlertDialogTitle>
            <AlertDialogDescription>{t("actionIrreversible") ?? "This action cannot be undone."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>{t("delete")}</AlertDialogAction>
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