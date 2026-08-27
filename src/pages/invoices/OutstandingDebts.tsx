import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, MessageCircle, FileText } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDate } from "@/lib/format";
import { useDataSync } from "@/lib/dataSync";
import { ListSkeleton } from "@/components/ListSkeleton";
import { openWhatsApp, invoiceWhatsAppMessage } from "@/lib/whatsapp";
import { Can } from "@/components/Can";
import { patientDisplayName, patientDisplayDirection } from "@/lib/patientName";

type Row = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: number;
  paid_amount: number;
  status: "pending" | "partial" | "draft" | "paid" | "cancelled";
  patient_id: string;
  patients?: {
    first_name_en: string; last_name_en: string | null;
    first_name_ar: string | null; last_name_ar: string | null;
    patient_code: number; phone: string | null; name_language?: "ar" | "en" | null;

  };
};

export default function OutstandingDebts() {
  const { t, lang } = useI18n();
  const { currentBranchId, branchSelectionReady } = useBranch();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "partial">("all");
  const loadRequestRef = useRef(0);

  const load = async () => {
    const requestId = ++loadRequestRef.current;
    const branchId = currentBranchId;
    if (!branchSelectionReady || !branchId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    let q = supabase.from("invoices")
      .select("id,invoice_number,invoice_date,total,paid_amount,status,patient_id,patients!inner(first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code,phone)")
      .is("deleted_at", null)
      .in("status", ["pending", "partial"])
      .order("invoice_date", { ascending: false })
      .limit(500);
    q = q.eq("branch_id", branchId);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (requestId !== loadRequestRef.current) return;
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const filtered = (data ?? []).filter((i: any) => Number(i.total) - Number(i.paid_amount) > 0.009);
    setRows(filtered as any);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [branchSelectionReady, currentBranchId, filter]);
  useDataSync(["invoices", "payments"], () => { void load(); });

  const totalOutstanding = rows.reduce((s, r) => s + (Number(r.total) - Number(r.paid_amount)), 0);

  const sendReminder = (r: Row) => {
    const p = r.patients!;
    const name = patientDisplayName(p, lang);
    const remaining = (Number(r.total) - Number(r.paid_amount)).toFixed(2);
    if (!p.phone) { toast.error(lang === "ar" ? "لا يوجد رقم هاتف" : "No phone on file"); return; }
    const link = `${window.location.origin}/invoices/${r.id}`;
    const msg = invoiceWhatsAppMessage({
      patientName: name, invoiceNumber: r.invoice_number,
      total: r.total, remaining, lang, link,
    });
    openWhatsApp(p.phone, msg);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("outstandingDebts")}</h1>
          <p className="text-sm text-muted-foreground mt-1 tabular-nums">
            {rows.length} · {formatMoney(totalOutstanding, lang)}
          </p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="pending">{t("statusPending")}</SelectItem>
            <SelectItem value="partial">{t("statusPartial")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-card overflow-hidden">
        {loading ? (
          <ListSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noOutstanding")}</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => {
              const p = r.patients!;
              const name = patientDisplayName(p, lang);
              const nameDirection = patientDisplayDirection(p, lang);
              const outstanding = Number(r.total) - Number(r.paid_amount);
              return (
                <div key={r.id} className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors flex-wrap">
                  <Link to={`/invoices/${r.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="size-10 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                      <FileText className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold tabular-nums">{r.invoice_number}</div>
                        <Badge variant="outline" className={r.status === "partial" ? "status-progress" : "status-review"}>
                          {r.status === "partial" ? t("statusPartial") : t("statusPending")}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        <span dir={nameDirection}>{name}</span> · {formatDate(r.invoice_date, lang)}
                      </div>
                    </div>
                    <div className="text-end hidden sm:block">
                      <div className="text-[11px] text-muted-foreground">{t("total")}</div>
                      <div className="font-medium tabular-nums">{formatMoney(r.total, lang)}</div>
                    </div>
                    <div className="text-end hidden sm:block">
                      <div className="text-[11px] text-muted-foreground">{t("paid")}</div>
                      <div className="font-medium tabular-nums">{formatMoney(r.paid_amount, lang)}</div>
                    </div>
                    <div className="text-end">
                      <div className="text-[11px] text-muted-foreground">{t("outstanding")}</div>
                      <div className="font-semibold tabular-nums text-warning">{formatMoney(outstanding, lang)}</div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Can permission="invoices.create">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/payments?invoice=${r.id}&patient=${r.patient_id}&amount=${outstanding.toFixed(2)}`)}>
                        <CreditCard className="me-1 size-4" />
                        {t("recordPayment")}
                      </Button>
                    </Can>
                    <Button size="sm" variant="ghost" onClick={() => sendReminder(r)} disabled={!p.phone}>
                      <MessageCircle className="me-1 size-4" />
                      {t("sendReminder")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
