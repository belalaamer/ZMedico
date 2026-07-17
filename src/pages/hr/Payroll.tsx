import { useEffect, useState } from "react";
import { Plus, FileText, DollarSign, ListChecks, AlertCircle, MoreHorizontal, Trash2, Wallet, Clock, CheckCircle2, Printer, PlusCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

const now = new Date();

export default function Payroll() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { currentBranchId } = useBranch();
  const { authz } = useAuthorization();
  const canEdit = authz.can("hr.edit");
  const canDelete = authz.can("hr.delete");
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
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

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
    if (!canEdit) { toast.error("Not permitted"); return; }
    if (!currentBranchId) { toast.error(t("errSelectBranchFirst")); return; }
    const existing = new Set(items.map((i) => i.staff_id));
    const candidates = staff.filter((s) => !existing.has(s.id));
    const missing = candidates.filter((s) => !s.branch_id && !currentBranchId);
    if (missing.length) { toast.error(t("errStaffNoBranch")); return; }
    if (candidates.length === 0) { toast.info("All staff already in payroll"); return; }

    // Pull attendance for the target period to compute real absences per staff.
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // last day of month
    const totalDaysInMonth = endDate.getDate();
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const staffIds = candidates.map((s) => s.id);
    const { data: att, error: attErr } = await supabase
      .from("attendance")
      .select("staff_id,status,date")
      .in("staff_id", staffIds)
      .gte("date", iso(startDate))
      .lte("date", iso(endDate));
    if (attErr) { toast.error(attErr.message); return; }

    // Count unpaid-absence days per staff (absent OR on_leave treated as unpaid unless leave system says otherwise).
    const absentDays: Record<string, number> = {};
    (att ?? []).forEach((r: any) => {
      if (r.status === "absent" || r.status === "on_leave") {
        absentDays[r.staff_id] = (absentDays[r.staff_id] ?? 0) + 1;
      } else if (r.status === "half_day") {
        absentDays[r.staff_id] = (absentDays[r.staff_id] ?? 0) + 0.5;
      }
    });

    const rows = candidates.map((s) => {
      const absent = absentDays[s.id] ?? 0;
      const base = Number(s.salary) || 0;
      const perDiem = base / 30;
      const leave_deductions = Number((perDiem * absent).toFixed(2));
      const actual_working_days = Math.max(0, totalDaysInMonth - absent);
      const net_salary = Number((base - leave_deductions).toFixed(2));
      return {
        staff_id: s.id,
        branch_id: s.branch_id ?? currentBranchId,
        period_month: month, period_year: year,
        base_salary: base,
        working_days: totalDaysInMonth,
        actual_working_days,
        overtime_hours: 0, overtime_amount: 0,
        bonuses: 0, deductions: 0,
        leave_deductions,
        net_salary,
        status: "draft" as const,
        created_by: user?.id,
      };
    });

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
    if (!canEdit) { toast.error("Not permitted"); return; }
    const patch: any = { status };
    if (status === "paid") { patch.paid_at = new Date().toISOString(); patch.paid_by = user?.id; }
    const { error } = await supabase.from("payroll").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (p: any) => {
    if (!canDelete) { toast.error("Not permitted"); return; }
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
      </div>

      <div className="bg-card border shadow-sm rounded-lg p-2 flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to="/hr/pending-commissions"><AlertCircle className="me-2 size-4" />{t("pendingCommissions")}</Link>
        </Button>
        <div className="h-6 w-px bg-border mx-1 hidden sm:block" />
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28 bg-muted/50 border-0"><SelectValue /></SelectTrigger>
            <SelectContent>{[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-28 bg-muted/50 border-0"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i+1} value={String(i+1)}>{String(i+1).padStart(2,"0")}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="ms-auto">
          <Button
            className="gradient-primary text-primary-foreground"
            onClick={generate}
            disabled={!canEdit}
            title={!canEdit ? ("Not permitted") : undefined}
          >
            <Plus className="me-2 size-4" />{t("generatePayroll")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          label={t("netSalary")}
          value={formatMoney(total, lang)}
          icon={<Wallet className="size-5" />}
          tint="bg-primary/10 text-primary"
          hero
        />
        <KpiCard
          label={t("statusPending")}
          value={pendingCount}
          icon={<Clock className="size-5" />}
          tint="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        />
        <KpiCard
          label={t("statusPaid")}
          value={paidCount}
          icon={<CheckCircle2 className="size-5" />}
          tint="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {items.length === 0 ? (
        <Card className="p-16 text-center shadow-card">
          <Wallet className="size-10 mx-auto text-muted-foreground/50 mb-3" />
          <div className="text-sm text-muted-foreground">
            {lang === "ar" ? "لا توجد سجلات رواتب لهذه الفترة" : "No payroll records for this period"}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((p) => {
            const commissions = commByStaff[p.id] ?? 0;
            const bonusOnly = commAttached[p.id]
              ? Math.max(0, Number(p.bonuses || 0) - Number(commissions))
              : Number(p.bonuses || 0);
            const statusLabel = t(`status${p.status.charAt(0).toUpperCase()}${p.status.slice(1)}` as any);
            const statusTint =
              p.status === "paid"
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                : p.status === "approved"
                ? "bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400"
                : "bg-muted text-muted-foreground border-border";
            return (
              <div
                key={p.id}
                className="bg-card border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-base font-semibold truncate">{profName(p.staff_id)}</div>
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${statusTint}`}>
                        {statusLabel}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <LedgerPart label={t("baseSalary")} value={formatMoney(p.base_salary, lang)} />
                      <Op sign="+" />
                      <LedgerPart
                        label={t("commissions")}
                        value={formatMoney(commissions, lang)}
                        tone="add"
                      />
                      <Op sign="+" />
                      <LedgerPart label={t("bonuses")} value={formatMoney(bonusOnly, lang)} tone="add" />
                      <Op sign="−" />
                      <LedgerPart label={t("deductions")} value={formatMoney(p.deductions, lang)} tone="sub" />
                    </div>
                  </div>

                  <div className="text-end">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("netSalary")}</div>
                    <div className="text-2xl font-black text-primary tabular-nums leading-tight">
                      {formatMoney(p.net_salary, lang)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {p.status === "draft" && canEdit && (
                      <Button size="sm" onClick={() => setStatus(p.id, "approved")}>
                        <CheckCircle2 className="me-2 size-4" />{t("approve")}
                      </Button>
                    )}
                    {p.status === "approved" && canEdit && (
                      <Button
                        size="sm"
                        className="gradient-primary text-primary-foreground"
                        onClick={() => setStatus(p.id, "paid")}
                      >
                        <Wallet className="me-2 size-4" />{t("markAsPaid")}
                      </Button>
                    )}
                    {p.status === "paid" && (
                      <Button size="sm" variant="ghost" onClick={() => window.print()}>
                        <Printer className="me-2 size-4" />{lang === "ar" ? "طباعة" : "Print"}
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label="more">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => setOpenAdj(p.id)}>
                          <PlusCircle className="me-2 size-4" />{t("addAdjustment")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openCommissionDetails(p)}>
                          <ListChecks className="me-2 size-4" />
                          {lang === "ar" ? "تفاصيل العمولات" : "Commission details"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.print()}>
                          <FileText className="me-2 size-4" />{lang === "ar" ? "طباعة" : "Print"}
                        </DropdownMenuItem>
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setConfirmDelete(p)}
                            >
                              <Trash2 className="me-2 size-4" />{t("delete")}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
          <div className="overflow-auto max-h-[65vh] rounded-md border">
            {detailLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">…</div>
            ) : detailRows.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                {lang === "ar" ? "لا توجد عمولات مرتبطة" : "No commissions to show"}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10 text-xs uppercase border-b">
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

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? "هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء."
                : "Are you sure you want to delete this record? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { const p = confirmDelete; setConfirmDelete(null); if (p) await remove(p); }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({
  label, value, icon, tint, hero,
}: { label: string; value: any; icon?: React.ReactNode; tint?: string; hero?: boolean }) {
  return (
    <Card className="p-5 shadow-card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
          <div className={`mt-1 tabular-nums font-bold leading-tight ${hero ? "text-3xl md:text-4xl text-primary" : "text-2xl"}`}>
            {value}
          </div>
        </div>
        {icon && (
          <div className={`p-2.5 rounded-lg ${tint ?? "bg-muted text-muted-foreground"}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

function LedgerPart({ label, value, tone }: { label: string; value: string; tone?: "add" | "sub" }) {
  const color =
    tone === "add"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "sub"
      ? "text-destructive"
      : "text-foreground";
  return (
    <span className="inline-flex items-baseline gap-1 rounded-md bg-muted/50 px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-semibold ${color}`}>{value}</span>
    </span>
  );
}

function Op({ sign }: { sign: string }) {
  return <span className="text-muted-foreground/60 font-mono text-sm">{sign}</span>;
}