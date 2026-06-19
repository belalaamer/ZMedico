import { useEffect, useMemo, useState } from "react";
import { Package, AlertTriangle, XCircle, Wallet, Plus, ArrowLeftRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { subscribeResilient } from "@/lib/realtime";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

type Row = { product: any; branch_id: string; quantity: number; reserved: number };

const REASONS = ["restock", "damage", "theft", "count", "expired", "other"] as const;

export default function StockOverview() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [inv, setInv] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [adjOpen, setAdjOpen] = useState(false);
  const [trOpen, setTrOpen] = useState(false);
  const [adj, setAdj] = useState({ product_id: "", branch_id: "", type: "add", qty: 0, reason: "restock", notes: "" });
  const [tr, setTr] = useState({ product_id: "", from_branch: "", to_branch: "", qty: 0, notes: "" });

  const load = async () => {
    const [{ data: ps }, { data: bs }] = await Promise.all([
      supabase.from("products").select("*").eq("is_active", true).is("deleted_at", null),
      supabase.from("branches").select("*").order("name_en"),
    ]);
    setProducts(ps ?? []); setBranches(bs ?? []);
    let iq = supabase.from("inventory").select("*");
    if (currentBranchId) iq = iq.eq("branch_id", currentBranchId);
    const { data: invs } = await iq;
    setInv(invs ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId]);

  useEffect(() => {
    const onFocus = () => load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const stop = subscribeResilient({
      name: "stock-overview-sync",
      bind: (ch) => ch
        .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => load())
        .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => load()),
      onReconnect: () => load(),
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
    // eslint-disable-next-line
  }, [currentBranchId]);

  const productById = useMemo(() => {
    const m: Record<string, any> = {}; products.forEach((p) => { m[p.id] = p; }); return m;
  }, [products]);

  const rows: Row[] = inv
    .filter((x) => productById[x.product_id])
    .map((x) => ({ product: productById[x.product_id], branch_id: x.branch_id, quantity: Number(x.quantity), reserved: Number(x.reserved_quantity) }));

  const filtered = rows.filter((r) => {
    if (statusFilter === "low") return r.quantity > 0 && r.quantity <= r.product.min_stock_level;
    if (statusFilter === "out") return r.quantity <= 0;
    if (statusFilter === "ok") return r.quantity > r.product.min_stock_level;
    return true;
  });

  const branchName = (bid: string) => {
    const b = branches.find((x) => x.id === bid);
    if (!b) return "—";
    return lang === "ar" ? b.name_ar : b.name_en;
  };

  const totalProducts = products.length;
  const lowCount = rows.filter((r) => r.quantity > 0 && r.quantity <= r.product.min_stock_level).length;
  const outCount = rows.filter((r) => r.quantity <= 0).length;
  const totalValue = rows.reduce((s, r) => s + r.quantity * Number(r.product.cost_price), 0);

  const submitAdj = async () => {
    if (!adj.product_id || !adj.branch_id || !adj.qty) { toast.error(t("selectProduct")); return; }
    let signed = 0;
    if (adj.type === "add") signed = adj.qty;
    else if (adj.type === "remove") signed = -adj.qty;
    else {
      // set: compute delta
      const cur = inv.find((x) => x.product_id === adj.product_id && x.branch_id === adj.branch_id);
      signed = adj.qty - Number(cur?.quantity ?? 0);
    }
    if (signed === 0) { toast.error("No change"); return; }
    const reasonLabel = t(("reason" + adj.reason.charAt(0).toUpperCase() + adj.reason.slice(1)) as any);
    const { error } = await supabase.rpc("apply_inventory_tx", {
      _product_id: adj.product_id, _branch_id: adj.branch_id,
      _type: "adjustment", _signed_qty: signed,
      _unit_cost: null, _ref_type: "manual", _ref_id: null,
      _notes_en: `${reasonLabel}${adj.notes ? " — " + adj.notes : ""}`,
      _notes_ar: `${reasonLabel}${adj.notes ? " — " + adj.notes : ""}`,
      _expiry: null, _batch: null, _by: user?.id ?? null,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(t("save"));
    setAdjOpen(false);
    setAdj({ product_id: "", branch_id: "", type: "add", qty: 0, reason: "restock", notes: "" });
    load();
  };

  const submitTransfer = async () => {
    if (!tr.product_id || !tr.from_branch || !tr.to_branch) { toast.error(t("selectProduct")); return; }
    if (tr.from_branch === tr.to_branch) { toast.error(t("transferSameBranchError")); return; }
    if (!tr.qty || tr.qty <= 0) { toast.error(t("amount")); return; }
    const refId = crypto.randomUUID();
    const fromName = branchName(tr.from_branch); const toName = branchName(tr.to_branch);
    const { error: e1 } = await supabase.rpc("apply_inventory_tx", {
      _product_id: tr.product_id, _branch_id: tr.from_branch,
      _type: "transfer_out", _signed_qty: -tr.qty, _unit_cost: null,
      _ref_type: "transfer", _ref_id: refId,
      _notes_en: `Transfer to ${toName}${tr.notes ? " — " + tr.notes : ""}`,
      _notes_ar: `تحويل إلى ${toName}${tr.notes ? " — " + tr.notes : ""}`,
      _expiry: null, _batch: null, _by: user?.id ?? null,
    } as any);
    if (e1) { toast.error(e1.message); return; }
    const { error: e2 } = await supabase.rpc("apply_inventory_tx", {
      _product_id: tr.product_id, _branch_id: tr.to_branch,
      _type: "transfer_in", _signed_qty: tr.qty, _unit_cost: null,
      _ref_type: "transfer", _ref_id: refId,
      _notes_en: `Transfer from ${fromName}${tr.notes ? " — " + tr.notes : ""}`,
      _notes_ar: `تحويل من ${fromName}${tr.notes ? " — " + tr.notes : ""}`,
      _expiry: null, _batch: null, _by: user?.id ?? null,
    } as any);
    if (e2) { toast.error(e2.message); return; }
    toast.success(t("save"));
    setTrOpen(false);
    setTr({ product_id: "", from_branch: "", to_branch: "", qty: 0, notes: "" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("stockOverview")}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTrOpen(true)} disabled={branches.length < 2}>
            <ArrowLeftRight className="me-2 size-4" />{t("transferStock")}
          </Button>
          <Button className="gradient-primary text-primary-foreground" onClick={() => setAdjOpen(true)}>
            <Plus className="me-2 size-4" />{t("adjustStock")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("totalProducts"), value: totalProducts, icon: Package, tone: "from-primary to-primary-glow", money: false },
          { label: t("lowStock"), value: lowCount, icon: AlertTriangle, tone: "from-warning to-warning", money: false, click: () => setStatusFilter("low") },
          { label: t("outOfStock"), value: outCount, icon: XCircle, tone: "from-destructive to-destructive", money: false, click: () => setStatusFilter("out") },
          { label: t("inventoryValue"), value: totalValue, icon: Wallet, tone: "from-success to-success", money: true },
        ].map((m: any) => (
          <Card key={m.label} className={`p-4 shadow-card ${m.click ? "cursor-pointer hover:shadow-elegant" : ""}`} onClick={m.click}>
            <div className="flex items-start justify-between">
              <div className="text-xs font-medium text-muted-foreground">{m.label}</div>
              <div className={`size-8 rounded-lg bg-gradient-to-br ${m.tone} text-white flex items-center justify-center`}><m.icon className="size-4" /></div>
            </div>
            <div className="mt-2 text-xl font-bold tabular-nums">{m.money ? formatMoney(m.value, lang) : m.value}</div>
          </Card>
        ))}
      </div>

      <Card className="shadow-card overflow-hidden">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("status")}</SelectItem>
              <SelectItem value="ok">{t("inStock")}</SelectItem>
              <SelectItem value="low">{t("lowStock")}</SelectItem>
              <SelectItem value="out">{t("outOfStock")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">{filtered.length} rows</div>
        </div>
        <div className="grid grid-cols-12 gap-2 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <div className="col-span-4">{t("description")}</div>
          <div className="col-span-2">{t("branch")}</div>
          <div className="col-span-1 text-end">{t("stock")}</div>
          <div className="col-span-1 text-end">{t("available")}</div>
          <div className="col-span-1 text-end">{t("minStock")}</div>
          <div className="col-span-1 text-center">{t("status")}</div>
          <div className="col-span-2 text-end">{t("stockValue")}</div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t("noProducts")}</div>
        ) : (
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {filtered.map((r, i) => {
              const status = r.quantity <= 0 ? { l: t("outOfStock"), c: "status-departed" }
                : r.quantity <= r.product.min_stock_level ? { l: t("lowStock"), c: "status-progress" }
                : { l: t("inStock"), c: "status-completed" };
              return (
                <div key={i} className="grid grid-cols-12 gap-2 px-4 py-2 text-sm items-center">
                  <div className="col-span-4 min-w-0">
                    <div className="font-medium truncate">{lang === "ar" ? r.product.name_ar : r.product.name_en}</div>
                    <div className="text-[11px] text-muted-foreground">{r.product.sku}</div>
                  </div>
                  <div className="col-span-2 truncate">{branchName(r.branch_id)}</div>
                  <div className="col-span-1 text-end tabular-nums">{r.quantity}</div>
                  <div className="col-span-1 text-end tabular-nums">{r.quantity - r.reserved}</div>
                  <div className="col-span-1 text-end tabular-nums text-muted-foreground">{r.product.min_stock_level}</div>
                  <div className="col-span-1 text-center"><Badge variant="outline" className={`${status.c} text-[10px]`}>{status.l}</Badge></div>
                  <div className="col-span-2 text-end tabular-nums">{formatMoney(r.quantity * Number(r.product.cost_price), lang)}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Adjust Stock Dialog */}
      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("adjustStock")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t("selectProduct")}</Label>
              <Select value={adj.product_id} onValueChange={(v) => setAdj({ ...adj, product_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} · {lang === "ar" ? p.name_ar : p.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("branch")}</Label>
                <Select value={adj.branch_id} onValueChange={(v) => setAdj({ ...adj, branch_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("selectBranch")} /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("adjustmentType")}</Label>
                <Select value={adj.type} onValueChange={(v) => setAdj({ ...adj, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">{t("add")}</SelectItem>
                    <SelectItem value="remove">{t("remove")}</SelectItem>
                    <SelectItem value="set">{t("set")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {adj.product_id && adj.branch_id && (
              <div className="text-xs text-muted-foreground">
                {t("currentStock")}: <span className="font-medium tabular-nums">{Number(inv.find((x) => x.product_id === adj.product_id && x.branch_id === adj.branch_id)?.quantity ?? 0)}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{adj.type === "set" ? t("newStock") : t("amount")}</Label>
                <Input type="number" min={0} step="0.001" value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>{t("reason")}</Label>
                <Select value={adj.reason} onValueChange={(v) => setAdj({ ...adj, reason: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => <SelectItem key={r} value={r}>{t(("reason" + r.charAt(0).toUpperCase() + r.slice(1)) as any)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>{t("notes")}</Label><Textarea value={adj.notes} onChange={(e) => setAdj({ ...adj, notes: e.target.value })} maxLength={300} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjOpen(false)}>{t("cancel")}</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={submitAdj}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={trOpen} onOpenChange={setTrOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("transferStock")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t("selectProduct")}</Label>
              <Select value={tr.product_id} onValueChange={(v) => setTr({ ...tr, product_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} · {lang === "ar" ? p.name_ar : p.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("fromBranch")}</Label>
                <Select value={tr.from_branch} onValueChange={(v) => setTr({ ...tr, from_branch: v })}>
                  <SelectTrigger><SelectValue placeholder={t("selectBranch")} /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("toBranch")}</Label>
                <Select value={tr.to_branch} onValueChange={(v) => setTr({ ...tr, to_branch: v })}>
                  <SelectTrigger><SelectValue placeholder={t("selectBranch")} /></SelectTrigger>
                  <SelectContent>{branches.filter((b) => b.id !== tr.from_branch).map((b) => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>{t("amount")}</Label><Input type="number" min={0.001} step="0.001" value={tr.qty} onChange={(e) => setTr({ ...tr, qty: Number(e.target.value) })} /></div>
            <div className="space-y-2"><Label>{t("notes")}</Label><Textarea value={tr.notes} onChange={(e) => setTr({ ...tr, notes: e.target.value })} maxLength={300} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTrOpen(false)}>{t("cancel")}</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={submitTransfer}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}