import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Combobox } from "@/components/ui/combobox";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Row = {
  id?: string;
  product_id: string;
  quantity: number;
  _new?: boolean;
  _dirty?: boolean;
};

export function ConsumablesEditor({
  parentType,
  parentId,
}: {
  parentType: "service" | "procedure";
  parentId: string | null;
}) {
  const { t, lang } = useI18n();
  const [products, setProducts] = useState<{ id: string; name_en: string; name_ar: string; unit: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("products")
      .select("id,name_en,name_ar,unit")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name_en")
      .limit(1000)
      .then(({ data }) => setProducts((data ?? []) as any));
  }, []);

  useEffect(() => {
    if (!parentId) { setRows([]); return; }
    setLoading(true);
    const col = parentType === "service" ? "service_id" : "procedure_id";
    supabase
      .from("service_consumables")
      .select("id,product_id,quantity")
      .eq(col, parentId)
      .then(({ data, error }) => {
        setLoading(false);
        if (error) { toast.error(error.message); return; }
        setRows((data ?? []).map((r: any) => ({ id: r.id, product_id: r.product_id, quantity: Number(r.quantity) || 1 })));
      });
  }, [parentId, parentType]);

  if (!parentId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
        {lang === "ar" ? "احفظ أولاً لإضافة المستهلكات." : "Save first to add consumables."}
      </div>
    );
  }

  const addRow = () => setRows((r) => [...r, { product_id: "", quantity: 1, _new: true, _dirty: true }]);
  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch, _dirty: true } : x)));

  const removeRow = async (i: number) => {
    const row = rows[i];
    if (row.id) {
      const { error } = await supabase.from("service_consumables").delete().eq("id", row.id);
      if (error) { toast.error(error.message); return; }
    }
    setRows((r) => r.filter((_, idx) => idx !== i));
  };

  const saveAll = async () => {
    // Deduplicate product_ids in UI before hitting unique index
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.product_id) { toast.error(lang === "ar" ? "اختر المنتج" : "Pick a product"); return; }
      if (seen.has(r.product_id)) { toast.error(lang === "ar" ? "منتج مكرر" : "Duplicate product"); return; }
      seen.add(r.product_id);
      if (!r.quantity || r.quantity <= 0) { toast.error(lang === "ar" ? "الكمية يجب أن تكون > 0" : "Quantity must be > 0"); return; }
    }

    const col = parentType === "service" ? "service_id" : "procedure_id";
    const toInsert = rows.filter((r) => r._new).map((r) => ({
      [col]: parentId, product_id: r.product_id, quantity: r.quantity,
    }));
    const toUpdate = rows.filter((r) => r.id && r._dirty && !r._new);

    if (toInsert.length) {
      const { error } = await supabase.from("service_consumables").insert(toInsert as any);
      if (error) { toast.error(error.message); return; }
    }
    for (const r of toUpdate) {
      const { error } = await supabase.from("service_consumables")
        .update({ product_id: r.product_id, quantity: r.quantity }).eq("id", r.id!);
      if (error) { toast.error(error.message); return; }
    }
    toast.success(t("saved"));
    // Reload to clear dirty flags + capture new ids
    const { data } = await supabase.from("service_consumables")
      .select("id,product_id,quantity").eq(col, parentId);
    setRows((data ?? []).map((r: any) => ({ id: r.id, product_id: r.product_id, quantity: Number(r.quantity) || 1 })));
  };

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${lang === "ar" ? (p.name_ar || p.name_en) : p.name_en} · ${p.unit}`,
  }));

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{lang === "ar" ? "المستهلكات" : "Consumables"}</Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus className="me-1 size-3" />{lang === "ar" ? "إضافة" : "Add"}
          </Button>
          <Button type="button" size="sm" onClick={saveAll} disabled={loading}>
            {t("save")}
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">
          {lang === "ar" ? "لا توجد مستهلكات." : "No consumables defined."}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id ?? `new-${i}`} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Combobox
                  value={r.product_id}
                  onChange={(v) => updateRow(i, { product_id: v })}
                  options={productOptions}
                  placeholder={lang === "ar" ? "اختر منتج" : "Select product"}
                  searchPlaceholder={lang === "ar" ? "ابحث..." : "Search..."}
                />
              </div>
              <NumberInput className="w-24" value={r.quantity} onChange={(v) => updateRow(i, { quantity: v })} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="text-[11px] text-muted-foreground pt-1">
        {lang === "ar"
          ? "يتم خصم هذه المستهلكات تلقائياً من المخزون عند سداد الفاتورة بالكامل."
          : "These items are auto-deducted from stock when the invoice is fully paid."}
      </div>
    </div>
  );
}