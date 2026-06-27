import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { useDataSync } from "@/lib/dataSync";
import { fetchActiveContract, resolveAllLines, distributeClaim, type LineForCoverage } from "@/lib/insuranceContracts";
import { Badge } from "@/components/ui/badge";

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
  const [products, setProducts] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [patientId, setPatientId] = useState<string>(presetPatientId ?? "");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [taxPct, setTaxPct] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [insuranceCompanies, setInsuranceCompanies] = useState<any[]>([]);
  const [insuranceCompanyId, setInsuranceCompanyId] = useState<string>("");
  const [coverageRatio, setCoverageRatio] = useState<number>(0);
  const [activeContract, setActiveContract] = useState<any>(null);
  const [lineCoverage, setLineCoverage] = useState<Array<{ rule_id: string | null; covered_amount: number }>>([]);
  const [manualOverride, setManualOverride] = useState(false);
  const [manualClaim, setManualClaim] = useState<number>(0);
  const [items, setItems] = useState<Item[]>([{ item_type: "service", description_en: "", description_ar: "", quantity: 1, unit_price: 0 }]);
  const [saving, setSaving] = useState(false);
  const [patientProcedures, setPatientProcedures] = useState<any[]>([]);
  const [selectedProcIds, setSelectedProcIds] = useState<Record<string, boolean>>({});
  const [couponCode, setCouponCode] = useState("");
  const [couponInfo, setCouponInfo] = useState<{ id: string; code: string; amount: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => { setPatientId(presetPatientId ?? ""); }, [presetPatientId, open]);

  const { data: patientRows = [], refetch: refetchPatients } = useQuery({
    queryKey: ["patients-for-invoice"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id,first_name_en,last_name_en,patient_code,phone,deleted_at")
        .is("deleted_at", null)
        .order("first_name_en", { ascending: true })
        .order("last_name_en", { ascending: true })
        .limit(500);

      if (error) {
        console.error("[CreateInvoiceDialog] patient query failed", error);
        throw error;
      }

      const rows = (data ?? []).filter((p: any) => p.deleted_at == null);
      console.log("[CreateInvoiceDialog] patients fetched", {
        count: rows.length,
        patients: rows.map((p: any) => ({
          id: p.id,
          name: `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim(),
          deleted_at: p.deleted_at,
        })),
      });
      return rows;
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const patients = useMemo(
    () => patientRows.map((p: any) => ({
      id: p.id,
      label: `#${p.patient_code} · ${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim(),
    })),
    [patientRows],
  );

  useEffect(() => {
    if (!open) return;
    console.log("Dialog opened, refetching patients...");
    void refetchPatients();
    supabase.from("products").select("id,sku,name_en,name_ar,selling_price,min_stock_level").eq("is_active", true).is("deleted_at", null).order("name_en").limit(1000)
      .then(({ data }) => setProducts(data ?? []));
    supabase.from("procedures").select("id,name_en,name_ar,default_price,is_active,deleted_at").eq("is_active", true).is("deleted_at", null).order("name_en").limit(1000)
      .then(({ data }) => setProcedures((data ?? []).filter((p: any) => p.deleted_at == null && p.is_active !== false)));
    supabase.from("insurance_companies").select("id,name_en,name_ar,default_coverage_ratio,is_active").eq("is_active", true).order("name_en")
      .then(({ data }) => setInsuranceCompanies(data ?? []));
  }, [open, refetchPatients]);

  useDataSync(["patients"], () => {
    console.log("Patient data changed, refetching...");
    void refetchPatients();
  });

  useEffect(() => {
    console.log("[CreateInvoiceDialog] patient options count", patients.length);
  }, [patients]);

  useEffect(() => {
    if (!open) return;
    const q = supabase.from("inventory").select("product_id, quantity");
    (currentBranchId ? q.eq("branch_id", currentBranchId) : q).then(({ data }) => {
      const map: Record<string, number> = {};
      (data ?? []).forEach((x: any) => { map[x.product_id] = (map[x.product_id] ?? 0) + Number(x.quantity); });
      setStocks(map);
    });
  }, [open, currentBranchId]);

  // Auto-fill insurance from patient
  useEffect(() => {
    if (!patientId) { setInsuranceCompanyId(""); setCoverageRatio(0); return; }
    supabase.from("patients").select("insurance_company_id,insurance_coverage_ratio").eq("id", patientId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if (data.insurance_company_id) {
          setInsuranceCompanyId(data.insurance_company_id);
          setCoverageRatio(Number(data.insurance_coverage_ratio) || 0);
        } else {
          setInsuranceCompanyId(""); setCoverageRatio(0);
        }
      });
  }, [patientId]);

  // When the insurance company changes, fetch its currently-active contract.
  // Null means "no contract" — the flat coverage path is used as a safe fallback.
  useEffect(() => {
    setManualOverride(false);
    if (!insuranceCompanyId) { setActiveContract(null); return; }
    fetchActiveContract(insuranceCompanyId).then(setActiveContract);
  }, [insuranceCompanyId]);

  // Load patient's recorded procedures (from medical records) for quick add
  useEffect(() => {
    if (!open || !patientId) { setPatientProcedures([]); setSelectedProcIds({}); return; }
    (async () => {
      const { data: rps, error } = await supabase
        .from("record_procedures")
        .select("id, medical_record_id, procedure_id, quantity, tooth_number, created_at, medical_records!inner(patient_id,visit_date), procedures!inner(id,name_en,name_ar,default_price,deleted_at,is_active)")
        .eq("medical_records.patient_id", patientId)
        .is("procedures.deleted_at", null)
        .eq("procedures.is_active", true)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        console.error("[CreateInvoiceDialog] patient procedures query failed", error);
        setPatientProcedures([]);
        setSelectedProcIds({});
        return;
      }
      setPatientProcedures(
        (rps ?? [])
          .filter((r: any) => r.procedures && r.procedures.deleted_at == null && r.procedures.is_active !== false)
          .map((r: any) => ({ ...r, visit_date: r.medical_records?.visit_date })),
      );
      setSelectedProcIds({});
    })();
  }, [open, patientId]);

  const addSelectedProcedures = () => {
    const picks = patientProcedures.filter((r) => selectedProcIds[r.id]);
    if (picks.length === 0) { toast.error(lang === "ar" ? "اختر إجراء واحد على الأقل" : "Select at least one procedure"); return; }
    const newItems: Item[] = picks.map((r) => ({
      item_type: "procedure",
      product_id: null,
      description_en: `${r.procedures?.name_en ?? "Procedure"}${r.tooth_number ? ` (#${r.tooth_number})` : ""}`,
      description_ar: `${r.procedures?.name_ar ?? r.procedures?.name_en ?? "إجراء"}${r.tooth_number ? ` (#${r.tooth_number})` : ""}`,
      quantity: Number(r.quantity) || 1,
      unit_price: Number(r.procedures?.default_price) || 0,
    }));
    setItems((prev) => {
      const filtered = prev.filter((it) => it.description_en.trim() || it.unit_price > 0);
      return [...filtered, ...newItems];
    });
    setSelectedProcIds({});
    toast.success(lang === "ar" ? `تمت إضافة ${picks.length} إجراء` : `Added ${picks.length} procedure(s)`);
  };

  const subtotal = useMemo(() => items.reduce((s, it) => s + (Number(it.quantity)||0) * (Number(it.unit_price)||0), 0), [items]);
  const discount = useMemo(() => +(subtotal * (Number(discountPct)||0) / 100).toFixed(2), [subtotal, discountPct]);
  const couponDiscount = couponInfo ? Math.min(couponInfo.amount, Math.max(0, subtotal - discount)) : 0;
  const taxBase = subtotal - discount - couponDiscount;
  const tax = useMemo(() => +(taxBase * (Number(taxPct)||0) / 100).toFixed(2), [taxBase, taxPct]);
  const total = +(subtotal - discount - couponDiscount + tax).toFixed(2);

  // Recompute per-line coverage whenever items / contract change. Keeps invoice_items
  // audit amounts in lockstep with the contract resolver.
  useEffect(() => {
    if (!insuranceCompanyId || !activeContract?.id) { setLineCoverage([]); return; }
    let cancelled = false;
    const lines: LineForCoverage[] = items.map((it) => ({
      item_type: it.item_type,
      product_id: it.item_type === "service" ? null : (it.product_id ?? null),
      line_total: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    }));
    resolveAllLines(activeContract.id, lines).then((res) => { if (!cancelled) setLineCoverage(res); });
    return () => { cancelled = true; };
  }, [items, activeContract?.id, insuranceCompanyId]);

  // Contract-derived claim = sum of per-line resolver outputs.
  const contractClaim = useMemo(
    () => +(lineCoverage.reduce((s, r) => s + (Number(r.covered_amount) || 0), 0)).toFixed(2),
    [lineCoverage],
  );
  // Flat fallback (legacy behaviour) — used when company is selected but no contract exists.
  const flatClaim = +(total * (Number(coverageRatio) || 0) / 100).toFixed(2);

  // Final claim: manual override wins, else contract-derived if contract exists, else flat fallback.
  const claimAmount = !insuranceCompanyId
    ? 0
    : manualOverride
      ? Math.max(0, Math.min(total, +manualClaim.toFixed(2)))
      : activeContract
        ? Math.min(total, contractClaim)
        : flatClaim;
  const patientShare = +(total - claimAmount).toFixed(2);
  const claimSource: "manual" | "contract" | "flat" | "none" =
    !insuranceCompanyId ? "none" : manualOverride ? "manual" : activeContract ? "contract" : "flat";

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

  const pickProcedure = (idx: number, procedureId: string) => {
    const p = procedures.find((x) => x.id === procedureId);
    if (!p) return;
    updateItem(idx, {
      item_type: "procedure",
      product_id: procedureId,
      description_en: p.name_en,
      description_ar: p.name_ar || p.name_en,
      unit_price: Number(p.default_price) || 0,
    });
  };

  const applyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponLoading(true);
    const { data, error } = await (supabase as any).rpc("apply_coupon_code", { _code: code, _subtotal: subtotal - discount });
    setCouponLoading(false);
    if (error) { toast.error(error.message); return; }
    if (!data?.ok) {
      const msg = data?.error || "invalid";
      toast.error(lang === "ar" ? `كوبون غير صالح: ${msg}` : `Invalid coupon: ${msg}`);
      setCouponInfo(null);
      return;
    }
    setCouponInfo({ id: data.coupon_id, code: data.code, amount: Number(data.discount_amount) || 0 });
    toast.success(lang === "ar" ? "تم تطبيق الكوبون" : "Coupon applied");
  };

  const save = async (status: "draft" | "pending") => {
    if (!patientId) { toast.error(t("selectPatient")); return; }
    if (items.length === 0 || items.every((it) => !it.description_en)) { toast.error("Add at least one item"); return; }
    setSaving(true);
    const invoicePayload: Record<string, unknown> = {
      patient_id: patientId,
      branch_id: currentBranchId,
      invoice_date: date,
      subtotal, discount: discount + couponDiscount, tax,
      status, notes: notes || null,
      created_by: user?.id ?? null,
      insurance_company_id: insuranceCompanyId || null,
      claim_amount: insuranceCompanyId ? claimAmount : 0,
    };

    if (insuranceCompanyId) {
      invoicePayload.claim_status = "pending";
    }

    const { data: inv, error } = await supabase
      .from("invoices")
      .insert(invoicePayload as any, { defaultToNull: false })
      .select("id, invoice_number")
      .single();
    if (error || !inv) { setSaving(false); toast.error(error?.message ?? "Failed"); return; }

    if (couponInfo) {
      await (supabase as any).from("coupon_redemptions").insert({
        coupon_id: couponInfo.id,
        invoice_id: inv.id,
        patient_id: patientId,
        discount_amount: couponDiscount,
        redeemed_by: user?.id ?? null,
      });
    }

    // Per-line audit coverage so SUM(insurance_covered_amount) === invoices.claim_amount.
    // - contract mode: use resolver outputs directly
    // - manual / flat fallback: distribute claim proportionally to gross line totals
    const grossPerLine = items
      .filter((it) => it.description_en.trim())
      .map((it) => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0));
    let perLineCovered: number[];
    let perLineRuleId: (string | null)[];
    if (insuranceCompanyId && activeContract && !manualOverride) {
      // align with current resolver output, but cap to claimAmount in case of rounding drift
      const raw = items
        .map((it, i) => ({ it, cov: lineCoverage[i] }))
        .filter(({ it }) => it.description_en.trim());
      perLineCovered = raw.map(({ cov }) => Number(cov?.covered_amount) || 0);
      perLineRuleId = raw.map(({ cov }) => cov?.rule_id ?? null);
      // Force sum == claimAmount (correct last non-zero on rounding drift).
      const sum = +perLineCovered.reduce((a, b) => a + b, 0).toFixed(2);
      const drift = +(claimAmount - sum).toFixed(2);
      if (drift !== 0) {
        for (let i = perLineCovered.length - 1; i >= 0; i--) {
          if (grossPerLine[i] > 0) { perLineCovered[i] = +(perLineCovered[i] + drift).toFixed(2); break; }
        }
      }
    } else if (insuranceCompanyId && claimAmount > 0) {
      perLineCovered = distributeClaim(grossPerLine, claimAmount);
      perLineRuleId = grossPerLine.map(() => null);
    } else {
      perLineCovered = grossPerLine.map(() => 0);
      perLineRuleId = grossPerLine.map(() => null);
    }

    const rows = items
      .filter((it) => it.description_en.trim())
      .map((it, i) => ({
        invoice_id: inv.id,
        item_type: it.item_type,
        product_id: it.item_type === "product" ? (it.product_id ?? null) : null,
        description_en: it.description_en,
        description_ar: it.description_ar || null,
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
        insurance_covered_amount: perLineCovered[i] || 0,
        insurance_rule_id: perLineRuleId[i] ?? null,
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
    {
      const num = String(inv.invoice_number ?? "");
      const isTemp = !num || /^TMP[-_]/i.test(num);
      toast.success(
        isTemp
          ? (t("invoice") + " " + (t("save") ?? "created"))
          : `${t("invoice")} ${num}`,
      );
    }
    setItems([{ item_type: "service", description_en: "", description_ar: "", quantity: 1, unit_price: 0 }]);
    setDiscountPct(0); setTaxPct(0); setNotes(""); setPatientId("");
    setInsuranceCompanyId(""); setCoverageRatio(0);
    setActiveContract(null); setLineCoverage([]); setManualOverride(false); setManualClaim(0);
    setCouponCode(""); setCouponInfo(null);
    onSaved(inv.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("newInvoice")}</DialogTitle></DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("patientName")}</Label>
            <Combobox
              value={patientId}
              onChange={(v) => { setPatientId(v); void refetchPatients(); }}
              options={patients.map((p) => ({ value: p.id, label: p.label }))}
              placeholder={t("selectPatient")}
              searchPlaceholder={lang === "ar" ? "ابحث عن مريض..." : "Search patient..."}
              emptyText={lang === "ar" ? "لا يوجد مرضى" : "No patients found"}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("invoiceDate")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("insuranceCompany")}</Label>
            <Select
              value={insuranceCompanyId || "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") { setInsuranceCompanyId(""); setCoverageRatio(0); return; }
                setInsuranceCompanyId(v);
                const c = insuranceCompanies.find((x) => x.id === v);
                if (c) setCoverageRatio(Number(c.default_coverage_ratio) || 0);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("noInsurance")}</SelectItem>
                {insuranceCompanies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{lang === "ar" ? (c.name_ar || c.name_en) : c.name_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("coverageRatio")} <span className="text-xs text-muted-foreground">{lang === "ar" ? "(احتياطي إذا لا يوجد عقد)" : "(fallback if no contract)"}</span></Label>
            <NumberInput value={coverageRatio} onChange={setCoverageRatio} disabled={!insuranceCompanyId || !!activeContract} />
            {insuranceCompanyId && (
              <div className="text-[11px] text-muted-foreground">
                {activeContract
                  ? <>📄 {lang === "ar" ? "العقد النشط:" : "Active contract:"} <span className="font-medium text-foreground">{lang === "ar" ? (activeContract.name_ar || activeContract.name_en) : activeContract.name_en}</span> · {activeContract.default_coverage_percent}% {lang === "ar" ? "افتراضي" : "default"}</>
                  : <>⚠ {lang === "ar" ? "لا يوجد عقد نشط — استخدام النسبة الثابتة." : "No active contract — using flat coverage."}</>}
              </div>
            )}
          </div>
        </div>

        {patientId && patientProcedures.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between bg-muted/50 px-3 py-2">
              <div className="text-sm font-medium">
                {lang === "ar" ? "إجراءات المريض المسجّلة" : "Patient's recorded procedures"}
                <span className="ms-2 text-xs text-muted-foreground">({patientProcedures.length})</span>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addSelectedProcedures}>
                <Plus className="me-1 size-4" />
                {lang === "ar" ? "إضافة المحدد للفاتورة" : "Add selected to invoice"}
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-border">
              {patientProcedures.map((r) => {
                const checked = !!selectedProcIds[r.id];
                const name = lang === "ar" ? (r.procedures?.name_ar || r.procedures?.name_en) : (r.procedures?.name_en || r.procedures?.name_ar);
                return (
                  <label key={r.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setSelectedProcIds((s) => ({ ...s, [r.id]: e.target.checked }))}
                      className="size-4"
                    />
                    <span className="flex-1 truncate">
                      {name || "—"}
                      {r.tooth_number && <span className="text-xs text-muted-foreground"> · #{r.tooth_number}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">× {Number(r.quantity)}</span>
                    <span className="text-xs text-muted-foreground">{r.visit_date ? new Date(r.visit_date).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US") : ""}</span>
                    <span className="font-medium tabular-nums w-24 text-end">{formatMoney(Number(r.procedures?.default_price) || 0, lang)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

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
                ) : it.item_type === "procedure" ? (
                  <Select value={it.product_id ?? ""} onValueChange={(v) => pickProcedure(idx, v)}>
                    <SelectTrigger><SelectValue placeholder={lang === "ar" ? "اختر إجراء" : "Select procedure"} /></SelectTrigger>
                    <SelectContent>
                      {procedures.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-2">
                            <span>{lang === "ar" ? (p.name_ar || p.name_en) : p.name_en}</span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">· {formatMoney(Number(p.default_price)||0, lang)}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={it.description_en} placeholder="Description" onChange={(e) => updateItem(idx, { description_en: e.target.value, description_ar: e.target.value })} />
                )}
              </div>
              <NumberInput className="col-span-2 text-end" value={it.quantity} onChange={(v) => updateItem(idx, { quantity: v })} />
              <NumberInput className="col-span-2 text-end" value={it.unit_price} onChange={(v) => updateItem(idx, { unit_price: v })} />
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
              <NumberInput className="w-24 text-end" value={discountPct} onChange={setDiscountPct} />
              <span className="font-medium tabular-nums w-28 text-end">- {formatMoney(discount, lang)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{t("tax")} %</span>
              <NumberInput className="w-24 text-end" value={taxPct} onChange={setTaxPct} />
              <span className="font-medium tabular-nums w-28 text-end">+ {formatMoney(tax, lang)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground shrink-0">{lang === "ar" ? "كوبون" : "Coupon"}</span>
              <Input
                className="h-9 flex-1"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value); if (couponInfo) setCouponInfo(null); }}
                placeholder={lang === "ar" ? "أدخل الكود" : "Enter code"}
              />
              {couponInfo ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => { setCouponInfo(null); setCouponCode(""); }}>{lang === "ar" ? "إزالة" : "Remove"}</Button>
              ) : (
                <Button type="button" size="sm" variant="outline" disabled={couponLoading || !couponCode.trim()} onClick={applyCoupon}>{lang === "ar" ? "تطبيق" : "Apply"}</Button>
              )}
            </div>
            {couponInfo && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{lang === "ar" ? `خصم الكوبون (${couponInfo.code})` : `Coupon discount (${couponInfo.code})`}</span>
                <span className="font-medium tabular-nums w-28 text-end text-success">- {formatMoney(couponDiscount, lang)}</span>
              </div>
            )}
            {insuranceCompanyId && (
              <>
                <div className="flex items-center justify-between text-sm border-t border-border pt-2 gap-2">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    {t("insuranceShare")}
                    {claimSource === "contract" && (
                      <Badge variant="outline" className="text-[10px] border-success text-success">{lang === "ar" ? "من العقد" : "Contract"}</Badge>
                    )}
                    {claimSource === "manual" && (
                      <Badge variant="outline" className="text-[10px] border-warning text-warning">{lang === "ar" ? "تعديل يدوي" : "Manual"}</Badge>
                    )}
                    {claimSource === "flat" && (
                      <Badge variant="outline" className="text-[10px]">{lang === "ar" ? `ثابت ${coverageRatio}%` : `Flat ${coverageRatio}%`}</Badge>
                    )}
                  </span>
                  {manualOverride ? (
                    <NumberInput
                      className="w-32 text-end"
                      value={manualClaim}
                      onChange={(v) => setManualClaim(Math.max(0, Math.min(total, Number(v) || 0)))}
                    />
                  ) : (
                    <span className="font-medium tabular-nums text-success">{formatMoney(claimAmount, lang)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => {
                      if (manualOverride) { setManualOverride(false); }
                      else { setManualClaim(claimAmount); setManualOverride(true); }
                    }}
                  >
                    {manualOverride
                      ? (lang === "ar" ? "استعادة من العقد" : "Reset to contract")
                      : (lang === "ar" ? "تعديل يدوي للمبلغ" : "Override manually")}
                  </button>
                  <span className="text-muted-foreground">
                    {t("patientShare")}: <span className="font-medium tabular-nums text-foreground">{formatMoney(patientShare, lang)}</span>
                  </span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between text-base font-bold border-t border-border pt-2">
              <span>{t("finalTotal")}</span>
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