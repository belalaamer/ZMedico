import { useEffect, useState } from "react";
import { Plus, Edit3, Briefcase, GitMerge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RowActions } from "@/components/RowActions";
import { Can } from "@/components/Can";

export default function Positions() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [filterDept, setFilterDept] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [edit, setE] = useState<any>(null);
  const [form, setForm] = useState({ title: "", department_id: "", description: "", salary_range_min: "", salary_range_max: "", group_key: "", sort_order: "" });
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSrc, setMergeSrc] = useState<string>("");
  const [mergeTgt, setMergeTgt] = useState<string>("");
  const [merging, setMerging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<any>(null);

  const load = async () => {
    const { data } = await supabase.from("staff_positions").select("*").is("deleted_at", null);
    setItems(data ?? []);
    const { data: d } = await supabase.from("departments").select("id,name_en,name_ar");
    setDepts(d ?? []);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setE(null); setForm({ title: "", department_id: "", description: "", salary_range_min: "", salary_range_max: "", group_key: "", sort_order: "" }); setOpen(true); };
  const openEdit = (p: any) => { setE(p); setForm({ title: p.title_en || p.title_ar || "", department_id: p.department_id ?? "", description: p.description_en || p.description_ar || "", salary_range_min: p.salary_range_min?.toString() ?? "", salary_range_max: p.salary_range_max?.toString() ?? "", group_key: p.group_key ?? "", sort_order: p.sort_order != null ? String(p.sort_order) : "" }); setOpen(true); };
  const save = async () => {
    const title = form.title.trim();
    const desc = form.description.trim();
    if (!title) { toast.error("Title required"); return; }
    const payload: any = {
      title_en: title, title_ar: title,
      department_id: form.department_id || null,
      description_en: desc || null, description_ar: desc || null,
      salary_range_min: form.salary_range_min ? Number(form.salary_range_min) : null,
      salary_range_max: form.salary_range_max ? Number(form.salary_range_max) : null,
      group_key: form.group_key.trim() ? form.group_key.trim().toLowerCase() : null,
      sort_order: form.sort_order !== "" ? Number(form.sort_order) : 0,
    };
    const { error } = edit
      ? await supabase.from("staff_positions").update(payload).eq("id", edit.id)
      : await supabase.from("staff_positions").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("save")); setOpen(false); load();
  };

  const deptName = (id: string | null) => { const d = depts.find((x) => x.id === id); return d ? (lang === "ar" ? d.name_ar : d.name_en) : "—"; };

  const softDelete = async (p: any) => {
    const { count } = await supabase.from("staff_profiles").select("id", { count: "exact", head: true }).eq("position_id", p.id);
    if ((count ?? 0) > 0) { toast.error(lang === "ar" ? "لا يمكن الحذف: مرتبط بموظفين" : "Cannot delete: in use by staff"); return; }
    const { error } = await supabase.from("staff_positions").update({ deleted_at: new Date().toISOString() } as any).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };
  const filtered = filterDept === "all" ? items : items.filter((p) => p.department_id === filterDept);

  const label = (p: any) => (lang === "ar" ? p.title_ar : p.title_en) || p.title_en || p.title_ar || "";
  const sortedFiltered = [...filtered].sort((a, b) => {
    const ga = (a.group_key || "zzz").toLowerCase();
    const gb = (b.group_key || "zzz").toLowerCase();
    if (ga !== gb) return ga.localeCompare(gb);
    const oa = a.sort_order ?? 0; const ob = b.sort_order ?? 0;
    if (oa !== ob) return oa - ob;
    return label(a).localeCompare(label(b), lang === "ar" ? "ar" : "en");
  });
  const groups: Array<[string, any[]]> = [];
  for (const p of sortedFiltered) {
    const k = (p.group_key || "general").toLowerCase();
    const last = groups[groups.length - 1];
    if (last && last[0] === k) last[1].push(p);
    else groups.push([k, [p]]);
  }

  const doMerge = async () => {
    if (!mergeSrc || !mergeTgt) { toast.error(lang === "ar" ? "اختر الموضعين" : "Select both positions"); return; }
    if (mergeSrc === mergeTgt) { toast.error(lang === "ar" ? "لا يمكن الدمج مع نفسه" : "Cannot merge into itself"); return; }
    if (!confirm(lang === "ar" ? "تأكيد دمج هذا المنصب؟ سيتم نقل الموظفين وحذف المصدر." : "Confirm merge? Staff will be re-pointed and the source position soft-deleted.")) return;
    setMerging(true);
    const { error } = await supabase.rpc("merge_staff_position" as any, { source_id: mergeSrc, target_id: mergeTgt });
    setMerging(false);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم الدمج" : "Merged");
    setMergeOpen(false); setMergeSrc(""); setMergeTgt(""); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("positions")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{sortedFiltered.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t("department")} /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("filterAll") || "All"}</SelectItem>{depts.map((d) => <SelectItem key={d.id} value={d.id}>{lang === "ar" ? d.name_ar : d.name_en}</SelectItem>)}</SelectContent>
          </Select>
          <Can permission="hr.edit">
            <Button variant="outline" onClick={() => { setMergeSrc(""); setMergeTgt(""); setMergeOpen(true); }}>
              <GitMerge className="me-2 size-4" />{lang === "ar" ? "دمج" : "Merge"}
            </Button>
          </Can>
          <Can permission="hr.create">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground" onClick={openNew}><Plus className="me-2 size-4" />{t("addPosition")}</Button></DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>{edit ? t("position") : t("newPosition")}</DialogTitle></DialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2 sm:col-span-2"><Label>{t("title")} / المسمى</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} /></div>
                  <div className="space-y-2 sm:col-span-2"><Label>{t("department")}</Label>
                    <Select value={form.department_id || "none"} onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="none">— {t("none")} —</SelectItem>{depts.map((d) => <SelectItem key={d.id} value={d.id}>{lang === "ar" ? d.name_ar : d.name_en}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>{lang === "ar" ? "المجموعة" : "Group"}</Label><Input value={form.group_key} placeholder="e.g. medical, admin, support" onChange={(e) => setForm({ ...form, group_key: e.target.value })} maxLength={60} /></div>
                  <div className="space-y-2"><Label>{lang === "ar" ? "الترتيب" : "Sort order"}</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t("salaryMin")}</Label><Input type="number" value={form.salary_range_min} onChange={(e) => setForm({ ...form, salary_range_min: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t("salaryMax")}</Label><Input type="number" value={form.salary_range_max} onChange={(e) => setForm({ ...form, salary_range_max: e.target.value })} /></div>
                  <div className="space-y-2 sm:col-span-2"><Label>{t("description")}</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} /></div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                  <Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Can>
          <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{lang === "ar" ? "دمج المناصب" : "Merge positions"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "المصدر (سيتم حذفه)" : "Source (will be soft-deleted)"}</Label>
                  <Select value={mergeSrc} onValueChange={setMergeSrc}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{sortedFiltered.map((p) => <SelectItem key={p.id} value={p.id}>{label(p)}{p.group_key ? ` · ${p.group_key}` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "الهدف (الأساسي)" : "Target (canonical)"}</Label>
                  <Select value={mergeTgt} onValueChange={setMergeTgt}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{sortedFiltered.filter((p) => p.id !== mergeSrc).map((p) => <SelectItem key={p.id} value={p.id}>{label(p)}{p.group_key ? ` · ${p.group_key}` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">{lang === "ar" ? "سيتم نقل الموظفين من المصدر إلى الهدف." : "Staff assigned to the source will be re-pointed to the target."}</p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setMergeOpen(false)}>{t("cancel")}</Button>
                <Button className="gradient-primary text-primary-foreground" onClick={doMerge} disabled={merging || !mergeSrc || !mergeTgt || mergeSrc === mergeTgt}>
                  <GitMerge className="me-2 size-4" />{lang === "ar" ? "دمج" : "Merge"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Card className="shadow-card overflow-hidden">
        {sortedFiltered.length === 0 ? <div className="p-10 text-center text-muted-foreground">{t("noPositions")}</div> : (
          <div>
            {groups.map(([group, list]) => (
              <div key={group}>
                <div className="px-4 py-2 bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">{group}</div>
                <div className="divide-y divide-border">
                  {list.map((p) => (
                    <div key={p.id} className="flex items-center gap-4 p-4">
                      <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Briefcase className="size-5" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{lang === "ar" ? p.title_ar : p.title_en}</div>
                        <div className="text-xs text-muted-foreground">{deptName(p.department_id)} · #{p.sort_order ?? 0}</div>
                      </div>
                      {(p.salary_range_min || p.salary_range_max) && <Badge variant="outline">{p.salary_range_min ?? "—"} – {p.salary_range_max ?? "—"}</Badge>}
                      <Can permission="hr.edit">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Edit3 className="size-4" /></Button>
                      </Can>
                      <Can permission="hr.delete">
                        <RowActions onEdit={() => openEdit(p)} onDelete={() => setPendingDelete(p)} canEdit={false} />
                      </Can>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "حذف المنصب" : "Delete position"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? "هل أنت متأكد من حذف هذا المنصب؟ لا يمكن التراجع عن هذا الإجراء."
                : "Are you sure you want to delete this position? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingDelete) { softDelete(pendingDelete); setPendingDelete(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
