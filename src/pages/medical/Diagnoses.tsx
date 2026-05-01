import { useEffect, useMemo, useState } from "react";
import { Plus, Edit3, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Dx = { id: string; code: string; name_en: string; name_ar: string; category: string | null; description_en: string | null; description_ar: string | null };

export default function Diagnoses() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Dx[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Dx | null>(null);
  const [form, setForm] = useState({ code: "", name_en: "", name_ar: "", category: "", description_en: "", description_ar: "" });

  const load = async () => {
    const { data } = await supabase.from("diagnoses").select("*").order("code").limit(2000);
    setItems((data ?? []) as any);
  };
  useEffect(() => { load(); }, []);

  const cats = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter(Boolean) as string[])).sort(), [items]);
  const filtered = useMemo(() => items.filter((i) => {
    if (q && !`${i.code} ${i.name_en} ${i.name_ar}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (cat !== "all" && i.category !== cat) return false;
    return true;
  }), [items, q, cat]);

  const openNew = () => { setEdit(null); setForm({ code: "", name_en: "", name_ar: "", category: "", description_en: "", description_ar: "" }); setOpen(true); };
  const openEdit = (d: Dx) => { setEdit(d); setForm({ code: d.code, name_en: d.name_en, name_ar: d.name_ar, category: d.category ?? "", description_en: d.description_en ?? "", description_ar: d.description_ar ?? "" }); setOpen(true); };

  const save = async () => {
    if (!form.code.trim() || !form.name_en.trim() || !form.name_ar.trim()) return toast.error("Code & name required");
    const payload = {
      code: form.code.trim().toUpperCase(),
      name_en: form.name_en.trim(), name_ar: form.name_ar.trim(),
      category: form.category || null,
      description_en: form.description_en || null, description_ar: form.description_ar || null,
    };
    const { error } = edit
      ? await supabase.from("diagnoses").update(payload).eq("id", edit.id)
      : await supabase.from("diagnoses").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("save")); setOpen(false); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("diagnoses")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} / {items.length}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-56"><Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9" /></div>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("category")}: {t("none")}</SelectItem>
              {cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground" onClick={openNew}><Plus className="me-2 size-4" />{t("addDiagnosisDx")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{edit ? t("editRecord") : t("addDiagnosisDx")}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>{t("code")}</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={20} /></div>
                <div className="space-y-2"><Label>{t("category")}</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={50} /></div>
                <div className="space-y-2 col-span-2"><Label>{t("nameEn")}</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} maxLength={200} /></div>
                <div className="space-y-2 col-span-2"><Label>{t("nameAr")}</Label><Input dir="rtl" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} maxLength={200} /></div>
                <div className="space-y-2 col-span-2"><Label>{t("description")} (EN)</Label><Textarea value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} maxLength={500} rows={2} /></div>
                <div className="space-y-2 col-span-2"><Label>{t("description")} (AR)</Label><Textarea dir="rtl" value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} maxLength={500} rows={2} /></div>
              </div>
              <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button><Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Card className="shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">—</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((d) => (
              <div key={d.id} className="flex items-center gap-4 p-3">
                <Badge variant="outline" className="font-mono">{d.code}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{lang === "ar" ? d.name_ar : d.name_en}</div>
                  <div className="text-xs text-muted-foreground truncate" dir={lang === "ar" ? "ltr" : "rtl"}>{lang === "ar" ? d.name_en : d.name_ar}</div>
                </div>
                {d.category && <Badge variant="outline">{d.category}</Badge>}
                <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Edit3 className="size-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}