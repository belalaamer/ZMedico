import { useEffect, useState } from "react";
import { Plus, Search, Edit3, Phone, Mail, Power, Truck, MoreHorizontal, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Supplier = any;

export default function Suppliers() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Supplier[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [form, setForm] = useState({
    name: "", contact_person: "", phone: "", email: "", address: "", tax_number: "", notes: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const load = async () => {
    const { data } = await supabase.from("suppliers").select("*").is("deleted_at", null).order("name_en");
    setItems(data ?? []);
    const { data: prods } = await supabase.from("products").select("supplier_id").is("deleted_at", null).not("supplier_id", "is", null);
    const c: Record<string, number> = {};
    (prods ?? []).forEach((p: any) => { c[p.supplier_id] = (c[p.supplier_id] ?? 0) + 1; });
    setCounts(c);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEdit(null); setForm({ name: "", contact_person: "", phone: "", email: "", address: "", tax_number: "", notes: "" }); setOpen(true); };
  const openEdit = (s: Supplier) => {
    setEdit(s);
    setForm({
      name: s.name_en || s.name_ar || "", contact_person: s.contact_person ?? "",
      phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "",
      tax_number: s.tax_number ?? "", notes: s.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) { toast.error("Name required"); return; }
    const payload: any = {
      name_en: name, name_ar: name,
      contact_person: form.contact_person || null,
      phone: form.phone || null, email: form.email || null,
      address: form.address || null, tax_number: form.tax_number || null, notes: form.notes || null,
    };
    const { error } = edit
      ? await supabase.from("suppliers").update(payload).eq("id", edit.id)
      : await supabase.from("suppliers").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(t("save")); setOpen(false); load();
  };

  const toggleActive = async (s: Supplier) => {
    const { error } = await supabase.from("suppliers").update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const softDelete = async (s: Supplier) => {
    const { error } = await supabase.from("suppliers").update({ deleted_at: new Date().toISOString() } as any).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete"));
    load();
  };

  const filtered = items.filter((s) => {
    if (!q) return true;
    const text = `${s.name_en} ${s.name_ar} ${s.contact_person ?? ""} ${s.phone ?? ""} ${s.email ?? ""}`.toLowerCase();
    return text.includes(q.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("suppliers")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-card border border-border shadow-sm rounded-lg p-1.5">
            <div className="relative w-64">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9 border-0 shadow-none focus-visible:ring-1" />
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground" onClick={openNew}><Plus className="me-2 size-4" />{t("addSupplier")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{edit ? t("supplier") : t("newSupplier")}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2"><Label>{t("name")} / الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} /></div>
                <div className="space-y-2"><Label>{t("contactPerson")}</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} maxLength={120} /></div>
                <div className="space-y-2"><Label>{t("phone")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} placeholder="+20..." /></div>
                <div className="space-y-2"><Label>{t("email")}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} /></div>
                <div className="space-y-2"><Label>{t("taxNumber")}</Label><Input value={form.tax_number} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} maxLength={60} /></div>
                <div className="space-y-2 sm:col-span-2"><Label>{t("address")}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={300} /></div>
                <div className="space-y-2 sm:col-span-2"><Label>{t("notes")}</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} rows={3} /></div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                <Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noSuppliers")}</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((s) => (
              <div key={s.id} className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Truck className="size-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">{lang === "ar" ? s.name_ar : s.name_en}</div>
                    <Badge variant="outline" className={s.is_active ? "status-completed" : "status-departed"}>{s.is_active ? t("active") : t("inactive")}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                    {s.contact_person && <span className="font-medium">{s.contact_person}</span>}
                    {s.phone && (
                      <span className="inline-flex items-center gap-1 bg-muted/60 rounded-md px-2 py-0.5">
                        <Phone className="size-3 text-blue-500" />
                        <span className="tabular-nums">{s.phone}</span>
                      </span>
                    )}
                    {s.email && (
                      <span className="inline-flex items-center gap-1 bg-muted/60 rounded-md px-2 py-0.5">
                        <Mail className="size-3 text-amber-500" />
                        <span className="truncate max-w-[220px]">{s.email}</span>
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">{counts[s.id] ?? 0} {t("productsCount")}</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="actions">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(s)}>
                      <Edit3 className="me-2 size-4" />{t("edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleActive(s)}>
                      <Power className="me-2 size-4" />{s.is_active ? t("inactive") : t("active")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTarget(s)}
                    >
                      <Trash2 className="me-2 size-4" />{t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? "هل أنت متأكد من حذف هذا المورد؟ لا يمكن التراجع عن هذا الإجراء."
                : "Are you sure you want to delete this supplier? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (deleteTarget) { await softDelete(deleteTarget); setDeleteTarget(null); } }}
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