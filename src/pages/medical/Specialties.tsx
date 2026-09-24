import { useEffect, useState } from "react";
import { Plus, Edit3, Stethoscope } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Spec = { id: string; tenant_id: string | null; name_en: string; name_ar: string; description: string | null; icon: string | null; is_active: boolean };

export default function Specialties() {
  const { t, lang } = useI18n();
  const { subscription } = useBranch();
  const { authz } = useAuthorization("Specialties");
  const canManageCatalog = authz.can("settings.catalog.update");
  const isSystemOwner = authz.holdsAnyRole("system_owner");
  const [items, setItems] = useState<Spec[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Spec | null>(null);
  const [form, setForm] = useState({ name: "", description: "", icon: "🩺", is_active: true });

  const load = async () => {
    const { data } = await supabase.from("medical_specialties").select("*").order("name_en");
    setItems((data ?? []) as any);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    if (!canManageCatalog || !subscription?.tenant_id) return;
    setEdit(null); setForm({ name: "", description: "", icon: "🩺", is_active: true }); setOpen(true); };
  const openEdit = (s: Spec) => {
    if (!(isSystemOwner || (canManageCatalog && s.tenant_id === subscription?.tenant_id))) return;
    setEdit(s); setForm({ name: s.name_en || s.name_ar || "", description: s.description ?? "", icon: s.icon ?? "🩺", is_active: s.is_active }); setOpen(true); };

  const save = async () => {
    const name = form.name.trim();
    // UX fix: hardcoded English regardless of `lang`, in a file that
    // otherwise fully supports both languages.
    if (!name) { toast.error(lang === "ar" ? "الاسم مطلوب" : "Name required"); return; }
    const payload = {
      ...(!edit ? { tenant_id: subscription?.tenant_id } : {}),
      name_en: name, name_ar: name,
      description: form.description || null,
      icon: form.icon || null,
      is_active: form.is_active,
    };
    const { error } = edit
      ? await supabase.from("medical_specialties").update(payload).eq("id", edit.id)
      : await supabase.from("medical_specialties").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("save")); setOpen(false); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("specialties")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length}</p>
        </div>
        {canManageCatalog && subscription?.tenant_id ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground" onClick={openNew}><Plus className="me-2 size-4" />{t("addSpecialty")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{edit ? t("editRecord") : t("addSpecialty")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-[80px_1fr] gap-3">
                <div className="space-y-2"><Label>{t("icon")}</Label><Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={4} className="text-center text-2xl" /></div>
                <div className="space-y-2"><Label>{t("name")} / الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} /></div>
              </div>
              <div className="space-y-2"><Label>{t("description")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} rows={2} /></div>
              <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2"><Label>{t("active")}</Label><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
            </div>
            <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button><Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        ) : null}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((s) => (
          <Card key={s.id} className="p-5 shadow-card flex items-start gap-3">
            <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-2xl">{s.icon || <Stethoscope className="size-5" />}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-semibold truncate">{lang === "ar" ? s.name_ar : s.name_en}</div>
                {!s.is_active && <Badge variant="outline" className="status-departed text-[10px]">{t("inactive")}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description || "—"}</div>
            </div>
            {(isSystemOwner || (canManageCatalog && s.tenant_id === subscription?.tenant_id)) ? (
              <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Edit3 className="size-4" /></Button>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
