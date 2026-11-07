import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Check, Clock3, Phone, RefreshCw, X } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { subscribeResilient } from "@/lib/realtime";
import { Can } from "@/components/Can";
import { toast } from "sonner";
import { showLoadingPlaceholder } from "@/lib/quietRefresh";
import {
  ActionButton,
  EmptyState,
  FieldLabel,
  Ident,
  PageHeader,
  Panel,
  PlatformDialog,
  PlatformTextarea,
  Skeleton,
} from "@/components/zds/surface";
import { cn } from "@/lib/utils";

// This page is the fix for "we have no easy way to track pending booking
// requests" -- before it existed, a pending online-booking request
// (booking_request_status='pending') was only discoverable by scanning the
// calendar day-by-day for an amber highlight, or by already knowing an
// appointment's id and opening its detail page. There was no single place
// listing every request staff still need to confirm/reject before its hold
// window (booking_request_expires_at) runs out and the slot auto-releases
// (a pg_cron job expires these every minute, so an ignored request does not
// block the slot forever -- but staff still had no way to *act* on it in
// time without stumbling onto it).

type PendingBooking = {
  id: string;
  scheduled_at: string;
  procedure: string | null;
  public_booking_reference: string | null;
  booking_request_expires_at: string | null;
  patients: { first_name_en: string; last_name_en: string | null; first_name_ar: string | null; last_name_ar: string | null; phone: string | null } | null;
  services: { name_en: string | null; name_ar: string | null } | null;
};

function patientName(p: PendingBooking["patients"], lang: "ar" | "en") {
  if (!p) return "—";
  return lang === "ar"
    ? `${p.first_name_ar ?? p.first_name_en} ${p.last_name_ar ?? p.last_name_en ?? ""}`.trim()
    : `${p.first_name_en} ${p.last_name_en ?? ""}`.trim();
}

function fmt(value: string, lang: "ar" | "en") {
  return new Date(value).toLocaleString(lang === "ar" ? "ar-EG" : "en-EG", { dateStyle: "medium", timeStyle: "short" });
}

function minutesLeft(expiresAt: string | null, now: number) {
  if (!expiresAt) return null;
  return Math.round((new Date(expiresAt).getTime() - now) / 60000);
}

export default function PendingBookings() {
  const { lang, t } = useI18n();
  const { currentBranchId, branchSelectionReady } = useBranch();
  const [rows, setRows] = useState<PendingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingBooking | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const isArabic = lang === "ar";

  // Keeps the "expires in X min" countdown fresh without needing a refetch.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const load = async () => {
    if (!currentBranchId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("appointments")
      .select("id,scheduled_at,procedure,public_booking_reference,booking_request_expires_at,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,phone),services(name_en,name_ar)")
      .eq("branch_id", currentBranchId)
      .eq("booking_request_status", "pending")
      .is("deleted_at", null)
      // Cancelling from the queue leaves the portal hold `pending`, and
      // confirm_public_booking (20260827091000:169) checks the hold but not the
      // status — approving one of these rows set status='confirmed' and rewrote
      // a cancelled visit back into life, reminders included. It is not work.
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: true });
    if (error) {
      toast.error(isArabic ? "تعذر تحميل الحجوزات المعلقة" : "Could not load pending bookings");
      setLoading(false);
      return;
    }
    setRows((data as unknown as PendingBooking[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!branchSelectionReady) return;
    // The requests on screen belong to the branch that was selected before this
    // one; a quiet refresh must never pass them off as the new branch's.
    setRows((prev) => (prev.length === 0 ? prev : []));
    void load();
    if (!currentBranchId) return;
    return subscribeResilient({
      name: `pending-bookings:${currentBranchId}`,
      bind: (ch) => ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `branch_id=eq.${currentBranchId}` },
        () => void load(),
      ),
      onReconnect: () => void load(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchSelectionReady, currentBranchId]);

  const confirm = async (row: PendingBooking) => {
    setBusyId(row.id);
    const { error } = await supabase.rpc("confirm_public_booking", { p_appointment_id: row.id });
    setBusyId(null);
    if (error) {
      const message = String(error.message || "");
      toast.error(message.includes("booking_request_expired")
        ? (isArabic ? "انتهت مهلة الطلب وتحررت السعة." : "The request expired and capacity was released.")
        : message.includes("slot_unavailable")
          ? (isArabic ? "لم تعد السعة متاحة لهذا الموعد." : "Capacity is no longer available for this appointment.")
          : (isArabic ? "تعذر تأكيد طلب الحجز." : "Could not confirm the booking request."));
      void load();
      return;
    }
    toast.success(isArabic ? "تم تأكيد طلب الحجز" : "Booking request confirmed");
    setRows((current) => current.filter((item) => item.id !== row.id));
  };

  const reject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error(isArabic ? "اكتب سبب الرفض" : "Enter a rejection reason");
      return;
    }
    setBusyId(rejectTarget.id);
    const { error } = await supabase.rpc("reject_public_booking", { p_appointment_id: rejectTarget.id, p_reason: reason });
    setBusyId(null);
    if (error) {
      toast.error(isArabic ? "تعذر رفض طلب الحجز" : "Could not reject the booking request");
      return;
    }
    toast.success(isArabic ? "تم رفض الطلب وتحرير السعة" : "Request rejected and capacity released");
    setRows((current) => current.filter((item) => item.id !== rejectTarget.id));
    setRejectTarget(null);
    setRejectReason("");
  };

  return (
    <div className="z-desk min-h-screen space-y-z6 px-z4 py-z6 sm:px-z6" dir={isArabic ? "rtl" : "ltr"}>
      <PageHeader
        title={isArabic ? "طلبات الحجز المعلقة" : "Pending Bookings"}
        lead={isArabic ? "طلبات الحجز الواردة من صفحة الحجز الإلكتروني والتي تحتاج تأكيدًا أو رفضًا قبل انتهاء المهلة." : "Online booking requests waiting for staff confirmation or rejection before their hold expires."}
        actions={
          <ActionButton tone="quiet" onClick={() => void load()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {isArabic ? "تحديث" : "Refresh"}
          </ActionButton>
        }
      />

      {showLoadingPlaceholder(loading, rows.length) ? (
        <Panel className="space-y-z3 p-z4">
          <Skeleton className="h-z5 w-1/3" />
          <Skeleton className="h-z4 w-1/2" />
          <Skeleton className="h-z4 w-2/5" />
        </Panel>
      ) : !rows.length ? (
        <Panel>
          <EmptyState
            icon={<Check aria-hidden="true" />}
            title={isArabic ? "لا توجد طلبات حجز معلقة حاليًا" : "No pending booking requests right now"}
            body={isArabic ? "أي طلب جديد من صفحة الحجز الإلكتروني سيظهر هنا فورًا." : "Any new request from the online booking page will appear here immediately."}
          />
        </Panel>
      ) : (
        <div className="space-y-z3">
          {rows.map((row) => {
            const left = minutesLeft(row.booking_request_expires_at, now);
            const urgent = left !== null && left <= 5;
            const service = isArabic
              ? row.services?.name_ar || row.services?.name_en || row.procedure
              : row.services?.name_en || row.services?.name_ar || row.procedure;
            return (
              <Panel
                key={row.id}
                className={cn(
                  "border-s-2 p-z4",
                  urgent ? "border-z-critical-stroke bg-z-critical-fill" : "border-z-caution-stroke bg-z-caution-fill",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-z4">
                  <div className="min-w-0 space-y-z2">
                    <div className="flex flex-wrap items-center gap-z2">
                      <Link
                        to={`/appointments/${row.id}`}
                        className="text-z-small rtl:text-z-small-ar font-semibold text-z-ink-900 underline-offset-2 hover:underline"
                      >
                        {patientName(row.patients, lang)}
                      </Link>
                      {row.public_booking_reference ? <Ident>{row.public_booking_reference}</Ident> : null}
                    </div>
                    {row.patients?.phone ? (
                      <a
                        href={`tel:${row.patients.phone}`}
                        className="inline-flex items-center gap-z2 text-z-small rtl:text-z-small-ar text-z-ink-500 hover:text-z-brand-700"
                      >
                        <Phone className="size-3.5" aria-hidden="true" />
                        <Ident>{row.patients.phone}</Ident>
                      </a>
                    ) : null}
                    {service ? <p className="text-z-small rtl:text-z-small-ar text-z-ink-700">{service}</p> : null}
                    <p className="flex items-center gap-z2 text-z-small rtl:text-z-small-ar text-z-ink-700">
                      <Clock3 className="size-3.5 text-z-brand-500" aria-hidden="true" />
                      <span className="z-num">{fmt(row.scheduled_at, lang)}</span>
                    </p>
                    <p className={cn("flex items-center gap-z2 text-z-micro rtl:text-z-micro-ar font-medium", urgent ? "text-z-critical-ink" : "text-z-caution-ink")}>
                      <AlertCircle className="size-3.5" aria-hidden="true" />
                      {left === null
                        ? (isArabic ? "في انتظار المراجعة" : "Awaiting review")
                        : left <= 0
                          ? (isArabic ? "على وشك الانتهاء" : "About to expire")
                          : (isArabic ? `ينتهي بعد ${left} دقيقة` : `Expires in ${left} min`)}
                    </p>
                  </div>
                  <Can permission="appointments.edit">
                    <div className="flex shrink-0 flex-wrap gap-z2">
                      <ActionButton disabled={busyId === row.id} onClick={() => void confirm(row)}>
                        <Check className="size-4" aria-hidden="true" />
                        {isArabic ? "تأكيد" : "Confirm"}
                      </ActionButton>
                      <ActionButton tone="danger" disabled={busyId === row.id} onClick={() => { setRejectTarget(row); setRejectReason(""); }}>
                        <X className="size-4" aria-hidden="true" />
                        {isArabic ? "رفض" : "Reject"}
                      </ActionButton>
                    </div>
                  </Can>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <PlatformDialog
        open={!!rejectTarget}
        onOpenChange={(open) => { if (!open) setRejectTarget(null); }}
        title={isArabic ? "رفض طلب الحجز" : "Reject booking request"}
        icon={<X />}
        dir={isArabic ? "rtl" : "ltr"}
        busy={busyId === rejectTarget?.id}
        footer={
          <>
            <ActionButton tone="quiet" onClick={() => setRejectTarget(null)}>{t("cancel")}</ActionButton>
            <ActionButton tone="danger" disabled={busyId === rejectTarget?.id || !rejectReason.trim()} onClick={() => void reject()}>
              {isArabic ? "تأكيد الرفض" : "Confirm rejection"}
            </ActionButton>
          </>
        }
      >
        <div className="space-y-z2">
          <FieldLabel htmlFor="pending-rejection-reason">{isArabic ? "سبب الرفض" : "Reason for rejection"}</FieldLabel>
          <PlatformTextarea
            id="pending-rejection-reason"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            maxLength={1000}
            rows={5}
            placeholder={isArabic ? "اكتب سببًا واضحًا…" : "Write a clear reason…"}
          />
          <p className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">
            {isArabic ? "سيتم حفظ السبب ضمن سجل الموعد." : "The reason will be saved with the appointment."}
          </p>
        </div>
      </PlatformDialog>
    </div>
  );
}
