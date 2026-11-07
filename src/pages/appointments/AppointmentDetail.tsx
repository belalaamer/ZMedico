import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ListSkeleton } from "@/components/ListSkeleton";
import { Activity, ArrowLeft, ExternalLink, Stethoscope, User as UserIcon, MapPin, Clock, ScrollText, Receipt, CheckCircle2, MessageCircle, Check, X } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreateInvoiceDialog } from "@/pages/invoices/CreateInvoiceDialog";
import { Can } from "@/components/Can";
import { doctorDisplayName } from "@/lib/doctorName";
import { formatDateTime } from "@/lib/format";
import type { DictKey } from "@/lib/i18n";
import { appointmentWhatsAppMessage, openWhatsApp } from "@/lib/whatsapp";
import { getOrCreateAppointmentMedicalRecord } from "@/lib/medicalRecordEncounter";
import {
  ActionButton,
  FieldLabel,
  Notice,
  PageHeader,
  Panel,
  PlatformDialog,
  PlatformTextarea,
  SectionLabel,
  StatusChip,
  type SignalTone,
} from "@/components/zds/surface";

import { QUEUE_AUDIT_ACTIONS as QUEUE_ACTIONS, QUEUE_AUDIT_SAFE_KEYS as SAFE_KEYS, queueActionLabel } from "@/lib/queueAuditActions";

// The badge used to print the raw DB enum with underscores swapped for spaces,
// so an Arabic screen read "in progress". CalendarPage already maps these seven
// statuses onto dictionary keys; this is the same mapping, so the two screens
// cannot drift apart on an unknown status — anything unmapped still falls back
// to the old text rather than rendering nothing.
const STATUS_KEYS: Record<string, DictKey> = {
  scheduled: "statusScheduled",
  confirmed: "statusConfirmed",
  in_progress: "statusInProgress",
  completed: "statusCompleted",
  cancelled: "statusCancelled",
  no_show: "statusNoShow",
  departed: "statusDeparted",
};

const STATUS_TONE: Record<string, SignalTone> = {
  scheduled: "neutral",
  confirmed: "positive",
  in_progress: "caution",
  completed: "positive",
  cancelled: "critical",
  no_show: "critical",
  departed: "neutral",
};

function fmt(iso: string | null | undefined, lang: "en" | "ar") {
  if (!iso) return "—";
  try { return formatDateTime(iso, lang); } catch { return "—"; }
}
function diff(o: any, n: any) {
  const so: any = {}; const sn: any = {};
  SAFE_KEYS.forEach((k) => { if (o && k in o) so[k] = o[k]; if (n && k in n) sn[k] = n[k]; });
  const keys = new Set([...Object.keys(so), ...Object.keys(sn)]);
  const parts: string[] = [];
  keys.forEach((k) => {
    if (JSON.stringify(so[k]) === JSON.stringify(sn[k])) return;
    const f = (v: any) => v == null ? "—" : typeof v === "string" && v.length > 24 ? v.slice(0, 24) + "…" : String(v);
    parts.push(`${k}: ${f(so[k])} → ${f(sn[k])}`);
  });
  return parts.join(" · ");
}

export default function AppointmentDetailPage() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const { user } = useAuth();
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [loading, setLoading] = useState(true);
  const [appt, setAppt] = useState<any | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; full_name_en?: string | null; full_name_ar?: string | null }>>({});
  const [record, setRecord] = useState<{ id: string } | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [bookingActionBusy, setBookingActionBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const isArabic = lang === "ar";

  useEffect(() => {
    if (!appointmentId) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [{ data: a, error: aErr }, { data: l }] = await Promise.all([
        supabase
          .from("appointments")
          .select("id,patient_id,doctor_id,branch_id,room,scheduled_at,status,procedure,service_id,priority,checked_in_at,started_at,is_walk_in,duration_minutes,booking_request_status,booking_request_expires_at,booking_rejection_reason,services(name_en,name_ar),patients(first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code,phone),branches(name_en,name_ar)")
          .eq("id", appointmentId)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("audit_logs")
          .select("id,action,user_id,created_at,old_values,new_values")
          .eq("entity_type", "appointment")
          .eq("entity_id", appointmentId)
          .in("action", QUEUE_ACTIONS)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (!active) return;
      if (aErr) toast.error(aErr.message);
      setAppt(a);
      setLogs(l ?? []);
      // hydrate user names + doctor name + linked medical record
      const userIds = Array.from(new Set(((l ?? []).map((r: any) => r.user_id).filter(Boolean) as string[]).concat(a?.doctor_id ? [a.doctor_id] : [])));
      if (userIds.length) {
        const { data: pr } = await supabase.from("profiles").select("id,full_name,full_name_en,full_name_ar").in("id", userIds);
        const map: Record<string, { full_name: string | null; full_name_en?: string | null; full_name_ar?: string | null }> = {};
        (pr ?? []).forEach((p: any) => { map[p.id] = p; });
        if (active) setProfiles(map);
      }
      const { data: rec } = await supabase
        .from("medical_records")
        .select("id")
        .eq("appointment_id", appointmentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (active) setRecord(rec?.[0] ?? null);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [appointmentId]);

  const patientName = useMemo(() => {
    const p = appt?.patients;
    if (!p) return "—";
    return lang === "ar"
      ? `${p.first_name_ar ?? p.first_name_en} ${p.last_name_ar ?? p.last_name_en ?? ""}`.trim()
      : `${p.first_name_en} ${p.last_name_en ?? ""}`.trim();
  }, [appt, lang]);

  const branchName = useMemo(() => {
    const b = appt?.branches; if (!b) return "—";
    return lang === "ar" ? (b.name_ar ?? b.name_en) : b.name_en;
  }, [appt, lang]);

  // Cancelling from the queue flips `status` only and leaves the hold `pending`,
  // and confirm_public_booking checks the hold but not the status — so a dead
  // appointment could be confirmed back to life from this screen.
  const bookingHoldPending = appt?.booking_request_status === "pending" && appt?.status !== "cancelled";

  const confirmBookingRequest = async () => {
    if (!appt || bookingActionBusy) return;
    setBookingActionBusy(true);
    const { error } = await supabase.rpc("confirm_public_booking", { p_appointment_id: appt.id });
    setBookingActionBusy(false);
    if (error) {
      const message = String(error.message || "");
      toast.error(message.includes("booking_request_expired")
        ? (isArabic ? "انتهت مهلة الطلب وتحررت السعة." : "The request expired and capacity was released.")
        : message.includes("slot_unavailable")
          ? (isArabic ? "لم تعد السعة متاحة لهذا الموعد." : "Capacity is no longer available for this appointment.")
          : (isArabic ? "تعذر تأكيد طلب الحجز." : "Could not confirm the booking request."));
      return;
    }
    setAppt((current: any) => current ? { ...current, status: "confirmed", booking_request_status: "confirmed", booking_request_expires_at: null } : current);
    toast.success(isArabic ? "تم تأكيد طلب الحجز" : "Booking request confirmed");
  };

  const rejectBookingRequest = async () => {
    if (!appt || bookingActionBusy) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error(isArabic ? "اكتب سبب الرفض" : "Enter a rejection reason");
      return;
    }
    setBookingActionBusy(true);
    const { error } = await supabase.rpc("reject_public_booking", { p_appointment_id: appt.id, p_reason: reason });
    setBookingActionBusy(false);
    if (error) {
      toast.error(isArabic ? "تعذر رفض طلب الحجز" : "Could not reject the booking request");
      return;
    }
    setAppt((current: any) => current ? { ...current, status: "cancelled", booking_request_status: "rejected", booking_request_expires_at: null, booking_rejection_reason: reason } : current);
    setRejectOpen(false);
    setRejectReason("");
    toast.success(isArabic ? "تم رفض الطلب وتحرير السعة" : "Request rejected and capacity released");
  };

  if (loading) {
    return (
      <div className="z-desk min-h-screen p-z4 sm:p-z6">
        <Panel className="overflow-hidden">
          <ListSkeleton rows={6} />
        </Panel>
      </div>
    );
  }
  if (!appt) {
    return (
      <div className="z-desk min-h-screen p-z4 sm:p-z6">
        <Panel className="p-z10 text-center text-z-small rtl:text-z-small-ar text-z-ink-500">{t("noData")}</Panel>
      </div>
    );
  }

  const statusText = STATUS_KEYS[String(appt.status)] ? t(STATUS_KEYS[String(appt.status)]) : String(appt.status).replace(/_/g, " ");
  const statusTone: SignalTone = STATUS_TONE[String(appt.status)] ?? "neutral";

  return (
    <div className="z-desk min-h-screen space-y-z4 p-z4 sm:p-z6" dir={isArabic ? "rtl" : "ltr"}>
      <PageHeader
        title={t("appointmentDetailTitle")}
        actions={
          <>
            <ActionButton tone="quiet" asChild>
              <Link to={`/patients/${appt.patient_id}`}><UserIcon className="size-4" aria-hidden="true" />{t("openChart")}</Link>
            </ActionButton>
            {appt.patients?.phone ? (
              <ActionButton
                tone="quiet"
                onClick={() => {
                  const ok = openWhatsApp(
                    appt.patients.phone,
                    appointmentWhatsAppMessage({ patientName, appointmentDate: fmt(appt.scheduled_at, lang), branchName, lang }),
                  );
                  if (!ok) toast.error(isArabic ? "رقم الهاتف غير صالح" : "Invalid phone number");
                }}
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                {isArabic ? "رسالة WhatsApp" : "WhatsApp message"}
              </ActionButton>
            ) : null}
            {record ? (
              <ActionButton asChild>
                <Link to={`/medical/consultation/${record.id}`}><Stethoscope className="size-4" aria-hidden="true" />{t("openConsultation")}</Link>
              </ActionButton>
            ) : null}
            {appt.status === "completed" && !record ? (
              <Can permission="medical_records.create">
                <ActionButton
                  disabled={starting}
                  onClick={async () => {
                    setStarting(true);
                    try {
                      const encounter = await getOrCreateAppointmentMedicalRecord({
                        appointmentId: appt.id,
                        patientId: appt.patient_id,
                        branchId: appt.branch_id,
                        doctorId: appt.doctor_id ?? user?.id ?? null,
                        createdBy: user?.id ?? null,
                      });
                      nav(`/medical/records/${encounter.id}`);
                    } catch (e: any) {
                      toast.error(e?.message ?? (isArabic ? "تعذر بدء الاستشارة" : "Could not start consultation"));
                    } finally {
                      setStarting(false);
                    }
                  }}
                >
                  <Stethoscope className="size-4" aria-hidden="true" />
                  {isArabic ? "بدء الاستشارة" : "Start Consultation"}
                </ActionButton>
              </Can>
            ) : null}
            {appt.status === "completed" ? (
              <Can permission="medical_records.create">
                <ActionButton tone="quiet" asChild>
                  <Link to={`/physio?patient=${appt.patient_id}&appointment=${appt.id}&new=1`}>
                    <Activity className="size-4" aria-hidden="true" />
                    {isArabic ? "بدء حالة علاج طبيعي" : "Start Physio Case"}
                  </Link>
                </ActionButton>
              </Can>
            ) : null}
            {appt.status === "completed" ? (
              <Can permission="invoices.create">
                <ActionButton tone="quiet" onClick={() => setInvoiceOpen(true)}>
                  <Receipt className="size-4" aria-hidden="true" />
                  {isArabic ? "إنشاء فاتورة" : "Generate Invoice"}
                </ActionButton>
              </Can>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-z3">
        <Link to="/queue" className="inline-flex items-center gap-z2 text-z-small rtl:text-z-small-ar text-z-ink-500 hover:text-z-ink-900">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {isArabic ? "الرجوع إلى الطابور" : "Back to queue"}
        </Link>
        <span className="text-z-small rtl:text-z-small-ar text-z-ink-700">{patientName}</span>
        <span className="z-num text-z-small rtl:text-z-small-ar text-z-ink-500">{fmt(appt.scheduled_at, lang)}</span>
      </div>

      {appt.status === "completed" ? (
        <Notice tone="positive" title={isArabic ? "الموعد مكتمل — الخطوات التالية" : "Appointment completed — next steps"}>
          {isArabic
            ? "تابع مباشرة إلى السجل الطبي أو ابدأ حالة علاج طبيعي أو أصدر الفاتورة."
            : "Continue to the medical record, start a physio case, or issue the invoice."}
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-z4 lg:grid-cols-3">
        <Panel className="space-y-z3 p-z4 lg:col-span-1">
          <SectionLabel>{t("status")}</SectionLabel>
          <div className="flex flex-wrap items-center gap-z2">
            <StatusChip tone={statusTone}>{statusText}</StatusChip>
            {bookingHoldPending ? <StatusChip tone="caution">{isArabic ? "طلب يحتاج تأكيدًا" : "Awaiting confirmation"}</StatusChip> : null}
            {appt.booking_request_status === "rejected" ? <StatusChip tone="critical">{isArabic ? "مرفوض" : "Rejected"}</StatusChip> : null}
            {appt.booking_request_status === "expired" ? <StatusChip tone="neutral">{isArabic ? "منتهي" : "Expired"}</StatusChip> : null}
            {appt.is_walk_in ? <StatusChip tone="neutral">{t("walkIn")}</StatusChip> : null}
            {(appt.priority ?? 0) > 0 ? <StatusChip tone="critical">{t("urgent")}</StatusChip> : null}
          </div>

          {bookingHoldPending ? (
            <div className="space-y-z2 rounded-z2 border border-s-2 border-z-caution-stroke bg-z-caution-fill p-z3">
              <div className="text-z-micro rtl:text-z-micro-ar text-z-caution-ink">
                {appt.booking_request_expires_at
                  ? (isArabic ? `تنتهي المهلة: ${fmt(appt.booking_request_expires_at, lang)}` : `Hold expires: ${fmt(appt.booking_request_expires_at, lang)}`)
                  : (isArabic ? "في انتظار المراجعة" : "Awaiting review")}
              </div>
              <Can permission="appointments.edit">
                <div className="flex flex-wrap gap-z2">
                  <ActionButton disabled={bookingActionBusy} onClick={confirmBookingRequest}>
                    <Check className="size-4" aria-hidden="true" />
                    {isArabic ? "تأكيد الحجز" : "Confirm booking"}
                  </ActionButton>
                  <ActionButton tone="danger" disabled={bookingActionBusy} onClick={() => setRejectOpen(true)}>
                    <X className="size-4" aria-hidden="true" />
                    {isArabic ? "رفض الطلب" : "Reject request"}
                  </ActionButton>
                </div>
              </Can>
            </div>
          ) : null}

          {appt.booking_request_status === "rejected" && appt.booking_rejection_reason ? (
            <div className="space-y-z1 rounded-z2 border border-s-2 border-z-critical-stroke bg-z-critical-fill p-z3">
              <div className="text-z-micro rtl:text-z-micro-ar font-semibold text-z-critical-ink">{isArabic ? "سبب الرفض" : "Rejection reason"}</div>
              <div className="text-z-small rtl:text-z-small-ar text-z-ink-700">{appt.booking_rejection_reason}</div>
            </div>
          ) : null}

          <dl className="space-y-z2 border-t border-z-line-hairline pt-z3 text-z-small rtl:text-z-small-ar">
            <div className="flex items-center gap-z2">
              <UserIcon className="size-4 shrink-0 text-z-ink-500" aria-hidden="true" />
              <dt className="text-z-ink-500">{t("doctor")}</dt>
              <dd className="min-w-0 text-z-ink-900">{appt.doctor_id ? (profiles[appt.doctor_id] ? doctorDisplayName(profiles[appt.doctor_id], lang) : appt.doctor_id.slice(0, 8)) : "—"}</dd>
            </div>
            <div className="flex items-center gap-z2">
              <MapPin className="size-4 shrink-0 text-z-ink-500" aria-hidden="true" />
              <dd className="min-w-0 text-z-ink-900">{branchName}{appt.room ? ` · ${t("room")}: ${appt.room}` : ""}</dd>
            </div>
            <div className="flex items-center gap-z2">
              <Clock className="size-4 shrink-0 text-z-ink-500" aria-hidden="true" />
              <dt className="text-z-ink-500">{t("appointmentTime")}</dt>
              <dd className="z-num min-w-0 text-z-ink-900">{fmt(appt.scheduled_at, lang)}</dd>
            </div>
            <div className="flex items-center gap-z2">
              <Clock className="size-4 shrink-0 text-z-ink-500" aria-hidden="true" />
              <dt className="text-z-ink-500">{t("checkedInAt")}</dt>
              <dd className="z-num min-w-0 text-z-ink-900">{fmt(appt.checked_in_at, lang)}</dd>
            </div>
            <div className="flex items-center gap-z2">
              <Clock className="size-4 shrink-0 text-z-ink-500" aria-hidden="true" />
              <dt className="text-z-ink-500">{t("inSessionTime")}</dt>
              <dd className="z-num min-w-0 text-z-ink-900">{fmt(appt.started_at, lang)}</dd>
            </div>
          </dl>

          {(appt.services || appt.procedure) ? (
            <div className="border-t border-z-line-hairline pt-z3 text-z-small rtl:text-z-small-ar text-z-ink-700">
              {appt.services
                ? (isArabic ? (appt.services.name_ar || appt.services.name_en) : (appt.services.name_en || appt.services.name_ar))
                : appt.procedure}
            </div>
          ) : null}
        </Panel>

        <Panel className="p-z4 lg:col-span-2">
          <div className="mb-z3 flex items-center gap-z2">
            <ScrollText className="size-4 text-z-ink-500" aria-hidden="true" />
            <h2 className="text-z-small rtl:text-z-small-ar font-semibold text-z-ink-900">{t("queueActionsHistory")}</h2>
            <Link to={`/queue/audit?appointment=${appt.id}`} className="ms-auto inline-flex items-center gap-z1 text-z-micro rtl:text-z-micro-ar text-z-brand-700 hover:underline">
              {t("openInAudit")}
              <ExternalLink className="size-3" aria-hidden="true" />
            </Link>
          </div>
          {logs.length === 0 ? (
            <div className="py-z10 text-center text-z-small rtl:text-z-small-ar text-z-ink-500">{t("noData")}</div>
          ) : (
            <ol className="relative ms-z3 space-y-z3 border-s border-z-line-edge">
              {logs.map((r) => (
                <li key={r.id} className="ps-z4">
                  <span className="absolute -start-1.5 mt-1.5 size-3 rounded-full border border-z-brand-500 bg-z-brand-100" aria-hidden="true" />
                  <div className="flex flex-wrap items-center gap-z2 text-z-small rtl:text-z-small-ar">
                    <StatusChip tone="neutral">{queueActionLabel(r.action, lang)}</StatusChip>
                    <span className="z-num text-z-micro rtl:text-z-micro-ar text-z-ink-500">{fmt(r.created_at, lang)}</span>
                    <span className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{profiles[r.user_id]?.full_name ?? (r.user_id ? r.user_id.slice(0, 8) : "—")}</span>
                  </div>
                  <div className="mt-z1 text-z-micro rtl:text-z-micro-ar text-z-ink-500">{diff(r.old_values, r.new_values) || "—"}</div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <PlatformDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={isArabic ? "رفض طلب الحجز" : "Reject booking request"}
        icon={<X />}
        dir={isArabic ? "rtl" : "ltr"}
        busy={bookingActionBusy}
        footer={
          <>
            <ActionButton tone="quiet" onClick={() => setRejectOpen(false)}>{t("cancel")}</ActionButton>
            <ActionButton tone="danger" disabled={bookingActionBusy || !rejectReason.trim()} onClick={rejectBookingRequest}>
              {isArabic ? "تأكيد الرفض" : "Confirm rejection"}
            </ActionButton>
          </>
        }
      >
        <div className="space-y-z2">
          <FieldLabel htmlFor="appointment-rejection-reason">{isArabic ? "سبب الرفض" : "Reason for rejection"}</FieldLabel>
          <PlatformTextarea
            id="appointment-rejection-reason"
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
      <CreateInvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        presetPatientId={appt.patient_id}
        onSaved={() => setInvoiceOpen(false)}
      />
    </div>
  );
}
