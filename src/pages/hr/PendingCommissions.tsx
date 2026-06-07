import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDate } from "@/lib/format";

type Row = {
  id: string;
  doctor_id: string;
  base_amount: number;
  collected_amount: number;
  commission_amount: number;
  commission_percent: number;
  status: string;
  payroll_id: string | null;
  paid_at: string | null;
  updated_at: string;
  medical_record_id: string | null;
  invoice?: { id: string; invoice_number: string; invoice_date: string; total: number; status: string } | null;
  doctor_name?: string;
};

const STATUSES = ["all", "pending", "partial", "earned", "paid"] as const;

export default function PendingCommissions() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    let query: any = supabase
      .from("doctor_commissions")
      .select("id, doctor_id, base_amount, collected_amount, commission_amount, commission_percent, status, payroll_id, paid_at, updated_at, medical_record_id, branch_id")
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (currentBranchId) query = query.eq("branch_id", currentBranchId);
    if (status !== "all") query = query.eq("status", status);
    const { data } = await query;
    const list: Row[] = data ?? [];

    // Attach invoice per medical_record_id
    const mrIds = Array.from(new Set(list.map((r) => r.medical_record_id).filter(Boolean))) as string[];
    let invMap: Record<string, any> = {};
    if (mrIds.length > 0) {
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total, status, medical_record_id")
        .in("medical_record_id", mrIds)
        .is("deleted_at", null);
      (invs ?? []).forEach((inv: any) => { invMap[inv.medical_record_id] = inv; });
    }
    list.forEach((r) => { r.invoice = r.medical_record_id ? invMap[r.medical_record_id] ?? null : null; });

    // Doctor names
    const docIds = Array.from(new Set(list.map((r) => r.doctor_id)));
    if (docIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", docIds);
      const m: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { m[p.id] = p.full_name ?? p.email ?? p.id; });
      setProfiles(m);
    }
    setRows(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, [status, currentBranchId]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => {
      const name = (profiles[r.doctor_id] ?? "").toLowerCase();
      const inv = (r.invoice?.invoice_number ?? "").toLowerCase();
      return name.includes(needle) || inv.includes(needle);
    });
  }, [rows, q, profiles]);

  const totals = useMemo(() => ({
    eligible: filtered.reduce((s, r) => s + Number(r.base_amount || 0), 0),
    collected: filtered.reduce((s, r) => s + Number(r.collected_amount || 0), 0),
    commission: filtered.reduce((s, r) => s + Number(r.commission_amount || 0), 0),
  }), [filtered]);

  const statusClass = (s: string) =>
    s === "paid" ? "status-completed"
    : s === "earned" ? "status-confirmed"
    : s === "partial" ? "status-pending"
    : "";

  return (
    <div className="space-y-6">
      <Link to="/hr/payroll" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("payroll")}
      </Link>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("pendingCommissions")}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="w-56" />
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4 shadow-card">
          <div className="text-xs text-muted-foreground">{t("eligibleAmount")}</div>
          <div className="text-xl font-bold mt-1 tabular-nums">{formatMoney(totals.eligible, lang)}</div>
        </Card>
        <Card className="p-4 shadow-card">
          <div className="text-xs text-muted-foreground">{t("collectedAmount")}</div>
          <div className="text-xl font-bold mt-1 tabular-nums">{formatMoney(totals.collected, lang)}</div>
        </Card>
        <Card className="p-4 shadow-card">
          <div className="text-xs text-muted-foreground">{t("commissionAmount")}</div>
          <div className="text-xl font-bold mt-1 tabular-nums text-primary">{formatMoney(totals.commission, lang)}</div>
        </Card>
      </div>

      <Card className="shadow-card overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground text-sm">…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">—</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="text-start p-3">{lang === "ar" ? "الطبيب" : "Doctor"}</th>
                <th className="text-start p-3">{lang === "ar" ? "فاتورة #" : "Invoice #"}</th>
                <th className="text-start p-3">{lang === "ar" ? "تاريخ الفاتورة" : "Invoice date"}</th>
                <th className="text-end p-3">{lang === "ar" ? "إجمالي الفاتورة" : "Invoice total"}</th>
                <th className="text-end p-3">{t("eligibleAmount")}</th>
                <th className="text-end p-3">{t("commissionPercentUsed")}</th>
                <th className="text-end p-3">{t("collectedAmount")}</th>
                <th className="text-end p-3">{t("commissionAmount")}</th>
                <th className="p-3">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3">{profiles[r.doctor_id] ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{r.invoice?.invoice_number ?? "—"}</td>
                  <td className="p-3">{r.invoice ? formatDate(r.invoice.invoice_date, lang) : "—"}</td>
                  <td className="p-3 text-end tabular-nums">{r.invoice ? formatMoney(r.invoice.total, lang) : "—"}</td>
                  <td className="p-3 text-end tabular-nums">{formatMoney(r.base_amount, lang)}</td>
                  <td className="p-3 text-end tabular-nums">{Number(r.commission_percent).toFixed(2)}%</td>
                  <td className="p-3 text-end tabular-nums">{formatMoney(r.collected_amount, lang)}</td>
                  <td className="p-3 text-end tabular-nums font-medium text-primary">{formatMoney(r.commission_amount, lang)}</td>
                  <td className="p-3"><Badge variant="outline" className={statusClass(r.status)}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}