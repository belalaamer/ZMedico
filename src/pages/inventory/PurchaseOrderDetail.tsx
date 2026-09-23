import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, PackageCheck, X, Pencil, Send, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDate } from "@/lib/format";
import { Can } from "@/components/Can";

const statusClass: Record<string, string> = {
  draft: "status-cancelled", pending: "status-review", partial: "status-progress", received: "status-completed", cancelled: "status-departed",
};

type DraftLine = { product_id: string; quantity_ordered: number; unit_cost: number };

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [recvOpen, setRecvOpen] = useState(false);
  const [recvData, setRecvData] = useState<Record<string, { qty: number; expiry: string; batch: string }>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [editSupplierId, setEditSupplierId] = useState("");
  const [editOrderDate, setEditOrderDate] = useState("");
  const [editExpectedDate, setEditExpectedDate] = useState("");
  const [editTaxPct, setEditTaxPct] = useState(0);
  const [editNotes, setEditNotes] = useState("");
  const [editLines, setEditLines] = useState<DraftLine[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    if (!id) return;
    const [{ data: p }, { data: its }, { data: sups }, { data: prods }] = await Promise.all([
      supabase.from("purchase_orders").select("*, suppliers(*)").eq("id", id).is("deleted_at", null).maybeSingle(),
      supabase.from("purchase_order_items").select("*, products(*)").eq("purchase_order_id", id).order("created_at"),
      supabase.from("suppliers").select("*").eq("is_active", true).is("deleted_at", null).order("name_en"),
      supabase.from("products").select("*").eq("is_active", true).is("deleted_at", null).order("name_en"),
    ]);
    setPo(p);
    setItems(its ?? []);
    setSuppliers(sups ?? []);
    setProducts(prods ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!po) return <div className="text-center text-muted-foreground py-10">…</div>;

  const statusLabel = ({ draft: t("statusDraft"), pending: t("statusPending"), partial: t("statusPartial"), received: t("statusReceived"), cancelled: t("statusCancelled") } as any)[po.status];
  const canReceiveItems = po.status === "pending" || po.status === "partial";

  const editSubtotal = editLines.reduce(
    (sum, line) => sum + (Number(line.quantity_ordered) || 0) * (Number(line.unit_cost) || 0),
    0,
  );
  const editTax = +(editSubtotal * (Number(editTaxPct) || 0) / 100).toFixed(2);
  const editTotal = +(editSubtotal + editTax).toFixed(2);

  const cancelPo = async () => {
    const { error } = await supabase.rpc("cancel_purchase_order", {
      p_purchase_order_id: po.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t("statusCancelled"));
    void load();
  };

  const submitDraft = async () => {
    const { error } = await supabase.rpc("submit_purchase_order", {
      p_purchase_order_id: po.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t("statusPending"));
    void load();
  };

  const openEdit = () => {
    setEditSupplierId(po.supplier_id);
    setEditOrderDate(po.order_date);
    setEditExpectedDate(po.expected_date ?? "");
    setEditTaxPct(Number(po.subtotal) > 0 ? +(Number(po.tax) * 100 / Number(po.subtotal)).toFixed(3) : 0);
    setEditNotes(po.notes ?? "");
    setEditLines(items.map((it) => ({
      product_id: it.product_id,
      quantity_ordered: Number(it.quantity_ordered),
      unit_cost: Number(it.unit_cost),
    })));
    setEditOpen(true);
  };

  const saveDraftEdit = async (submit: boolean) => {
    if (!editSupplierId) { toast.error(t("selectSupplier")); return; }
    const valid = editLines.filter((line) => line.product_id && line.quantity_ordered > 0);
    if (!valid.length) { toast.error(t("addAtLeastOneItem")); return; }

    setSavingEdit(true);
    const { error } = await supabase.rpc("update_purchase_order_draft", {
      p_purchase_order_id: po.id,
      p_supplier_id: editSupplierId,
      p_order_date: editOrderDate,
      p_expected_date: editExpectedDate || null,
      p_tax_pct: Number(editTaxPct) || 0,
      p_notes: editNotes || null,
      p_items: valid.map((line) => ({
        product_id: line.product_id,
        quantity_ordered: Number(line.quantity_ordered),
        unit_cost: Number(line.unit_cost),
      })),
      p_submit: submit,
    });
    setSavingEdit(false);

    if (error) { toast.error(error.message); return; }
    toast.success(submit ? t("statusPending") : t("save"));
    setEditOpen(false);
    void load();
  };

  const openReceive = () => {
    const init: any = {};
    items.forEach((it) => {
      const remaining = Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received));
      init[it.id] = { qty: remaining, expiry: "", batch: "" };
    });
    setRecvData(init);
    setRecvOpen(true);
  };

  const submitReceive = async () => {
    const ops = items
      .map((it) => ({ it, d: recvData[it.id] }))
      .filter(({ d }) => d && d.qty > 0);
    if (!ops.length) { toast.error(t("enterQuantities")); return; }

    const { error } = await supabase.rpc("receive_purchase_order_items", {
      p_purchase_order_id: po.id,
      p_items: ops.map(({ it, d }) => ({
        po_item_id: it.id,
        qty: Number(d.qty),
        expiry: d.expiry || null,
        batch: d.batch || null,
      })),
    });
    if (error) { toast.error(error.message); return; }

    toast.success(t("received"));
    setRecvOpen(false); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm"><Link to="/inventory/purchase-orders"><ArrowLeft className="me-2 size-4" />{t("purchaseOrders")}</Link></Button>
        <div className="flex gap-2 flex-wrap">
          {po.status === "draft" && (
            <Can permission="inventory.edit">
              <Button variant="outline" onClick={openEdit}>
                <Pencil className="me-2 size-4" />{lang === "ar" ? "تعديل" : "Edit"}
              </Button>
              <Button className="gradient-primary text-primary-foreground" onClick={submitDraft}>
                <Send className="me-2 size-4" />{t("submitOrder")}
              </Button>
            </Can>
          )}
          {canReceiveItems && (
            <Can permission="purchase_orders.receive">
              <Button className="gradient-primary text-primary-foreground" onClick={openReceive}>
                <PackageCheck className="me-2 size-4" />{t("receiveItems")}
              </Button>
            </Can>
          )}
          {po.status !== "cancelled" && po.status !== "received" && (
            <Can permission="inventory.edit">
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline"><X className="me-2 size-4" />{t("cancel")}</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("cancel")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {lang === "ar"
                        ? "سيتم إلغاء أمر الشراء. إذا كان هناك استلام جزئي فسيتم عكس الكميات من المخزون، ولن تكتمل العملية إذا لم يعد المخزون كافيًا للعكس."
                        : "The purchase order will be cancelled. Any partially received stock will be reversed, and cancellation will fail if the stock is no longer available to reverse."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>{t("cancel")}</AlertDialogCancel><AlertDialogAction onClick={cancelPo}>{t("confirm")}</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Can>
          )}
        </div>
      </div>

      <Card className="p-6 shadow-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-muted-foreground">{t("poNumber")}</div>
            <div className="text-3xl font-bold">{po.po_number}</div>
            <Badge variant="outline" className={`mt-2 ${statusClass[po.status]}`}>{statusLabel}</Badge>
          </div>
          <div className="text-end text-sm">
            <div className="text-xs text-muted-foreground">{t("supplier")}</div>
            <div className="font-medium">{lang === "ar" ? po.suppliers?.name_ar : po.suppliers?.name_en}</div>
            <div className="text-xs text-muted-foreground mt-2">{t("orderDate")}</div>
            <div>{formatDate(po.order_date, lang)}</div>
            {po.expected_date && (<><div className="text-xs text-muted-foreground mt-1">{t("expectedDate")}</div><div>{formatDate(po.expected_date, lang)}</div></>)}
          </div>
        </div>

        <div className="mt-6 border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-5">{t("description")}</div>
            <div className="col-span-2 text-end">{t("ordered")}</div>
            <div className="col-span-2 text-end">{t("received")}</div>
            <div className="col-span-1 text-end">{t("unitPrice")}</div>
            <div className="col-span-2 text-end">{t("total")}</div>
          </div>
          {items.map((it) => (
            <div key={it.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-border text-sm items-center">
              <div className="col-span-5"><div className="font-medium">{lang === "ar" ? it.products?.name_ar : it.products?.name_en}</div><div className="text-xs text-muted-foreground">{it.products?.sku}</div></div>
              <div className="col-span-2 text-end tabular-nums">{Number(it.quantity_ordered)}</div>
              <div className="col-span-2 text-end tabular-nums font-medium">{Number(it.quantity_received)}</div>
              <div className="col-span-1 text-end tabular-nums">{formatMoney(it.unit_cost, lang)}</div>
              <div className="col-span-2 text-end tabular-nums font-medium">{formatMoney(it.total, lang)}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <div className="space-y-1.5 text-sm w-64">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("subtotal")}</span><span className="tabular-nums">{formatMoney(po.subtotal, lang)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("tax")}</span><span className="tabular-nums">+ {formatMoney(po.tax, lang)}</span></div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>{t("total")}</span><span className="tabular-nums text-primary">{formatMoney(po.total, lang)}</span></div>
          </div>
        </div>

        {po.notes && (<div className="mt-4 text-sm"><div className="text-xs text-muted-foreground mb-1">{t("notes")}</div><div className="whitespace-pre-wrap">{po.notes}</div></div>)}
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{lang === "ar" ? "تعديل أمر الشراء" : "Edit Purchase Order"}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>{t("supplier")}</Label>
              <Select value={editSupplierId} onValueChange={setEditSupplierId}>
                <SelectTrigger><SelectValue placeholder={t("selectSupplier")} /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{lang === "ar" ? s.name_ar : s.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("orderDate")}</Label>
              <Input type="date" value={editOrderDate} onChange={(e) => setEditOrderDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("expectedDate")}</Label>
              <Input type="date" value={editExpectedDate} onChange={(e) => setEditExpectedDate(e.target.value)} />
            </div>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
              <div className="col-span-6">{t("description")}</div>
              <div className="col-span-2 text-end">{t("quantity")}</div>
              <div className="col-span-2 text-end">{t("unitPrice")}</div>
              <div className="col-span-1 text-end">{t("total")}</div>
              <div className="col-span-1" />
            </div>
            {editLines.map((line, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-border items-center">
                <div className="col-span-6">
                  <Select
                    value={line.product_id}
                    onValueChange={(value) => {
                      const product = products.find((p) => p.id === value);
                      setEditLines((rows) => rows.map((row, i) => i === index
                        ? { ...row, product_id: value, unit_cost: row.unit_cost || Number(product?.cost_price ?? 0) }
                        : row));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder={t("selectProduct")} /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} · {lang === "ar" ? p.name_ar : p.name_en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  className="col-span-2 text-end"
                  type="number"
                  min={0}
                  step="0.001"
                  value={line.quantity_ordered}
                  onChange={(e) => setEditLines((rows) => rows.map((row, i) => i === index ? { ...row, quantity_ordered: Number(e.target.value) } : row))}
                />
                <Input
                  className="col-span-2 text-end"
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.unit_cost}
                  onChange={(e) => setEditLines((rows) => rows.map((row, i) => i === index ? { ...row, unit_cost: Number(e.target.value) } : row))}
                />
                <div className="col-span-1 text-end text-sm tabular-nums">
                  {formatMoney((line.quantity_ordered || 0) * (line.unit_cost || 0), lang)}
                </div>
                <div className="col-span-1 text-end">
                  <Button variant="ghost" size="icon" onClick={() => setEditLines((rows) => rows.filter((_, i) => i !== index))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="px-3 py-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setEditLines((rows) => [...rows, { product_id: "", quantity_ordered: 1, unit_cost: 0 }])}>
                <Plus className="me-2 size-4" />{t("addItem")}
              </Button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("notes")}</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} maxLength={1000} rows={3} />
            </div>
            <div className="space-y-2 text-sm bg-muted/30 border border-border/60 rounded-lg p-3">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">{t("subtotal")}</span><span>{formatMoney(editSubtotal, lang)}</span></div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t("tax")} %</span>
                <Input className="w-24 text-end h-8" type="number" min={0} max={100} step="0.1" value={editTaxPct} onChange={(e) => setEditTaxPct(Number(e.target.value))} />
                <span className="w-28 text-end">+ {formatMoney(editTax, lang)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold">
                <span>{t("total")}</span><span className="text-primary">{formatMoney(editTotal, lang)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={savingEdit}>{t("cancel")}</Button>
            <Button variant="outline" onClick={() => saveDraftEdit(false)} disabled={savingEdit}>{t("saveDraft")}</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={() => saveDraftEdit(true)} disabled={savingEdit}>{t("submitOrder")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recvOpen} onOpenChange={setRecvOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("receiveItems")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {items.map((it) => {
              const remaining = Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received));
              const d = recvData[it.id] ?? { qty: 0, expiry: "", batch: "" };
              return (
                <div key={it.id} className="border border-border rounded-lg p-3">
                  <div className="font-medium text-sm">{lang === "ar" ? it.products?.name_ar : it.products?.name_en}</div>
                  <div className="text-xs text-muted-foreground mb-2">{it.products?.sku} · {t("ordered")}: {Number(it.quantity_ordered)} · {t("received")}: {Number(it.quantity_received)} · {t("remaining")}: {remaining}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1"><Label className="text-xs">{t("quantity")}</Label><Input type="number" min={0} max={remaining} step="0.001" value={d.qty} onChange={(e) => setRecvData((s) => ({ ...s, [it.id]: { ...d, qty: Number(e.target.value) } }))} /></div>
                    {it.products?.expiry_tracking && (
                      <div className="space-y-1"><Label className="text-xs">{t("expiryDate")}</Label><Input type="date" value={d.expiry} onChange={(e) => setRecvData((s) => ({ ...s, [it.id]: { ...d, expiry: e.target.value } }))} /></div>
                    )}
                    <div className="space-y-1"><Label className="text-xs">{t("batchNumber")}</Label><Input value={d.batch} onChange={(e) => setRecvData((s) => ({ ...s, [it.id]: { ...d, batch: e.target.value } }))} maxLength={60} /></div>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecvOpen(false)}>{t("cancel")}</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={submitReceive}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}