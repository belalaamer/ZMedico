import { useEffect, useRef, useState } from "react";
import { useDataSync, notifyDataChange } from "@/lib/dataSync";
import { Link } from "react-router-dom";
import { Plus, Search, FileText, CreditCard, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDate, invoiceCountLabel } from "@/lib/format";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { Fab } from "@/components/ui/fab";
import { RowActions } from "@/components/RowActions";
import { useNavigate } from "react-router-dom";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { Can } from "@/components/Can";
import { ListSkeleton } from "@/components/ListSkeleton";
import { PullToRefresh } from "@/components/PullToRefresh";
import { TablePager } from "@/components/TablePager";
import { patientDisplayDirection, patientDisplayName } from "@/lib/patientName";

const PAGE_SIZE = 50;

type Inv = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: number;
  paid_amount: number;
  status: "draft" | "pending" | "paid" | "partial" | "cancelled";
  patient_id: string;
  patients?: { first_name_en: string; last_name_en: string | null; first_name_ar: string | null; last_name_ar: string | null; name_language: "ar" | "en" | null; patient_code: number };
};

const statusClass: Record<Inv["status"], string> = {
  draft: "status-cancelled",
  pending: "status-review",
  paid: "status-completed",
  partial: "status-progress",
  cancelled: "status-departed",
};

export default function Invoices() {
  const { t, lang } = useI18n();
  const { currentBranchId, branchSelectionReady } = useBranch();
  const navigate = useNavigate();
  // R2: canonical authorization entry point. `canOverride` retains the
  // legacy "admin can delete non-draft invoices and cascade-delete
  // linked payments" behavior — routed through the service.
  const { authz } = useAuthorization("Invoices");
  const canOverride = authz.isSuperAdmin();
  const [items, setItems] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const load = async () => {
    const requestId = ++loadRequestRef.current;
    const branchId = currentBranchId;
    if (!branchSelectionReady || !branchId) {
      setItems([]); setTotal(0); setLoadError(false); setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    const { data, error } = await (supabase as any).rpc("search_invoices_page", {
      p_branch_id: branchId,
      p_search: searchTerm || null,
      p_status: statusFilter === "all" ? null : statusFilter,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (requestId !== loadRequestRef.current) return;
    setLoading(false);
    if (error) { setLoadError(true); toast.error(error.message); return; }

    const rows = (data ?? []) as Array<{
      id: string;
      invoice_number: string;
      invoice_date: string;
      total: number;
      paid_amount: number;
      status: Inv["status"];
      patient_id: string;
      first_name_en: string;
      last_name_en: string | null;
      first_name_ar: string | null;
      last_name_ar: string | null;
      name_language: "ar" | "en" | null;
      patient_code: number;
      total_count: number | string;
    }>;

    if (rows.length === 0 && page > 0) {
      setItems([]);
      setTotal(0);
      setPage((current) => Math.max(0, current - 1));
      return;
    }

    setItems(rows.map((row) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      total: Number(row.total),
      paid_amount: Number(row.paid_amount),
      status: row.status,
      patient_id: row.patient_id,
      patients: {
        first_name_en: row.first_name_en,
        last_name_en: row.last_name_en,
        first_name_ar: row.first_name_ar,
        last_name_ar: row.last_name_ar,
        name_language: row.name_language,
        patient_code: row.patient_code,
      },
    })));
    setTotal(rows.length ? Number(rows[0].total_count ?? rows.length) : 0);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [branchSelectionReady, currentBranchId, statusFilter, searchTerm, page]);
  useEffect(() => { setPage(0); }, [branchSelectionReady, currentBranchId, statusFilter]);
  useDataSync(["invoices", "payments"], () => { void load(); });

  const filtered = items;

  const statusLabel = (s: Inv["status"]) =>
    ({ draft: t("statusDraft"), pending: t("statusPending"), paid: t("statusPaid"), partial: t("statusPartial"), cancelled: t("statusCancelled") }[s]);

  const softDelete = async (i: Inv): Promise<void> => {
    if (!branchSelectionReady || !currentBranchId) { toast.error(t("selectBranch")); return; }
    if (i.status !== "draft" && !canOverride) {
      toast.error(lang === "ar" ? "يمكن حذف المسودات فقط" : "Only draft invoices can be deleted");
      return;
    }
    const nowIso = new Date().toISOString();
    // For non-draft admin deletes: fully void first (cancels invoice, soft-deletes
    // payments, restores inventory, cancels commissions) then soft-delete the row.
    if (i.status !== "draft" && canOverride) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: voidErr } = await (supabase as any).rpc("void_invoice_financials", {
        _invoice_id: i.id,
        _user_id: user?.id ?? null,
      });
      if (voidErr) { toast.error(voidErr.message); return; }
      notifyDataChange("invoices");
      notifyDataChange("inventory");
      notifyDataChange("payments");
      notifyDataChange("doctor_commissions");
    }
    const { error } = await supabase.from("invoices").update({ deleted_at: nowIso } as any).eq("id", i.id).eq("branch_id", currentBranchId);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };

  return (
    <PullToRefresh onRefresh={load}>
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("invoices")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{invoiceCountLabel(total, lang)}</p>
        </div>
        <div className="flex w-full sm:w-auto gap-2 items-center flex-wrap">
          <div className="flex w-full sm:w-auto flex-col sm:flex-row sm:items-center gap-2 bg-card border shadow-sm rounded-lg p-2">
            <div className="relative w-full sm:w-56">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={t("search")} className="ps-9 border-0 shadow-none focus-visible:ring-1 bg-transparent" />
            </div>
            <div className="hidden sm:block h-6 w-px bg-border" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px] border-0 shadow-none bg-transparent focus:ring-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("status")}</SelectItem>
                <SelectItem value="draft">{t("statusDraft")}</SelectItem>
                <SelectItem value="pending">{t("statusPending")}</SelectItem>
                <SelectItem value="partial">{t("statusPartial")}</SelectItem>
                <SelectItem value="paid">{t("statusPaid")}</SelectItem>
                <SelectItem value="cancelled">{t("statusCancelled")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Can permission="invoices.create">
            <Button className="gradient-primary text-primary-foreground hidden sm:inline-flex" onClick={() => setOpen(true)}>
              <Plus className="me-2 size-4" />{t("newInvoice")}
            </Button>
          </Can>
          <Button
            variant="outline"
            className="hidden sm:inline-flex text-warning border-warning/30 hover:bg-warning/10 hover:text-warning"
            onClick={() => navigate("/invoices/outstanding")}
          >
            <AlertCircle className="me-2 size-4" />{t("outstandingDebts")}
          </Button>
        </div>
      </div>

      <Card className="shadow-card overflow-hidden">
        {loading ? (
          <ListSkeleton rows={8} />
        ) : loadError ? (
          <div className="p-10 text-center space-y-3" role="alert">
            <AlertCircle className="mx-auto size-8 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t("loadFailed")}</p>
            <Button variant="outline" onClick={load}>{t("retry")}</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noInvoices")}</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((i) => {
              const p = i.patients!;
              const name = patientDisplayName(p, lang);
              const nameDirection = patientDisplayDirection(p, lang);
              const iconClass =
                i.status === "paid" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : i.status === "partial" || i.status === "pending" ? "bg-warning/10 text-warning"
                : i.status === "cancelled" ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary";
              const remaining = Number(i.total) - Number(i.paid_amount);
              const showRemaining = (i.status === "partial" || i.status === "pending") && remaining > 0;
              return (
                <div key={i.id} className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors">
                  <Link to={`/invoices/${i.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}>
                    <FileText className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold tabular-nums">{i.invoice_number}</div>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      <span dir={nameDirection}>{name}</span> · {t("invoiceDate")}: {formatDate(i.invoice_date, lang)}
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="text-lg font-bold tabular-nums leading-tight">{formatMoney(i.total, lang)}</div>
                    {showRemaining ? (
                      <div className="text-[11px] font-semibold text-warning tabular-nums mt-0.5">
                        {lang === "ar" ? "المتبقي" : "Remaining"}: {formatMoney(remaining, lang)}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{t("paid")}: {formatMoney(i.paid_amount, lang)}</div>
                    )}
                  </div>
                  <Badge variant="outline" className={`${statusClass[i.status]} shrink-0`}>{statusLabel(i.status)}</Badge>
                  </Link>
                  <RowActions
                    onEdit={() => navigate(`/invoices/${i.id}`)}
                    onDelete={() => softDelete(i)}
                    canEdit={authz.can("invoices.edit")}
                    canDelete={authz.can("invoices.delete") && (canOverride || i.status === "draft")}
                    extraItems={
                      i.status !== "paid" && i.status !== "cancelled" && authz.can("invoices.create")
                        ? [{
                            label: t("recordPayment"),
                            icon: <CreditCard className="size-4" />,
                            onClick: () => navigate(`/payments?invoice=${i.id}&patient=${i.patient_id}&amount=${(Number(i.total) - Number(i.paid_amount)).toFixed(2)}`),
                          }]
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
        <TablePager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </Card>

      <CreateInvoiceDialog open={open} onOpenChange={setOpen} onSaved={() => { setOpen(false); load(); }} />
      <Can permission="invoices.create">
        <Fab ariaLabel={t("newInvoice")} onClick={() => setOpen(true)}>
          <Plus className="size-6" />
        </Fab>
      </Can>
    </div>
    </PullToRefresh>
  );
}
