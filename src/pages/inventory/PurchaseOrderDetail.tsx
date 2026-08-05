import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, PackageCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDate } from "@/lib/format";
import { Can } from "@/components/Can";

const statusClass: Record<string, string> = {
  draft: "status-cancelled", pending: "status-review", partial: "status-progress", received: "status-completed", cancelled: "status-departed",
};

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [recvOpen, setRecvOpen] = useState(false);
  const [recvData, setRecvData] = useState<Record<string, { qty: number; expiry: string; batch: string }>>({});

  const load = async () => {
    if (!id) return;
    const [{ data: p }, { data: its }] = await Promise.all([
      supabase.from("purchase_orders").select("*, suppliers(*)").eq("id", id).maybeSingle(),
      supabase.from("purchase_order_items").select("*, products(*)").eq("purchase_order_id", id).order("created_at"),
    ]);
    setPo(p); setItems(its ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!po) return <div className="text-center text-muted-foreground py-10">…</div>;

  const statusLabel = ({ draft: t("statusDraft"), pending: t("statusPending"), partial: t("statusPartial"), received: t("statusReceived"), cancelled: t("statusCancelled") } as any)[po.status];

  const cancelPo = async () => {
    const { error } = await supabase.from("purchase_orders").update({ status: "cancelled" }).eq("id", po.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("statusCancelled")); load();
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
    if (!ops.length) { toast.error("Enter quantities"); return; }
    for (const { it, d } of ops) {
      const { error } = await supabase.rpc("receive_po_item", {
        _po_item_id: it.id, _qty: Number(d.qty),
        _expiry: d.expiry || null, _batch: d.batch || null, _by: user?.id ?? null,
      } as any);
      if (error) { toast.error(error.message); return; }
    }
    toast.success(t("received"));
    setRecvOpen(false); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm"><Link to="/inventory/purchase-orders"><ArrowLeft className="me-2 size-4" />{t("purchaseOrders")}</Link></Button>
        <div className="flex gap-2">
          {po.status !== "cancelled" && po.status !== "received" && (
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
                  <AlertDialogHeader><AlertDialogTitle>{t("cancel")}</AlertDialogTitle><AlertDialogDescription>{t("confirmCancelInvoice")}</AlertDialogDescription></AlertDialogHeader>
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