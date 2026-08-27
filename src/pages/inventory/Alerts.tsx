import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, XCircle, Clock, Skull, CheckCircle2, ClipboardList, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";

const alertConfig: Record<string, { icon: any; cls: string }> = {
  low_stock: { icon: AlertTriangle, cls: "status-progress" },
  out_of_stock: { icon: XCircle, cls: "status-departed" },
  expiring_soon: { icon: Clock, cls: "status-review" },
  expired: { icon: Skull, cls: "status-departed" },
};

export default function Alerts() {
  const { t, lang } = useI18n();
  const { currentBranchId, branchSelectionReady } = useBranch();
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [products, setProducts] = useState<Record<string, any>>({});
  const [branches, setBranches] = useState<Record<string, any>>({});
  const loadRequestRef = useRef(0);

  const load = async () => {
    const requestId = ++loadRequestRef.current;
    const branchId = currentBranchId;
    if (!branchSelectionReady || !branchId) { setAlerts([]); setProducts({}); setBranches({}); return; }
    // Run expiry check on each load (lightweight; idempotent)
    try { await (supabase as any).rpc("check_expiry_alerts"); } catch { /* ignore */ }
    const q = supabase.from("stock_alerts").select("*").eq("branch_id", branchId).eq("is_resolved", false).order("created_at", { ascending: false });
    const [{ data: al }, { data: ps }, { data: bs }] = await Promise.all([
      q,
      supabase.from("products").select("*").is("deleted_at", null),
      supabase.from("branches").select("*").eq("id", branchId),
    ]);
    if (requestId !== loadRequestRef.current) return;
    setAlerts(al ?? []);
    const pm: Record<string, any> = {}; (ps ?? []).forEach((p: any) => { pm[p.id] = p; }); setProducts(pm);
    const bm: Record<string, any> = {}; (bs ?? []).forEach((b: any) => { bm[b.id] = b; }); setBranches(bm);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [branchSelectionReady, currentBranchId]);

  const resolve = async (id: string) => {
    if (!branchSelectionReady || !currentBranchId) { toast.error(t("selectBranch")); return; }
    const { error } = await supabase.from("stock_alerts").update({
      is_resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null,
    }).eq("id", id).eq("branch_id", currentBranchId);
    if (error) { toast.error(error.message); return; }
    toast.success(t("markResolved")); load();
  };

  const counts = {
    low_stock: alerts.filter((a) => a.alert_type === "low_stock").length,
    out_of_stock: alerts.filter((a) => a.alert_type === "out_of_stock").length,
    expiring_soon: alerts.filter((a) => a.alert_type === "expiring_soon").length,
    expired: alerts.filter((a) => a.alert_type === "expired").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("alerts")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{alerts.length}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { k: "low_stock", label: t("lowStock"), value: counts.low_stock, icon: AlertTriangle, tone: "from-warning to-warning" },
          { k: "out_of_stock", label: t("outOfStock"), value: counts.out_of_stock, icon: XCircle, tone: "from-destructive to-destructive" },
          { k: "expiring_soon", label: t("expiringSoon"), value: counts.expiring_soon, icon: Clock, tone: "from-info to-info" },
          { k: "expired", label: t("expired"), value: counts.expired, icon: Skull, tone: "from-destructive to-destructive" },
        ].map((m) => (
          <Card key={m.k} className="p-4 shadow-card">
            <div className="flex items-start justify-between">
              <div className="text-xs font-medium text-muted-foreground">{m.label}</div>
              <div className={`size-8 rounded-lg bg-gradient-to-br ${m.tone} text-white flex items-center justify-center`}><m.icon className="size-4" /></div>
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{m.value}</div>
          </Card>
        ))}
      </div>

      <Card className="shadow-card overflow-hidden">
        {alerts.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noAlerts")}</div>
        ) : (
          <div className="divide-y divide-border">
            {alerts.map((a) => {
              const cfg = alertConfig[a.alert_type] ?? alertConfig.low_stock;
              const Icon = cfg.icon;
              const product = products[a.product_id];
              const branch = branches[a.branch_id];
              const labelMap: any = { low_stock: t("lowStock"), out_of_stock: t("outOfStock"), expiring_soon: t("expiringSoon"), expired: t("expired") };
              return (
                <div key={a.id} className="flex items-center gap-4 p-4">
                  <div className={`size-10 rounded-lg flex items-center justify-center ${cfg.cls}`}><Icon className="size-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {product ? (
                        <Link to={`/inventory/products/${product.id}`} className="font-medium hover:text-primary">{lang === "ar" ? product.name_ar : product.name_en}</Link>
                      ) : <span className="font-medium">—</span>}
                      <Badge variant="outline" className={`${cfg.cls} text-[10px]`}>{labelMap[a.alert_type]}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {branch ? (lang === "ar" ? branch.name_ar : branch.name_en) : "—"}
                      {product && <> · {t("currentStock")}: <span className="font-medium tabular-nums">{Number(a.quantity)}</span> / {t("minStock")}: {product.min_stock_level}</>}
                      <> · {formatDateTime(a.created_at, lang)}</>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm"><Link to="/inventory/purchase-orders"><ClipboardList className="me-1 size-3.5" />{t("newPO")}</Link></Button>
                  <Button asChild variant="outline" size="sm"><Link to="/inventory/stock"><Plus className="me-1 size-3.5" />{t("adjustStock")}</Link></Button>
                  <Button variant="ghost" size="sm" onClick={() => resolve(a.id)}><CheckCircle2 className="me-1 size-3.5" />{t("markResolved")}</Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}