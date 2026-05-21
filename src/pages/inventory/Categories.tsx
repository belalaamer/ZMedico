import { useEffect, useState } from "react";
import { Plus, ChevronRight, FolderTree, Trash2, Edit3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Cat = { id: string; name_en: string; name_ar: string; parent_id: string | null; is_active: boolean; description: string | null };

export default function Categories() {
  const { t, lang } = useI18n();
  const [cats, setCats] = useState<Cat[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Cat | null>(null);
  const [form, setForm] = useState({ name: "", parent_id: "" as string, description: "" });

  const load = async () => {
    const { data } = await supabase.from("product_categories").select("*").order("name_en");
    setCats((data ?? []) as Cat[]);
    const { data: prods } = await supabase.from("products").select("category_id").is("deleted_at", null).not("category_id", "is", null);
    const c: Record<string, number> = {};
    (prods ?? []).forEach((p: any) => { c[p.category_id] = (c[p.category_id] ?? 0) + 1; });
    setCounts(c);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEdit(null); setForm({ name: "", parent_id: "", description: "" }); setOpen(true); };
  const openEdit = (c: Cat) => { setEdit(c); setForm({ name: c.name_en || c.name_ar || "", parent_id: c.parent_id ?? "", description: c.description ?? "" }); setOpen(true); };

  const save = async () => {
    const name = form.name.trim();
    if (!name) { toast.error("Name required"); return; }
    const payload = {
      name_en: name,
      name_ar: name,
      parent_id: form.parent_id || null,
      description: form.description || null,
    };
    const { error } = edit
      ? await supabase.from("product_categories").update(payload).eq("id", edit.id)
      : await supabase.from("product_categories").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(t("save"));
    setOpen(false); load();
  };

  const del = async (id: string) => {
    if (counts[id]) { toast.error("Cannot delete: category has products"); return; }
    const { error } = await supabase.from("product_categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };

  const roots = cats.filter((c) => !c.parent_id);
  const childrenOf = (pid: string) => cats.filter((c) => c.parent_id === pid);

  const Row = ({ c, depth }: { c: Cat; depth: number }) => (
    <>
      <div className="flex items-center gap-2 py-2 px-3 hover:bg-muted/40 rounded-lg" style={{ paddingInlineStart: 12 + depth * 24 }}>
        {childrenOf(c.id).length > 0 ? <ChevronRight className="size-4 text-muted-foreground" /> : <FolderTree className="size-4 text-muted-foreground" />}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{lang === "ar" ? c.name_ar : c.name_en}</div>
          {c.description && <div className="text-xs text-muted-foreground truncate">{c.description}</div>}
        </div>
        <Badge variant="outline" className="text-[10px]">{counts[c.id] ?? 0} {t("productsCount")}</Badge>
        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Edit3 className="size-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => del(c.id)} disabled={!!counts[c.id]}><Trash2 className="size-4" /></Button>
      </div>
      {childrenOf(c.id).map((ch) => <Row key={ch.id} c={ch} depth={depth + 1} />)}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("categories")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{cats.length}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground" onClick={openNew}><Plus className="me-2 size-4" />{t("addCategory")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit ? t("editProduct") : t("newCategory")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2"><Label>{t("name")} / الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} /></div>
              <div className="space-y-2">
                <Label>{t("parentCategory")}</Label>
                <Select value={form.parent_id || "none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— {t("none")} —</SelectItem>
                    {cats.filter((c) => c.id !== edit?.id).map((c) => <SelectItem key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>{t("description")}</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-3 shadow-card">
        {cats.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noCategories")}</div>
        ) : (
          <div className="space-y-1">{roots.map((c) => <Row key={c.id} c={c} depth={0} />)}</div>
        )}
      </Card>
    </div>
  );
}