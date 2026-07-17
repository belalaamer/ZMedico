import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatMoney } from "@/lib/format";
import { ReportPageHeader, ReportFilterBar } from "./_shared";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { Wallet, TrendingUp, Award } from "lucide-react";

export default function DoctorCommissions() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  // R2: doctor-only scoping routed through AuthorizationService.
  // Semantics unchanged: user must hold `doctor` and NOT be admin/manager/hr.
  const { authz } = useAuthorization("DoctorCommissions");
  const isDoctorOnly = !authz.isSuperAdmin()
    && authz.holdsAnyRole("doctor")
    && !authz.holdsAnyRole("manager", "hr");
  const [start, setStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [doctorId, setDoctorId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: staff } = await supabase.from("staff_profiles").select("id").eq("status", "active");
      const ids = (staff ?? []).map((s: any) => s.id);
      if (ids.length === 0) { setDoctors([]); return; }
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const list = (profs ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name ?? p.id.slice(0,8) }));
      list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
      setDoctors(list);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      let q = (supabase as any)
        .from("doctor_commissions")
        .select("id, doctor_id, base_amount, collected_amount, commission_amount, commission_percent, status, created_at, branch_id, procedures(name_en,name_ar), patients(first_name_en,last_name_en,first_name_ar,last_name_ar)")
        .gte("created_at", start)
        .lte("created_at", end + "T23:59:59")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (currentBranchId) q = q.eq("branch_id", currentBranchId);
      if (doctorId !== "all") q = q.eq("doctor_id", doctorId);
      if (status !== "all") q = q.eq("status", status);
      const { data } = await q;
      setRows(data ?? []);
    })();
  }, [start, end, doctorId, status, currentBranchId]);

  const totals = useMemo(() => {
    const t = { base: 0, collected: 0, commission: 0 };
    rows.forEach((r) => { t.base += +r.base_amount; t.collected += +r.collected_amount; t.commission += +r.commission_amount; });
    return t;
  }, [rows]);

  const doctorName = (id: string) => {
    const d = doctors.find((x) => x.id === id);
    return d?.full_name ?? id?.slice(0, 8);
  };

  const patientName = (p: any) =>
    !p ? "—" : (lang === "ar"
      ? `${p.first_name_ar ?? ""} ${p.last_name_ar ?? ""}`.trim() || `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim()
      : `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim());

  const statusColor = (s: string) => s === "paid" ? "status-completed" : s === "earned" ? "status-confirmed" : s === "partial" ? "status-pending" : "status-departed";

  return (
    <div className="space-y-6">
      <ReportPageHeader title={t("doctorCommissions")} />
      <ReportFilterBar module="reports_medical" start={start} end={end} setStart={setStart} setEnd={setEnd} extra={
        <>
          {!isDoctorOnly && <div>
            <Label className="text-xs">{lang === "ar" ? "الطبيب" : "Doctor"}</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === "ar" ? "الكل" : "All"}</SelectItem>
                {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>}
          <div>
            <Label className="text-xs">{t("commissionStatus")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === "ar" ? "الكل" : "All"}</SelectItem>
                <SelectItem value="pending">{lang === "ar" ? "معلق" : "Pending"}</SelectItem>
                <SelectItem value="partial">{lang === "ar" ? "جزئي" : "Partial"}</SelectItem>
                <SelectItem value="earned">{lang === "ar" ? "مكتسب" : "Earned"}</SelectItem>
                <SelectItem value="paid">{lang === "ar" ? "مدفوع" : "Paid"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      } />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-card hover:shadow-elegant transition-all">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("baseAmount")}</div>
              <div className="size-9 rounded-lg bg-muted flex items-center justify-center">
                <Wallet className="size-4 text-muted-foreground" />
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums mt-3">{formatMoney(totals.base, lang)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card hover:shadow-elegant transition-all">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("collectedAmount")}</div>
              <div className="size-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="size-4 text-emerald-600" />
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums mt-3">{formatMoney(totals.collected, lang)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-elegant bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-primary uppercase tracking-wide">{t("commissionAmount")}</div>
              <div className="size-9 rounded-lg bg-primary/15 flex items-center justify-center">
                <Award className="size-4 text-primary" />
              </div>
            </div>
            <div className="text-3xl font-black tabular-nums mt-3 text-primary">{formatMoney(totals.commission, lang)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide">
              <tr>
                <th className="sticky top-0 bg-muted/80 backdrop-blur z-10 border-b border-border text-start p-3 font-semibold text-muted-foreground">{lang === "ar" ? "الطبيب" : "Doctor"}</th>
                <th className="sticky top-0 bg-muted/80 backdrop-blur z-10 border-b border-border text-start p-3 font-semibold text-muted-foreground">{lang === "ar" ? "المريض" : "Patient"}</th>
                <th className="sticky top-0 bg-muted/80 backdrop-blur z-10 border-b border-border text-start p-3 font-semibold text-muted-foreground">{lang === "ar" ? "الإجراء" : "Procedure"}</th>
                <th className="sticky top-0 bg-muted/80 backdrop-blur z-10 border-b border-border text-end p-3 font-semibold text-muted-foreground">%</th>
                <th className="sticky top-0 bg-muted/80 backdrop-blur z-10 border-b border-border text-end p-3 font-semibold text-muted-foreground">{t("baseAmount")}</th>
                <th className="sticky top-0 bg-muted/80 backdrop-blur z-10 border-b border-border text-end p-3 font-semibold text-muted-foreground">{t("collectedAmount")}</th>
                <th className="sticky top-0 bg-muted/80 backdrop-blur z-10 border-b border-border text-end p-3 font-semibold text-primary">{t("commissionAmount")}</th>
                <th className="sticky top-0 bg-muted/80 backdrop-blur z-10 border-b border-border text-center p-3 font-semibold text-muted-foreground">{t("commissionStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/40 transition-colors">
                  <td className="p-3 font-semibold text-foreground">{doctorName(r.doctor_id)}</td>
                  <td className="p-3 font-medium text-foreground">{patientName(r.patients)}</td>
                  <td className="p-3 text-muted-foreground">{lang === "ar" ? (r.procedures?.name_ar || r.procedures?.name_en) : (r.procedures?.name_en || r.procedures?.name_ar) || "—"}</td>
                  <td className="p-3 text-end tabular-nums text-xs text-muted-foreground">{Number(r.commission_percent).toFixed(2)}%</td>
                  <td className="p-3 text-end tabular-nums">{formatMoney(r.base_amount, lang)}</td>
                  <td className="p-3 text-end tabular-nums">{formatMoney(r.collected_amount, lang)}</td>
                  <td className="p-3 text-end tabular-nums font-bold text-primary">{formatMoney(r.commission_amount, lang)}</td>
                  <td className="p-3 text-center"><Badge variant="outline" className={statusColor(r.status)}>{r.status}</Badge></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">{t("noResults") || "No results"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}