import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDateTime, formatDate } from "@/lib/format";
import { useBranch } from "@/contexts/BranchContext";

const txClass: Record<string, string> = {
  purchase: "status-completed", sale: "status-departed", adjustment: "status-progress",
  transfer_in: "status-completed", transfer_out: "status-departed", return: "status-progress", expiry: "status-departed",
};

export default function ProductDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { subscription } = useBranch();
  const [p, setP] = useState<any>(null);
  const [cat, setCat] = useState<any>(null);
  const [sup, setSup] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [inv, setInv] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);

  const load = async () => {
    if (!id || !subscription?.tenant_id) return;
    const [{ data: prod }, { data: brs }, { data: invs }, { data: ts }, { data: poItems }] = await Promise.all([
      supabase.from("products").select("*").eq("id", id).eq("tenant_id", subscription.tenant_id).maybeSingle(),
      supabase.from("branches").select("*").eq("tenant_id", subscription.tenant_id).order("name_en"),
      supabase.from("inventory").select("*").eq("product_id", id),
      supabase.from("inventory_transactions").select("*").eq("product_id", id).order("created_at", { ascending: false }).limit(100),
      supabase.from("purchase_order_items").select("*, purchase_orders(*, suppliers(name_en,name_ar))").eq("product_id", id).order("created_at", { ascending: false }),
    ]);
    setP(prod); setBranches(brs ?? []); setInv(invs ?? []); setTxs(ts ?? []); setPos(poItems ?? []);
    if (prod?.category_id) {
      const { data: c } = await supabase.from("product_categories").select("*").eq("id", prod.category_id).maybeSingle();
      setCat(c);
    }
    if (prod?.supplier_id) {
      const { data: s } = await supabase.from("suppliers").select("*").eq("id", prod.supplier_id).maybeSingle();
      setSup(s);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, subscription?.tenant_id]);

  if (!p) return <div className="text-center text-muted-foreground py-10">…</div>;

  const branchName = (bid: string) => {
    const b = branches.find((x) => x.id === bid);
    if (!b) return "—";
    return lang === "ar" ? b.name_ar : b.name_en;
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to="/inventory/products"><ArrowLeft className="me-2 size-4" />{t("products")}</Link></Button>

      <Card className="p-6 shadow-card">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="size-20 rounded-xl bg-muted flex items-center justify-center overflow-hidden">
            {p.image_url ? <img src={p.image_url} alt={p.name_en} className="size-full object-cover" /> : <Package className="size-8 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{lang === "ar" ? p.name_ar : p.name_en}</h1>
              <Badge variant="outline">{p.sku}</Badge>
              {!p.is_active && <Badge variant="outline" className="status-departed">{t("inactive")}</Badge>}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {cat && <>{lang === "ar" ? cat.name_ar : cat.name_en} · </>}
              {sup && <>{lang === "ar" ? sup.name_ar : sup.name_en} · </>}
              {p.unit}
              {p.barcode && <> · {p.barcode}</>}
            </div>
            {(lang === "ar" ? p.description_ar : p.description_en) && (
              <p className="text-sm mt-2">{lang === "ar" ? p.description_ar : p.description_en}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 text-end">
            <div><div className="text-xs text-muted-foreground">{t("costPrice")}</div><div className="font-bold tabular-nums">{formatMoney(p.cost_price, lang)}</div></div>
            <div><div className="text-xs text-muted-foreground">{t("sellingPrice")}</div><div className="font-bold tabular-nums text-primary">{formatMoney(p.selling_price, lang)}</div></div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">{t("stockByBranch")}</TabsTrigger>
          <TabsTrigger value="tx">{t("transactionHistory")}</TabsTrigger>
          <TabsTrigger value="po">{t("purchaseHistory")}</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <Card className="shadow-card overflow-hidden">
            <div className="grid grid-cols-12 gap-2 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
              <div className="col-span-6">{t("branch")}</div>
              <div className="col-span-2 text-end">{t("stock")}</div>
              <div className="col-span-2 text-end">{t("reserved")}</div>
              <div className="col-span-2 text-end">{t("available")}</div>
            </div>
            {inv.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">—</div>
            ) : inv.map((x) => (
              <div key={x.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-border text-sm">
                <div className="col-span-6 font-medium">{branchName(x.branch_id)}</div>
                <div className="col-span-2 text-end tabular-nums">{Number(x.quantity)}</div>
                <div className="col-span-2 text-end tabular-nums text-muted-foreground">{Number(x.reserved_quantity)}</div>
                <div className="col-span-2 text-end tabular-nums font-semibold">{Number(x.available_quantity)}</div>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="tx" className="mt-4">
          <Card className="shadow-card overflow-hidden">
            {txs.length === 0 ? <div className="p-8 text-center text-muted-foreground text-sm">—</div> : (
              <div className="divide-y divide-border">
                {txs.map((x) => (
                  <div key={x.id} className="flex items-center gap-3 p-3 text-sm">
                    <Badge variant="outline" className={txClass[x.transaction_type] ?? ""}>{x.transaction_type}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{lang === "ar" ? (x.notes_ar || x.notes_en) : x.notes_en}</div>
                      <div className="text-xs text-muted-foreground">{branchName(x.branch_id)} · {formatDateTime(x.created_at, lang)}</div>
                    </div>
                    <div className="text-end">
                      <div className={`font-semibold tabular-nums ${Number(x.quantity) >= 0 ? "text-success" : "text-destructive"}`}>
                        {Number(x.quantity) >= 0 ? "+" : ""}{Number(x.quantity)}
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">→ {Number(x.quantity_after)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="po" className="mt-4">
          <Card className="shadow-card overflow-hidden">
            {pos.length === 0 ? <div className="p-8 text-center text-muted-foreground text-sm">—</div> : (
              <div className="divide-y divide-border">
                {pos.map((x) => (
                  <Link key={x.id} to={`/inventory/purchase-orders/${x.purchase_order_id}`} className="flex items-center gap-3 p-3 text-sm hover:bg-muted/40">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{x.purchase_orders?.po_number}</div>
                      <div className="text-xs text-muted-foreground">{lang === "ar" ? x.purchase_orders?.suppliers?.name_ar : x.purchase_orders?.suppliers?.name_en} · {formatDate(x.purchase_orders?.order_date, lang)}</div>
                    </div>
                    <div className="text-end text-sm">
                      <div className="tabular-nums">{Number(x.quantity_received)} / {Number(x.quantity_ordered)}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{formatMoney(x.unit_cost, lang)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}