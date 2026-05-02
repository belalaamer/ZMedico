import { useEffect, useMemo, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

type Item = {
  item_type: "service" | "product" | "procedure";
  product_id?: string | null;
  description_en: string;
  description_ar: string;
  quantity: number;
  unit_price: number;
};

export function CreateInvoiceDialog({
  open, onOpenChange, onSaved, presetPatientId,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: (id?: string) => void; presetPatientId?: string }) {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [patientId, setPatientId] = useState<string>(presetPatientId ?? "");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [taxPct, setTaxPct] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([{ item_type: "service", description_en: "", description_ar: "", quantity: 1, unit_price: 0 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPatientId(presetPatientId ?? ""); }, [presetPatientId, open]);

  useEffect(() => {
    if (!open) return;
    supabase.from("patients").select("id,first_name_en,last_name_en,patient_code").is("deleted_at", null).order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setPatients((data ?? []).map((p: any) => ({ id: p.id, label: `#${p.patient_code} · ${p.first_name_en} ${p.last_name_en ?? ""}`.trim() }))));
    supabase.from("products").select("id,sku,name_en,name_ar,selling_price,min_stock_level").eq("is_active", true).order("name_en").limit(1000)
      .then(({ data }) => setProducts(data ?? []));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = supabase.from("inventory").select("product_id, quantity");
    (currentBranchId ? q.eq("branch_id", currentBranchId) : q).then(({ data }) => {
      const map: Record<string, number> = {};
      (data ?? []).forEach((x: any) => { map[x.product_id] = (map[x.product_id] ?? 0) + Number(x.quantity); });
      setStocks(map);
    });
  }, [open, currentBranchId]);

  const subtotal = useMemo(() => items.reduce((s, it) => s + (Number(it.quantity)||0) * (Number(it.unit_price)||0), 0), [items]);
  const discount = useMemo(() => +(subtotal * (Number(discountPct)||0) / 100).toFixed(2), [subtotal, discountPct]);
  const taxBase = subtotal - discount;
  const tax = useMemo(() => +(taxBase * (Number(taxPct)||0) / 100).toFixed(2), [taxBase, taxPct]);
  const total = +(subtotal - discount + tax).toFixed(2);

  const updateItem = (idx: number, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const pickProduct = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    updateItem(idx, {
      item_type: "product",
      product_id: productId,
      description_en: p.name_en,
      description_ar: p.name_ar,
      unit_price: Number(p.selling_price) || 0,
    });
  };

  const save = async (status: "draft" | "pending") => {
    if (!patientId) { toast.error(t("selectPatient")); return; }
    if (items.length === 0 || items.every((it) => !it.description_en)) { toast.error("Add at least one item"); return; }
    setSaving(true);
    const { data: inv, error } = await supabase.from("invoices").insert({
      patient_id: patientId,
      branch_id: currentBranchId,
      invoice_date: date,
      subtotal, discount, tax,
      status, notes: notes || null,
      created_by: user?.id ?? null,
    } as any).select("id, invoice_number").single();
    if (error || !inv) { setSaving(false); toast.error(error?.message ?? "Failed"); return; }

    const rows = items
      .filter((it) => it.description_en.trim())
      .map((it) => ({
        invoice_id: inv.id,
        item_type: it.item_type,
        product_id: it.product_id ?? null,
        description_en: it.description_en,
        description_ar: it.description_ar || null,
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
      }));
    if (rows.length) {
      const { error: e2 } = await supabase.from("invoice_items").insert(rows as any);
      if (e2) { setSaving(false); toast.error(e2.message); return; }
    }

    // Auto-deduct inventory for product items (non-cancelled invoices)
    if (currentBranchId && status !== "draft") {
      for (const it of rows) {
        if (it.item_type === "product" && it.product_id) {
          const qty = Number(it.quantity) || 0;
          if (qty > 0) {
            const { error: txErr } = await (supabase as any).rpc("apply_inventory_tx", {
              _product_id: it.product_id,
              _branch_id: currentBranchId,
              _type: "sale",
              _signed_qty: -qty,
              _unit_cost: null,
              _ref_type: "invoice",
              _ref_id: inv.id,
              _notes_en: `Invoice ${inv.invoice_number}`,
              _notes_ar: `فاتورة ${inv.invoice_number}`,
              _expiry: null,
              _batch: null,
              _by: user?.id ?? null,
            });
            if (txErr) toast.error(txErr.message);
          }
        }
      }
    }

    setSaving(false);
    toast.success(`${t("invoice")} ${inv.invoice_number}`);
    setItems([{ item_type: "service", description_en: "", description_ar: "", quantity: 1, unit_price: 0 }]);
    setDiscountPct(0); setTaxPct(0); setNotes(""); setPatientId("");
    onSaved(inv.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("newInvoice")}</DialogTitle></DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("patientName")}</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger><SelectValue placeholder={t("selectPatient")} /></SelectTrigger>
              <SelectContent>
                {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("invoiceDate")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-2">{t("itemType")}</div>
            <div className="col-span-3">{t("description")}</div>
            <div className="col-span-2 text-end">{t("quantity")}</div>
            <div className="col-span-2 text-end">{t("unitPrice")}</div>
            <div className="col-span-2 text-end">{t("total")}</div>
            <div className="col-span-1"></div>
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-border">
              <div className="col-span-2">
                <Select value={it.item_type} onValueChange={(v) => updateItem(idx, { item_type: v as Item["item_type"], product_id: v === "product" ? it.product_id : null })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">{t("service")}</SelectItem>
                    <SelectItem value="product">{t("product")}</SelectItem>
                    <SelectItem value="procedure">{t("procedure")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3 grid gap-1">
                {it.item_type === "product" ? (
                  <Select value={it.product_id ?? ""} onValueChange={(v) => pickProduct(idx, v)}>
                    <SelectTrigger><SelectValue placeholder={t("selectProduct")} /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => {
                        const qty = stocks[p.id] ?? 0;
                        const low = qty <= (p.min_stock_level ?? 0);
                        return (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="flex items-center gap-2">
                              <span>{lang === "ar" ? p.name_ar : p.name_en}</span>
                              <span className={`text-[10px] tabular-nums ${qty <= 0 ? "text-destructive" : low ? "text-warning" : "text-muted-foreground"}`}>
                                · {t("available")}: {qty}
                              </span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <>
                    <Input value={it.description_en} placeholder="Description (EN)" onChange={(e) => updateItem(idx, { description_en: e.target.value })} />
                    <Input dir="rtl" value={it.description_ar} placeholder="الوصف (AR)" onChange={(e) => updateItem(idx, { description_ar: e.target.value })} />
                  </>
                )}
              </div>
              <Input className="col-span-2 text-end" type="number" min={0} step="0.01" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
              <Input className="col-span-2 text-end" type="number" min={0} step="0.01" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} />
              <div className="col-span-2 text-end self-center font-medium tabular-nums">
                {formatMoney((Number(it.quantity)||0) * (Number(it.unit_price)||0), lang)}
              </div>
              <div className="col-span-1 self-center">
                <Button type="button" variant="ghost" size="icon" onClick={() => setItems((a) => a.filter((_, i) => i !== idx))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="px-3 py-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={() => setItems((a) => [...a, { item_type: "service", description_en: "", description_ar: "", quantity: 1, unit_price: 0 }])}>
              <Plus className="me-2 size-4" />{t("addItem")}
            </Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={4} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("subtotal")}</span>
              <span className="font-medium tabular-nums">{formatMoney(subtotal, lang)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{t("discount")} %</span>
              <Input className="w-24 text-end" type="number" min={0} max={100} step="0.1" value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} />
              <span className="font-medium tabular-nums w-28 text-end">- {formatMoney(discount, lang)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{t("tax")} %</span>
              <Input className="w-24 text-end" type="number" min={0} max={100} step="0.1" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value))} />
              <span className="font-medium tabular-nums w-28 text-end">+ {formatMoney(tax, lang)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-bold border-t border-border pt-2">
              <span>{t("total")}</span>
              <span className="tabular-nums text-primary">{formatMoney(total, lang)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>{t("cancel")}</Button>
          <Button type="button" variant="outline" onClick={() => save("draft")} disabled={saving}>{t("saveDraft")}</Button>
          <Button type="button" className="gradient-primary text-primary-foreground" onClick={() => save("pending")} disabled={saving}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}