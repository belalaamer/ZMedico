import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Shield } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Row = any;

export default function InsuranceCompanies() {
  const { t, lang } = useI18n();
  // R2: admin-only edit affordances routed through AuthorizationService.
  const { authz } = useAuthorization("InsuranceCompanies");
  const canEdit = authz.isSuperAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<any>({});

  const load = async () => {
    const { data } = await (supabase as any).from("insurance_companies").select("*").order("name_en");
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({ default_coverage_ratio: 80, is_active: true }); setOpen(true); };
  const openEdit = (r: Row) => { setEditing(r); setForm(r); setOpen(true); };

  const save = async () => {
    if (!form.name_en?.trim()) return toast.error(lang === "ar" ? "الاسم مطلوب" : "Name required");
    const payload = {
      name_en: form.name_en?.trim(),
      name_ar: form.name_ar?.trim() || null,
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
      address: form.address || null,
      default_coverage_ratio: Number(form.default_coverage_ratio) || 0,
      is_active: !!form.is_active,
      notes: form.notes || null,
    };
    const { error } = editing
      ? await (supabase as any).from("insurance_companies").update(payload).eq("id", editing.id)
      : await (supabase as any).from("insurance_companies").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("save")); setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm(lang === "ar" ? "حذف؟" : "Delete?")) return;
    const { error } = await (supabase as any).from("insurance_companies").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("save")); load();
  };

  const filtered = rows.filter(r => !q || (r.name_en + r.name_ar + r.contact_phone).toLowerCase().includes(q.toLowerCase()));

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            <h1 className="text-2xl font-bold">{lang === "ar" ? "شركات التأمين" : "Insurance Companies"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Input className="w-56" placeholder={t("search")} value={q} onChange={e => setQ(e.target.value)} />
            {canEdit && (
              <Button onClick={openNew} className="gradient-primary text-primary-foreground">
                <Plus className="me-2 size-4" />{lang === "ar" ? "إضافة" : "New"}
              </Button>
            )}
          </div>
        </div>
        <Card className="overflow-hidden">
          <div className="divide-y">
            {filtered.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{lang === "ar" ? (r.name_ar || r.name_en) : r.name_en}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.contact_phone} {r.contact_email && `• ${r.contact_email}`}
                  </div>
                </div>
                <Badge variant="outline">{r.default_coverage_ratio}%</Badge>
                {r.is_active
                  ? <Badge className="status-completed">{lang === "ar" ? "نشط" : "Active"}</Badge>
                  : <Badge variant="outline">{lang === "ar" ? "متوقف" : "Inactive"}</Badge>}
                {canEdit && (
                  <>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)} className="text-destructive"><Trash2 className="size-4" /></Button>
                  </>
                )}
              </div>
            ))}
            {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">{t("noData")}</div>}
          </div>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? (lang === "ar" ? "تعديل" : "Edit") : (lang === "ar" ? "شركة تأمين جديدة" : "New Insurance Company")}</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{lang === "ar" ? "الاسم (EN)" : "Name (EN)"}</Label><Input value={form.name_en ?? ""} onChange={e => setForm({ ...form, name_en: e.target.value })} /></div>
            <div className="space-y-1"><Label>{lang === "ar" ? "الاسم (AR)" : "Name (AR)"}</Label><Input dir="rtl" value={form.name_ar ?? ""} onChange={e => setForm({ ...form, name_ar: e.target.value })} /></div>
            <div className="space-y-1"><Label>{lang === "ar" ? "الهاتف" : "Phone"}</Label><Input value={form.contact_phone ?? ""} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></div>
            <div className="space-y-1"><Label>{lang === "ar" ? "البريد" : "Email"}</Label><Input type="email" value={form.contact_email ?? ""} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>{lang === "ar" ? "العنوان" : "Address"}</Label><Input value={form.address ?? ""} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="space-y-1"><Label>{lang === "ar" ? "نسبة التغطية الافتراضية %" : "Default Coverage %"}</Label><Input type="number" min={0} max={100} value={form.default_coverage_ratio ?? 80} onChange={e => setForm({ ...form, default_coverage_ratio: e.target.value })} /></div>
            <div className="space-y-1"><Label>{lang === "ar" ? "نشط" : "Active"}</Label><div className="pt-2"><Switch checked={!!form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /></div></div>
            <div className="space-y-1 sm:col-span-2"><Label>{t("notes")}</Label><Textarea rows={3} value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={save} className="gradient-primary text-primary-foreground">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsLayout>
  );
}