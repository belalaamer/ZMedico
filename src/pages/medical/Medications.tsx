import { useEffect, useMemo, useState } from "react";
import { Plus, Edit3, Search, Pill } from "lucide-react";
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

const FORMS = ["tablet", "capsule", "syrup", "drops", "cream", "ointment", "inhaler", "injection", "solution", "spray"];

export default function Medications() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ name_en: "", name_ar: "", generic_name: "", dosage_form: "tablet", strength: "", unit: "piece", instructions_en: "", instructions_ar: "", product_id: "", is_active: true });

  const load = async () => {
    const [{ data }, { data: p }] = await Promise.all([
      supabase.from("medications").select("*").order("name_en").limit(2000),
      supabase.from("products").select("id,sku,name_en,name_ar").eq("is_active", true).order("name_en").limit(1000),
    ]);
    setItems(data ?? []); setProducts(p ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((i) =>
    !q || `${i.name_en} ${i.name_ar} ${i.generic_name ?? ""}`.toLowerCase().includes(q.toLowerCase())
  ), [items, q]);

  const openNew = () => { setEdit(null); setForm({ name_en: "", name_ar: "", generic_name: "", dosage_form: "tablet", strength: "", unit: "piece", instructions_en: "", instructions_ar: "", product_id: "", is_active: true }); setOpen(true); };
  const openEdit = (m: any) => {
    setEdit(m);
    setForm({
      name_en: m.name_en, name_ar: m.name_ar, generic_name: m.generic_name ?? "",
      dosage_form: m.dosage_form, strength: m.strength ?? "", unit: m.unit ?? "piece",
      instructions_en: m.instructions_en ?? "", instructions_ar: m.instructions_ar ?? "",
      product_id: m.product_id ?? "", is_active: m.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name_en.trim() || !form.name_ar.trim()) return toast.error("Name required");
    const payload = {
      name_en: form.name_en.trim(), name_ar: form.name_ar.trim(),
      generic_name: form.generic_name || null,
      dosage_form: form.dosage_form, strength: form.strength || null, unit: form.unit,
      instructions_en: form.instructions_en || null, instructions_ar: form.instructions_ar || null,
      product_id: form.product_id || null, is_active: form.is_active,
    };
    const { error } = edit
      ? await supabase.from("medications").update(payload).eq("id", edit.id)
      : await supabase.from("medications").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("save")); setOpen(false); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("medications")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-56"><Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9" /></div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground" onClick={openNew}><Plus className="me-2 size-4" />{t("addMedicationCat")}</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{edit ? t("editRecord") : t("addMedicationCat")}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>{t("nameEn")}</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} maxLength={150} /></div>
                <div className="space-y-2"><Label>{t("nameAr")}</Label><Input dir="rtl" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} maxLength={150} /></div>
                <div className="space-y-2 col-span-2"><Label>{t("genericName")}</Label><Input value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} maxLength={150} /></div>
                <div className="space-y-2"><Label>{t("dosageForm")}</Label>
                  <Select value={form.dosage_form} onValueChange={(v) => setForm({ ...form, dosage_form: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FORMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t("strength")}</Label><Input value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} placeholder="500mg" maxLength={40} /></div>
                <div className="space-y-2 col-span-2">
                  <Label>{t("product")} ({t("inventory")})</Label>
                  <Select value={form.product_id || "none"} onValueChange={(v) => setForm({ ...form, product_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— {t("none")} —</SelectItem>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} · {lang === "ar" ? p.name_ar : p.name_en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2"><Label>{t("instructions")} (EN)</Label><Textarea value={form.instructions_en} onChange={(e) => setForm({ ...form, instructions_en: e.target.value })} maxLength={300} rows={2} /></div>
                <div className="space-y-2 col-span-2"><Label>{t("instructions")} (AR)</Label><Textarea dir="rtl" value={form.instructions_ar} onChange={(e) => setForm({ ...form, instructions_ar: e.target.value })} maxLength={300} rows={2} /></div>
                <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2 col-span-2"><Label>{t("active")}</Label><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
              </div>
              <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button><Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Card className="shadow-card overflow-hidden">
        <div className="divide-y divide-border">
          {filtered.map((m) => (
            <div key={m.id} className="flex items-center gap-4 p-3">
              <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Pill className="size-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{lang === "ar" ? m.name_ar : m.name_en} {m.strength && <span className="text-xs text-muted-foreground">· {m.strength}</span>}</div>
                <div className="text-xs text-muted-foreground truncate">{m.generic_name} · {m.dosage_form}</div>
              </div>
              {!m.is_active && <Badge variant="outline" className="status-departed">{t("inactive")}</Badge>}
              <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Edit3 className="size-4" /></Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}