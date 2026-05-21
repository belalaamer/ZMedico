import { useEffect, useState } from "react";
import { Plus, FileText, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { RowActions } from "@/components/RowActions";

const now = new Date();

export default function Payroll() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { currentBranchId } = useBranch();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [openAdj, setOpenAdj] = useState<string | null>(null);
  const [adj, setAdj] = useState({ type: "bonus", amount: "", reason_en: "" });

  const load = async () => {
    let q = supabase.from("payroll").select("*").eq("period_year", year).eq("period_month", month);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data } = await q.order("created_at", { ascending: false });
    setItems(data ?? []);
    let qs = supabase.from("staff_profiles").select("*").eq("status", "active");
    if (currentBranchId) qs = qs.eq("branch_id", currentBranchId);
    const { data: s } = await qs;
    setStaff(s ?? []);
    const { data: p } = await supabase.from("profiles").select("id,full_name,email");
    setProfiles(p ?? []);
  };
  useEffect(() => { load(); }, [year, month, currentBranchId]);

  const profName = (sid: string) => profiles.find((p) => p.id === sid)?.full_name ?? sid;

  const generate = async () => {
    const existing = new Set(items.map((i) => i.staff_id));
    const rows = staff.filter((s) => !existing.has(s.id)).map((s) => ({
      staff_id: s.id,
      branch_id: s.branch_id ?? currentBranchId ?? null,
      period_month: month, period_year: year,
      base_salary: s.salary, working_days: 22, actual_working_days: 22,
      overtime_hours: 0, overtime_amount: 0, bonuses: 0, deductions: 0, leave_deductions: 0,
      net_salary: s.salary, status: "draft" as const, created_by: user?.id,
    }));
    if (rows.length === 0) { toast.info("All staff already in payroll"); return; }
    const { error } = await supabase.from("payroll").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`+${rows.length}`); load();
  };

  const recalc = (p: any) => Number(p.base_salary) + Number(p.overtime_amount) + Number(p.bonuses) - Number(p.deductions) - Number(p.leave_deductions);

  const updateNet = async (p: any, patch: any) => {
    const next = { ...p, ...patch };
    const net = recalc(next);
    const { error } = await supabase.from("payroll").update({ ...patch, net_salary: net }).eq("id", p.id);
    if (error) return toast.error(error.message);
    load();
  };

  const setStatus = async (id: string, status: "draft" | "approved" | "paid") => {
    const patch: any = { status };
    if (status === "paid") { patch.paid_at = new Date().toISOString(); patch.paid_by = user?.id; }
    const { error } = await supabase.from("payroll").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (p: any) => {
    await supabase.from("salary_adjustments").delete().eq("payroll_id", p.id);
    const { error } = await supabase.from("payroll").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete"));
    load();
  };

  const addAdjustment = async () => {
    if (!openAdj || !adj.amount) return;
    const amount = Number(adj.amount);
    await supabase.from("salary_adjustments").insert({ payroll_id: openAdj, type: adj.type as any, amount, reason_en: adj.reason_en || null, created_by: user?.id });
    const p = items.find((i) => i.id === openAdj);
    if (p) {
      const patch: any = {};
      if (adj.type === "bonus" || adj.type === "allowance") patch.bonuses = Number(p.bonuses) + amount;
      else patch.deductions = Number(p.deductions) + amount;
      await updateNet(p, patch);
    }
    toast.success(t("save")); setOpenAdj(null); setAdj({ type: "bonus", amount: "", reason_en: "" });
  };

  const total = items.reduce((s, p) => s + Number(p.net_salary), 0);
  const paidCount = items.filter((p) => p.status === "paid").length;
  const pendingCount = items.filter((p) => p.status !== "paid").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("payroll")}</h1>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i+1} value={String(i+1)}>{String(i+1).padStart(2,"0")}</SelectItem>)}</SelectContent>
          </Select>
          <Button className="gradient-primary text-primary-foreground" onClick={generate}><Plus className="me-2 size-4" />{t("generatePayroll")}</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label={t("netSalary")} value={formatMoney(total, lang)} icon={<DollarSign className="size-4" />} />
        <StatCard label={t("statusPending")} value={pendingCount} />
        <StatCard label={t("statusPaid")} value={paidCount} />
      </div>
      <Card className="shadow-card overflow-hidden">
        {items.length === 0 ? <div className="p-10 text-center text-muted-foreground">—</div> : (
          <div className="divide-y divide-border">
            {items.map((p) => (
              <div key={p.id} className="p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{profName(p.staff_id)}</div>
                    <div className="text-xs text-muted-foreground">{t("baseSalary")}: {formatMoney(p.base_salary, lang)} · {t("bonuses")}: {formatMoney(p.bonuses, lang)} · {t("deductions")}: {formatMoney(p.deductions, lang)}</div>
                  </div>
                  <Badge variant="outline" className="text-base">{formatMoney(p.net_salary, lang)}</Badge>
                  <Badge variant="outline" className={p.status === "paid" ? "status-completed" : p.status === "approved" ? "status-confirmed" : ""}>{t(`status${p.status.charAt(0).toUpperCase()}${p.status.slice(1)}` as any)}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setOpenAdj(p.id)}>{t("addAdjustment")}</Button>
                  {p.status === "draft" && <Button size="sm" onClick={() => setStatus(p.id, "approved")}>{t("approve")}</Button>}
                  {p.status === "approved" && <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => setStatus(p.id, "paid")}>{t("markAsPaid")}</Button>}
                  <Button size="sm" variant="ghost" onClick={() => window.print()}><FileText className="size-4" /></Button>
                  <RowActions canEdit={false} onDelete={() => remove(p)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={!!openAdj} onOpenChange={(o) => !o && setOpenAdj(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("addAdjustment")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>{t("status")}</Label>
              <Select value={adj.type} onValueChange={(v) => setAdj({ ...adj, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonus">{t("bonus")}</SelectItem>
                  <SelectItem value="allowance">{t("allowance")}</SelectItem>
                  <SelectItem value="deduction">{t("deduction")}</SelectItem>
                  <SelectItem value="penalty">{t("penalty")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t("amount") || "Amount"}</Label><Input type="number" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t("reason")}</Label><Textarea value={adj.reason_en} onChange={(e) => setAdj({ ...adj, reason_en: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenAdj(null)}>{t("cancel")}</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={addAdjustment}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: any; icon?: React.ReactNode }) {
  return (
    <Card className="p-4 shadow-card">
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </Card>
  );
}