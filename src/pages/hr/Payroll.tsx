import { useEffect, useState } from "react";
import { Plus, FileText, DollarSign, ListChecks, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
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
  const [openDetails, setOpenDetails] = useState<any | null>(null);
  const [detailRows, setDetailRows] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commByStaff, setCommByStaff] = useState<Record<string, number>>({});
  const [commAttached, setCommAttached] = useState<Record<string, boolean>>({});

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
    // Build per-staff commission totals to show as a visible line on each payroll row.
    const rows = data ?? [];
    const out: Record<string, number> = {};
    const attachedFlag: Record<string, boolean> = {};
    await Promise.all(rows.map(async (pr: any) => {
      // Attached → use commissions tied to this payroll (post-paid).
      const { data: att } = await (supabase as any)
        .from("doctor_commissions").select("commission_amount").eq("payroll_id", pr.id);
      if (att && att.length > 0) {
        out[pr.id] = att.reduce((sum: number, r: any) => sum + Number(r.commission_amount || 0), 0);
        attachedFlag[pr.id] = true;
        return;
      }
      // Otherwise → preview unattached earned/partial for this doctor.
      const { data: pend } = await (supabase as any)
        .from("doctor_commissions").select("commission_amount")
        .eq("doctor_id", pr.staff_id).is("payroll_id", null).in("status", ["earned", "partial"]);
      out[pr.id] = (pend ?? []).reduce((sum: number, r: any) => sum + Number(r.commission_amount || 0), 0);
      attachedFlag[pr.id] = false;
    }));
    setCommByStaff(out);
    setCommAttached(attachedFlag);
  };
  useEffect(() => { load(); }, [year, month, currentBranchId]);

  const profName = (sid: string) => profiles.find((p) => p.id === sid)?.full_name ?? sid;

  const generate = async () => {
    if (!currentBranchId) { toast.error("Select a branch first"); return; }
    const existing = new Set(items.map((i) => i.staff_id));
    const candidates = staff.filter((s) => !existing.has(s.id));
    const missing = candidates.filter((s) => !s.branch_id && !currentBranchId);
    if (missing.length) { toast.error("Some staff have no branch"); return; }
    const rows = candidates.map((s) => ({
      staff_id: s.id,
      branch_id: s.branch_id ?? currentBranchId,
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

  const openCommissionDetails = async (p: any) => {
    setOpenDetails(p);
    setDetailLoading(true);
    setDetailRows([]);
    // If payroll is paid/has attached commissions, show those.
    // Otherwise show currently unattached earned/partial commissions for this doctor.
    let q = (supabase as any)
      .from("doctor_commissions")
      .select("id, base_amount, collected_amount, commission_amount, commission_percent, status, created_at, updated_at, paid_at, payroll_id, procedures(name_en,name_ar), patients(first_name_en,last_name_en,first_name_ar,last_name_ar)")
      .eq("doctor_id", p.staff_id)
      .order("updated_at", { ascending: false })
      .limit(500);
    const hasAttached = await (supabase as any)
      .from("doctor_commissions").select("id", { count: "exact", head: true }).eq("payroll_id", p.id);
    if ((hasAttached?.count ?? 0) > 0) {
      q = q.eq("payroll_id", p.id);
    } else {
      q = q.is("payroll_id", null).in("status", ["earned", "partial"]);
    }
    const { data } = await q;
    setDetailRows(data ?? []);
    setDetailLoading(false);
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
          <Button asChild variant="outline" size="sm"><Link to="/hr/pending-commissions"><AlertCircle className="me-2 size-4" />{t("pendingCommissions")}</Link></Button>
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
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{t("baseSalary")}: <span className="tabular-nums">{formatMoney(p.base_salary, lang)}</span></span>
                      <span className="text-primary">{t("commissions")}: <span className="tabular-nums font-medium">{formatMoney(commByStaff[p.id] ?? 0, lang)}</span></span>
                      <span>{t("bonuses")}: <span className="tabular-nums">{formatMoney(
                        commAttached[p.id]
                          ? Math.max(0, Number(p.bonuses || 0) - Number(commByStaff[p.id] ?? 0))
                          : Number(p.bonuses || 0),
                        lang
                      )}</span></span>
                      <span>{t("deductions")}: <span className="tabular-nums">{formatMoney(p.deductions, lang)}</span></span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-base">{formatMoney(p.net_salary, lang)}</Badge>
                  <Badge variant="outline" className={p.status === "paid" ? "status-completed" : p.status === "approved" ? "status-confirmed" : ""}>{t(`status${p.status.charAt(0).toUpperCase()}${p.status.slice(1)}` as any)}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setOpenAdj(p.id)}>{t("addAdjustment")}</Button>
                  <Button size="sm" variant="outline" onClick={() => openCommissionDetails(p)}>
                    <ListChecks className="size-4 me-1" />{lang === "ar" ? "تفاصيل العمولات" : "Commission details"}
                  </Button>
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

      <Dialog open={!!openDetails} onOpenChange={(o) => !o && setOpenDetails(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {lang === "ar" ? "تفاصيل عمولات الإجراءات" : "Procedure commission details"}
              {openDetails && <span className="ms-2 text-sm text-muted-foreground font-normal">— {profName(openDetails.staff_id)}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            {detailLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">…</div>
            ) : detailRows.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                {lang === "ar" ? "لا توجد عمولات مرتبطة" : "No commissions to show"}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase">
                  <tr>
                    <th className="text-start p-2">{lang === "ar" ? "الإجراء" : "Procedure"}</th>
                    <th className="text-start p-2">{lang === "ar" ? "المريض" : "Patient"}</th>
                    <th className="text-end p-2">%</th>
                    <th className="text-end p-2">{lang === "ar" ? "محصّل" : "Collected"}</th>
                    <th className="text-end p-2">{lang === "ar" ? "العمولة" : "Commission"}</th>
                    <th className="p-2">{lang === "ar" ? "الحالة" : "Status"}</th>
                    <th className="text-start p-2">{lang === "ar" ? "تاريخ الاستحقاق" : "Accrual date"}</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((r: any) => {
                    const procName = lang === "ar" ? (r.procedures?.name_ar || r.procedures?.name_en) : (r.procedures?.name_en || r.procedures?.name_ar);
                    const p = r.patients;
                    const patient = !p ? "—" : (lang === "ar"
                      ? `${p.first_name_ar ?? ""} ${p.last_name_ar ?? ""}`.trim() || `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim()
                      : `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim());
                    const accrual = r.paid_at || r.updated_at;
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="p-2">{procName || "—"}</td>
                        <td className="p-2">{patient}</td>
                        <td className="p-2 text-end tabular-nums">{Number(r.commission_percent).toFixed(2)}%</td>
                        <td className="p-2 text-end tabular-nums">{formatMoney(r.collected_amount, lang)}</td>
                        <td className="p-2 text-end tabular-nums font-medium text-primary">{formatMoney(r.commission_amount, lang)}</td>
                        <td className="p-2"><Badge variant="outline">{r.status}</Badge></td>
                        <td className="p-2 text-xs">{accrual ? new Date(accrual).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="p-2" colSpan={4}>{lang === "ar" ? "الإجمالي" : "Total"}</td>
                    <td className="p-2 text-end tabular-nums text-primary">
                      {formatMoney(detailRows.reduce((s, r) => s + Number(r.commission_amount), 0), lang)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenDetails(null)}>{t("cancel")}</Button>
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