import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { RowActions } from "@/components/RowActions";

export default function Procedures() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [specs, setSpecs] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [specFilter, setSpecFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ specialty_id: "", code: "", name: "", description: "", default_duration: 30, default_price: 0, doctor_commission_percent: 0, is_active: true });

  const load = async () => {
    const [{ data }, { data: s }] = await Promise.all([
      supabase.from("procedures").select("*").is("deleted_at", null).order("name_en").limit(2000),
      supabase.from("medical_specialties").select("*").eq("is_active", true).order("name_en"),
    ]);
    setItems(data ?? []); setSpecs(s ?? []);
  };
  useEffect(() => { load(); }, []);

  const remove = async (p: any): Promise<void> => {
    const { count } = await supabase.from("record_procedures").select("id", { count: "exact", head: true }).eq("procedure_id", p.id);
    if ((count ?? 0) > 0) { toast.error(lang === "ar" ? "لا يمكن الحذف: الإجراء مستخدم في سجلات طبية" : "Cannot delete: procedure is used in medical records"); return; }
    const { error } = await supabase.from("procedures").update({ deleted_at: new Date().toISOString() } as any).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };

  const filtered = useMemo(() => items.filter((i) => {
    if (q && !`${i.code ?? ""} ${i.name_en} ${i.name_ar}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (specFilter !== "all" && i.specialty_id !== specFilter) return false;
    return true;
  }), [items, q, specFilter]);

  const openNew = () => { setEdit(null); setForm({ specialty_id: "", code: "", name: "", description: "", default_duration: 30, default_price: 0, doctor_commission_percent: 0, is_active: true }); setOpen(true); };
  const openEdit = (p: any) => { setEdit(p); setForm({ specialty_id: p.specialty_id ?? "", code: p.code ?? "", name: p.name_en || p.name_ar || "", description: p.description_en || p.description_ar || "", default_duration: p.default_duration ?? 30, default_price: Number(p.default_price ?? 0), doctor_commission_percent: Number(p.doctor_commission_percent ?? 0), is_active: p.is_active }); setOpen(true); };

  const save = async () => {
    const name = form.name.trim();
    const desc = form.description.trim();
    if (!name) return toast.error("Name required");
    const payload = {
      specialty_id: form.specialty_id || null, code: form.code || null,
      name_en: name, name_ar: name,
      description_en: desc || null, description_ar: desc || null,
      default_duration: Number(form.default_duration) || null,
      default_price: Number(form.default_price) || null,
      doctor_commission_percent: Math.max(0, Math.min(100, Number(form.doctor_commission_percent) || 0)),
      is_active: form.is_active,
    };
    const { error } = edit
      ? await supabase.from("procedures").update(payload).eq("id", edit.id)
      : await supabase.from("procedures").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("save")); setOpen(false); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("proceduresCatalog")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-56"><Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9" /></div>
          <Select value={specFilter} onValueChange={setSpecFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("specialty")}: {t("none")}</SelectItem>
              {specs.map((s) => <SelectItem key={s.id} value={s.id}>{lang === "ar" ? s.name_ar : s.name_en}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground" onClick={openNew}><Plus className="me-2 size-4" />{t("addProcedureCat")}</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{edit ? t("editRecord") : t("addProcedureCat")}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>{t("code")}</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={20} /></div>
                <div className="space-y-2"><Label>{t("specialty")}</Label>
                  <Select value={form.specialty_id || "none"} onValueChange={(v) => setForm({ ...form, specialty_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— {t("none")} —</SelectItem>
                      {specs.map((s) => <SelectItem key={s.id} value={s.id}>{lang === "ar" ? s.name_ar : s.name_en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2"><Label>{t("name")} / الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200} /></div>
                <div className="space-y-2"><Label>{t("defaultDuration")}</Label><Input type="number" min={0} value={form.default_duration} onChange={(e) => setForm({ ...form, default_duration: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label>{t("defaultPrice")}</Label><Input type="number" min={0} step="0.01" value={form.default_price} onChange={(e) => setForm({ ...form, default_price: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label>{t("doctorCommissionPercent")}</Label><Input type="number" min={0} max={100} step="0.01" value={form.doctor_commission_percent} onChange={(e) => setForm({ ...form, doctor_commission_percent: Number(e.target.value) })} /></div>
                <div className="space-y-2 col-span-2"><Label>{t("description")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} rows={2} /></div>
                <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2 col-span-2"><Label>{t("active")}</Label><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
              </div>
              <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button><Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Card className="shadow-card overflow-hidden">
        <div className="divide-y divide-border">
          {filtered.map((p) => {
            const s = specs.find((x) => x.id === p.specialty_id);
            return (
              <div key={p.id} className="flex items-center gap-4 p-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Activity className="size-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><div className="font-medium truncate">{lang === "ar" ? p.name_ar : p.name_en}</div>{p.code && <Badge variant="outline" className="font-mono text-[10px]">{p.code}</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{s ? (lang === "ar" ? s.name_ar : s.name_en) : "—"} · {p.default_duration ?? 0} {t("durationMin")}</div>
                </div>
                <div className="text-end font-semibold tabular-nums text-primary">{formatMoney(p.default_price ?? 0, lang)}</div>
                {!p.is_active && <Badge variant="outline" className="status-departed">{t("inactive")}</Badge>}
                <RowActions onEdit={() => openEdit(p)} onDelete={() => remove(p)} />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}