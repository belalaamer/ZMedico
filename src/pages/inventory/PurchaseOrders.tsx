import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Trash2, ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDate } from "@/lib/format";
import { RowActions } from "@/components/RowActions";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";

const statusClass: Record<string, string> = {
  draft: "status-cancelled", pending: "status-review", partial: "status-progress", received: "status-completed", cancelled: "status-departed",
};

type LineItem = { product_id: string; quantity_ordered: number; unit_cost: number };

export default function PurchaseOrders() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [pos, setPos] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [supFilter, setSupFilter] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  // form
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [taxPct, setTaxPct] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([{ product_id: "", quantity_ordered: 1, unit_cost: 0 }]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    let q1 = supabase.from("purchase_orders").select("*, suppliers(name_en,name_ar)").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
    if (currentBranchId) q1 = q1.eq("branch_id", currentBranchId);
    const [{ data: posData }, { data: sups }, { data: prods }] = await Promise.all([
      q1,
      supabase.from("suppliers").select("*").eq("is_active", true).is("deleted_at", null).order("name_en"),
      supabase.from("products").select("*").eq("is_active", true).is("deleted_at", null).order("name_en"),
    ]);
    setPos(posData ?? []); setSuppliers(sups ?? []); setProducts(prods ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId]);

  const softDelete = async (po: any): Promise<void> => {
    if (po.status !== "draft" && !isAdmin) {
      toast.error(lang === "ar" ? "يمكن حذف المسودات فقط" : "Only draft POs can be deleted");
      return;
    }
    const { error } = await supabase.from("purchase_orders").update({ deleted_at: new Date().toISOString() } as any).eq("id", po.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (Number(l.quantity_ordered) || 0) * (Number(l.unit_cost) || 0), 0), [lines]);
  const tax = useMemo(() => +(subtotal * (Number(taxPct) || 0) / 100).toFixed(2), [subtotal, taxPct]);
  const total = +(subtotal + tax).toFixed(2);

  const reset = () => {
    setSupplierId(""); setOrderDate(new Date().toISOString().slice(0, 10)); setExpectedDate("");
    setTaxPct(0); setNotes(""); setLines([{ product_id: "", quantity_ordered: 1, unit_cost: 0 }]);
  };

  const save = async (status: "draft" | "pending") => {
    if (!supplierId) { toast.error(t("selectSupplier")); return; }
    if (!currentBranchId) { toast.error(t("selectBranch")); return; }
    const valid = lines.filter((l) => l.product_id && l.quantity_ordered > 0);
    if (!valid.length) { toast.error("Add at least one item"); return; }
    setSaving(true);
    const { data: po, error } = await supabase.from("purchase_orders").insert({
      supplier_id: supplierId, branch_id: currentBranchId,
      order_date: orderDate, expected_date: expectedDate || null,
      status, subtotal, tax, notes: notes || null,
      created_by: user?.id ?? null,
    } as any).select("id, po_number").single();
    if (error || !po) { setSaving(false); toast.error(error?.message ?? "Failed"); return; }

    const rows = valid.map((l) => ({
      purchase_order_id: po.id, product_id: l.product_id,
      quantity_ordered: Number(l.quantity_ordered),
      unit_cost: Number(l.unit_cost),
    }));
    const { error: e2 } = await supabase.from("purchase_order_items").insert(rows as any);
    setSaving(false);
    if (e2) { toast.error(e2.message); return; }
    toast.success(po.po_number);
    reset(); setOpen(false); load();
  };

  const filtered = pos.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (supFilter !== "all" && p.supplier_id !== supFilter) return false;
    if (q && !p.po_number.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("purchaseOrders")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-44">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("poNumber")} className="ps-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("status")}</SelectItem>
              <SelectItem value="draft">{t("statusDraft")}</SelectItem>
              <SelectItem value="pending">{t("statusPending")}</SelectItem>
              <SelectItem value="partial">{t("statusPartial")}</SelectItem>
              <SelectItem value="received">{t("statusReceived")}</SelectItem>
              <SelectItem value="cancelled">{t("statusCancelled")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={supFilter} onValueChange={setSupFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder={t("supplier")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("supplier")}</SelectItem>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{lang === "ar" ? s.name_ar : s.name_en}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />{t("newPO")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("newPO")}</DialogTitle></DialogHeader>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>{t("supplier")}</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger><SelectValue placeholder={t("selectSupplier")} /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{lang === "ar" ? s.name_ar : s.name_en}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t("orderDate")}</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
                <div className="space-y-2"><Label>{t("expectedDate")}</Label><Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
              </div>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="grid grid-cols-12 gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div className="col-span-6">{t("description")}</div>
                  <div className="col-span-2 text-end">{t("quantity")}</div>
                  <div className="col-span-2 text-end">{t("unitPrice")}</div>
                  <div className="col-span-1 text-end">{t("total")}</div>
                  <div className="col-span-1"></div>
                </div>
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-border items-center">
                    <div className="col-span-6">
                      <Select value={l.product_id} onValueChange={(v) => {
                        const prod = products.find((p) => p.id === v);
                        setLines((arr) => arr.map((x, idx) => idx === i ? { ...x, product_id: v, unit_cost: x.unit_cost || Number(prod?.cost_price ?? 0) } : x));
                      }}>
                        <SelectTrigger><SelectValue placeholder={t("selectProduct")} /></SelectTrigger>
                        <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} · {lang === "ar" ? p.name_ar : p.name_en}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input className="col-span-2 text-end" type="number" min={0} step="0.001" value={l.quantity_ordered} onChange={(e) => setLines((arr) => arr.map((x, idx) => idx === i ? { ...x, quantity_ordered: Number(e.target.value) } : x))} />
                    <Input className="col-span-2 text-end" type="number" min={0} step="0.01" value={l.unit_cost} onChange={(e) => setLines((arr) => arr.map((x, idx) => idx === i ? { ...x, unit_cost: Number(e.target.value) } : x))} />
                    <div className="col-span-1 text-end text-sm font-medium tabular-nums">{formatMoney((l.quantity_ordered || 0) * (l.unit_cost || 0), lang)}</div>
                    <div className="col-span-1 text-end"><Button variant="ghost" size="icon" onClick={() => setLines((arr) => arr.filter((_, idx) => idx !== i))}><Trash2 className="size-4" /></Button></div>
                  </div>
                ))}
                <div className="px-3 py-2 border-t border-border">
                  <Button variant="outline" size="sm" onClick={() => setLines((a) => [...a, { product_id: "", quantity_ordered: 1, unit_cost: 0 }])}><Plus className="me-2 size-4" />{t("addItem")}</Button>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{t("notes")}</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} /></div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">{t("subtotal")}</span><span className="font-medium tabular-nums">{formatMoney(subtotal, lang)}</span></div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{t("tax")} %</span>
                    <Input className="w-24 text-end" type="number" min={0} max={100} step="0.1" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value))} />
                    <span className="font-medium tabular-nums w-28 text-end">+ {formatMoney(tax, lang)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold"><span>{t("total")}</span><span className="tabular-nums text-primary">{formatMoney(total, lang)}</span></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>{t("cancel")}</Button>
                <Button variant="outline" onClick={() => save("draft")} disabled={saving}>{t("saveDraft")}</Button>
                <Button className="gradient-primary text-primary-foreground" onClick={() => save("pending")} disabled={saving}>{t("submitOrder")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noPOs")}</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((po) => {
              const statusLabel = ({ draft: t("statusDraft"), pending: t("statusPending"), partial: t("statusPartial"), received: t("statusReceived"), cancelled: t("statusCancelled") } as any)[po.status];
              return (
                <div key={po.id} className="flex items-center gap-4 p-4 hover:bg-muted/40">
                  <Link to={`/inventory/purchase-orders/${po.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><ClipboardList className="size-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{po.po_number}</div>
                    <div className="text-xs text-muted-foreground">{lang === "ar" ? po.suppliers?.name_ar : po.suppliers?.name_en} · {formatDate(po.order_date, lang)}</div>
                  </div>
                  {po.expected_date && <div className="text-xs text-muted-foreground"><div>{t("expectedDate")}</div><div>{formatDate(po.expected_date, lang)}</div></div>}
                  <Badge variant="outline" className={statusClass[po.status]}>{statusLabel}</Badge>
                  <div className="text-end font-semibold tabular-nums">{formatMoney(po.total, lang)}</div>
                  </Link>
                  <RowActions
                    onEdit={() => navigate(`/inventory/purchase-orders/${po.id}`)}
                    onDelete={() => softDelete(po)}
                    canDelete={isAdmin || po.status === "draft"}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}