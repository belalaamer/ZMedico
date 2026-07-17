import { useEffect, useMemo, useState } from "react";
import { useDataSync } from "@/lib/dataSync";
import { Plus, Search, Package, Edit3, Power, Copy, Upload, X, MoreHorizontal, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

const UNITS = ["piece", "box", "bottle", "session", "ml", "g"];

type Product = any;

function emptyForm() {
  return {
    sku: "", barcode: "", name: "", description: "",
    category_id: "", supplier_id: "", unit: "piece",
    cost_price: 0, selling_price: 0, min_stock_level: 10, max_stock_level: "" as any,
    expiry_tracking: false, image_url: "",
  };
}

export default function Products() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<Product[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [sups, setSups] = useState<any[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }
    const ALLOWED_MIME: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    if (!ALLOWED_MIME[file.type]) {
      toast.error("Only JPEG, PNG, WebP, or GIF images are allowed");
      return;
    }
    const ext = ALLOWED_MIME[file.type];
    const declaredExt = (file.name.split(".").pop() || "").toLowerCase();
    const validExts = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
    if (declaredExt && !validExts.has(declaredExt)) {
      toast.error("File extension does not match an allowed image type");
      return;
    }
    setUploading(true);
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: false, contentType: file.type });
    if (error) { setUploading(false); toast.error(error.message); return; }
    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
    setForm((f) => ({ ...f, image_url: pub.publicUrl }));
    setUploading(false);
  };

  const load = async () => {
    const [{ data: ps }, { data: cs }, { data: ss }] = await Promise.all([
      supabase.from("products").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("product_categories").select("*").eq("is_active", true).order("name_en"),
      supabase.from("suppliers").select("*").eq("is_active", true).is("deleted_at", null).order("name_en"),
    ]);
    setItems(ps ?? []); setCats(cs ?? []); setSups(ss ?? []);
    if (currentBranchId) {
      const { data: inv } = await supabase.from("inventory").select("product_id, quantity").eq("branch_id", currentBranchId);
      const map: Record<string, number> = {};
      (inv ?? []).forEach((x: any) => { map[x.product_id] = Number(x.quantity); });
      setStocks(map);
    } else {
      const { data: inv } = await supabase.from("inventory").select("product_id, quantity");
      const map: Record<string, number> = {};
      (inv ?? []).forEach((x: any) => { map[x.product_id] = (map[x.product_id] ?? 0) + Number(x.quantity); });
      setStocks(map);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId]);
  useDataSync(["products", "inventory", "inventory_transactions"], () => { load(); });

  const openNew = () => { setEdit(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (p: Product) => {
    setEdit(p);
    setForm({
      sku: p.sku ?? "", barcode: p.barcode ?? "",
      name: p.name_en || p.name_ar || "",
      description: p.description_en || p.description_ar || "",
      category_id: p.category_id ?? "", supplier_id: p.supplier_id ?? "",
      unit: p.unit ?? "piece", cost_price: Number(p.cost_price), selling_price: Number(p.selling_price),
      min_stock_level: p.min_stock_level, max_stock_level: p.max_stock_level ?? "",
      expiry_tracking: !!p.expiry_tracking, image_url: p.image_url ?? "",
    });
    setOpen(true);
  };

  const duplicate = (p: Product) => {
    setEdit(null);
    setForm({
      sku: "", barcode: "",
      name: (p.name_en || p.name_ar || "") + " (copy)",
      description: p.description_en || p.description_ar || "",
      category_id: p.category_id ?? "", supplier_id: p.supplier_id ?? "",
      unit: p.unit, cost_price: Number(p.cost_price), selling_price: Number(p.selling_price),
      min_stock_level: p.min_stock_level, max_stock_level: p.max_stock_level ?? "",
      expiry_tracking: !!p.expiry_tracking, image_url: p.image_url ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    const desc = form.description.trim();
    if (!name) { toast.error("Name required"); return; }
    const payload: any = {
      barcode: form.barcode || null,
      name_en: name, name_ar: name,
      description_en: desc || null, description_ar: desc || null,
      category_id: form.category_id || null, supplier_id: form.supplier_id || null,
      unit: form.unit, cost_price: Number(form.cost_price) || 0, selling_price: Number(form.selling_price) || 0,
      min_stock_level: Number(form.min_stock_level) || 0,
      max_stock_level: form.max_stock_level === "" ? null : Number(form.max_stock_level),
      expiry_tracking: form.expiry_tracking, image_url: form.image_url || null,
    };
    if (edit) {
      const { error } = await supabase.from("products").update(payload).eq("id", edit.id);
      if (error) { toast.error(error.message); return; }
    } else {
      if (form.sku) payload.sku = form.sku;
      const { error } = await supabase.from("products").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success(t("save")); setOpen(false); load();
  };

  const toggleActive = async (p: Product) => {
    const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const softDelete = async (p: Product): Promise<void> => {
    const { error } = await supabase.from("products").update({ deleted_at: new Date().toISOString() } as any).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };

  const filtered = useMemo(() => items.filter((p) => {
    if (q) {
      const text = `${p.name_en} ${p.name_ar} ${p.sku} ${p.barcode ?? ""}`.toLowerCase();
      if (!text.includes(q.toLowerCase())) return false;
    }
    if (catFilter !== "all" && p.category_id !== catFilter) return false;
    if (activeFilter === "active" && !p.is_active) return false;
    if (activeFilter === "inactive" && p.is_active) return false;
    return true;
  }), [items, q, catFilter, activeFilter]);

  const stockStatus = (p: Product) => {
    const qty = stocks[p.id] ?? 0;
    if (qty <= 0) return { label: t("outOfStock"), cls: "status-departed" };
    if (qty <= p.min_stock_level) return { label: t("lowStock"), cls: "status-progress" };
    return { label: t("inStock"), cls: "status-completed" };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("products")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-card border border-border shadow-sm rounded-lg p-1.5">
            <div className="relative w-56">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9 border-0 shadow-none focus-visible:ring-1" />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-44 border-0 shadow-none focus:ring-1"><SelectValue placeholder={t("category")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("category")}: {t("none")}</SelectItem>
                {cats.map((c) => <SelectItem key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-32 border-0 shadow-none focus:ring-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("status")}</SelectItem>
                <SelectItem value="active">{t("active")}</SelectItem>
                <SelectItem value="inactive">{t("inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground" onClick={openNew}><Plus className="me-2 size-4" />{t("addProduct")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{edit ? t("editProduct") : t("newProduct")}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2"><Label>{t("sku")}</Label><Input value={form.sku} placeholder="auto" disabled={!!edit} onChange={(e) => setForm({ ...form, sku: e.target.value })} maxLength={40} /></div>
                <div className="space-y-2"><Label>{t("barcode")}</Label><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} maxLength={80} /></div>
                <div className="space-y-2 sm:col-span-2"><Label>{t("name")} / الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} /></div>
                <div className="space-y-2">
                  <Label>{t("category")}</Label>
                  <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— {t("none")} —</SelectItem>
                      {cats.map((c) => <SelectItem key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("supplier")}</Label>
                  <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— {t("none")} —</SelectItem>
                      {sups.map((s) => <SelectItem key={s.id} value={s.id}>{lang === "ar" ? s.name_ar : s.name_en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("unit")}</Label>
                  <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => <SelectItem key={u} value={u}>{t(u === "piece" ? "pieces" : u as any)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2 bg-muted/30 border border-border/60 rounded-lg p-3">
                  <Label>{t("productImage")}</Label>
                  <div className="flex items-center gap-3">
                    <div className="size-20 rounded-lg bg-background flex items-center justify-center overflow-hidden border border-border shrink-0 shadow-sm">
                      {form.image_url ? <img src={form.image_url} alt="" className="size-full object-cover" /> : <Package className="size-7 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center justify-center gap-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent px-3 py-2 cursor-pointer">
                          <Upload className="size-4" />
                          {uploading ? "…" : t("uploadImage")}
                          <input type="file" accept="image/*" className="hidden" disabled={uploading}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.currentTarget.value = ""; }} />
                        </label>
                        {form.image_url && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, image_url: "" })}>
                            <X className="me-1 size-4" />{t("removeImage")}
                          </Button>
                        )}
                      </div>
                      <Input value={form.image_url} placeholder={t("imageUrl")} onChange={(e) => setForm({ ...form, image_url: e.target.value })} maxLength={500} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2"><Label>{t("costPrice")}</Label><Input type="number" min={0} step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label>{t("sellingPrice")}</Label><Input type="number" min={0} step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label>{t("minStock")}</Label><Input type="number" min={0} value={form.min_stock_level} onChange={(e) => setForm({ ...form, min_stock_level: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label>{t("maxStock")}</Label><Input type="number" min={0} value={form.max_stock_level} onChange={(e) => setForm({ ...form, max_stock_level: e.target.value as any })} /></div>
                <div className="space-y-2 sm:col-span-2"><Label>{t("description")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} rows={2} /></div>
                <div className="flex items-center justify-between sm:col-span-2 border border-border rounded-lg px-3 py-2">
                  <Label>{t("expiryTracking")}</Label>
                  <Switch checked={form.expiry_tracking} onCheckedChange={(v) => setForm({ ...form, expiry_tracking: v })} />
                </div>
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
          <div className="p-10 text-center text-muted-foreground">{t("noProducts")}</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((p) => {
              const st = stockStatus(p);
              const cat = cats.find((c) => c.id === p.category_id);
              return (
                <div key={p.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                  <div className="size-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border/50 shadow-sm shrink-0">
                    {p.image_url ? <img src={p.image_url} alt={p.name_en} className="size-full object-cover" /> : <Package className="size-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/inventory/products/${p.id}`} className="font-medium hover:text-primary truncate">{lang === "ar" ? p.name_ar : p.name_en}</Link>
                      <Badge variant="outline" className="text-[10px]">{p.sku}</Badge>
                      {!p.is_active && <Badge variant="outline" className="status-departed text-[10px]">{t("inactive")}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {cat ? (lang === "ar" ? cat.name_ar : cat.name_en) : "—"}
                      {p.barcode && <> · {p.barcode}</>}
                    </div>
                  </div>
                  <div className="text-end text-sm">
                    <div className="text-muted-foreground text-[11px]">{t("sellingPrice")}</div>
                    <div className="text-base font-bold text-primary tabular-nums">{formatMoney(p.selling_price, lang)}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">{t("costPrice")}: {formatMoney(p.cost_price, lang)}</div>
                  </div>
                  <div className="text-end">
                    <div className="text-[11px] text-muted-foreground">{t("stock")}</div>
                    <div className="font-semibold tabular-nums">{stocks[p.id] ?? 0}</div>
                  </div>
                  <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="actions">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(p)}>
                        <Edit3 className="me-2 size-4" />{t("edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicate(p)}>
                        <Copy className="me-2 size-4" />{t("duplicate") ?? "Duplicate"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleActive(p)}>
                        <Power className="me-2 size-4" />{p.is_active ? t("inactive") : t("active")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 className="me-2 size-4" />{t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? "هل أنت متأكد من حذف هذا المنتج؟ لا يمكن التراجع عن هذا الإجراء."
                : "Are you sure you want to delete this product? This action cannot be undone."}
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