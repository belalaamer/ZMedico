import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Check, Clock3, Phone, RefreshCw, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { subscribeResilient } from "@/lib/realtime";
import { Can } from "@/components/Can";
import { toast } from "sonner";

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
      .order("scheduled_at", { ascending: true });
    if (error) {
      toast.error(lang === "ar" ? "تعذر تحميل الحجوزات المعلقة" : "Could not load pending bookings");
      setLoading(false);
      return;
    }
    setRows((data as unknown as PendingBooking[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!branchSelectionReady) return;
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
        ? (lang === "ar" ? "انتهت مهلة الطلب وتحررت السعة." : "The request expired and capacity was released.")
        : message.includes("slot_unavailable")
          ? (lang === "ar" ? "لم تعد السعة متاحة لهذا الموعد." : "Capacity is no longer available for this appointment.")
          : (lang === "ar" ? "تعذر تأكيد طلب الحجز." : "Could not confirm the booking request."));
      void load();
      return;
    }
    toast.success(lang === "ar" ? "تم تأكيد طلب الحجز" : "Booking request confirmed");
    setRows((current) => current.filter((item) => item.id !== row.id));
  };

  const reject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error(lang === "ar" ? "اكتب سبب الرفض" : "Enter a rejection reason");
      return;
    }
    setBusyId(rejectTarget.id);
    const { error } = await supabase.rpc("reject_public_booking", { p_appointment_id: rejectTarget.id, p_reason: reason });
    setBusyId(null);
    if (error) {
      toast.error(lang === "ar" ? "تعذر رفض طلب الحجز" : "Could not reject the booking request");
      return;
    }
    toast.success(lang === "ar" ? "تم رفض الطلب وتحرير السعة" : "Request rejected and capacity released");
    setRows((current) => current.filter((item) => item.id !== rejectTarget.id));
    setRejectTarget(null);
    setRejectReason("");
  };

  return (
    <div className="space-y-6" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{lang === "ar" ? "طلبات الحجز المعلقة" : "Pending Bookings"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{lang === "ar" ? "طلبات الحجز الواردة من صفحة الحجز الإلكتروني والتي تحتاج تأكيدًا أو رفضًا قبل انتهاء المهلة." : "Online booking requests waiting for staff confirmation or rejection before their hold expires."}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="me-2 size-4" />{lang === "ar" ? "تحديث" : "Refresh"}</Button>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{lang === "ar" ? "جارٍ التحميل…" : "Loading…"}</Card>
      ) : !rows.length ? (
        <Card className="p-10 text-center">
          <Check className="mx-auto size-8 text-emerald-500" />
          <p className="mt-3 text-sm font-medium">{lang === "ar" ? "لا توجد طلبات حجز معلقة حاليًا" : "No pending booking requests right now"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{lang === "ar" ? "أي طلب جديد من صفحة الحجز الإلكتروني سيظهر هنا فورًا." : "Any new request from the online booking page will appear here immediately."}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const left = minutesLeft(row.booking_request_expires_at, now);
            const urgent = left !== null && left <= 5;
            return (
              <Card key={row.id} className={`p-4 md:p-5 ${urgent ? "border-destructive/40 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/appointments/${row.id}`} className="font-semibold hover:underline">{patientName(row.patients, lang)}</Link>
                      {row.public_booking_reference ? <Badge variant="outline">{row.public_booking_reference}</Badge> : null}
                    </div>
                    {row.patients?.phone ? (
                      <a href={`tel:${row.patients.phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
                        <Phone className="size-3.5" />{row.patients.phone}
                      </a>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      {lang === "ar" ? row.services?.name_ar || row.services?.name_en || row.procedure : row.services?.name_en || row.services?.name_ar || row.procedure}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm"><Clock3 className="size-3.5 text-primary" />{fmt(row.scheduled_at, lang)}</p>
                    <p className={`flex items-center gap-1.5 text-xs font-medium ${urgent ? "text-destructive" : "text-amber-600"}`}>
                      <AlertCircle className="size-3.5" />
                      {left === null
                        ? (lang === "ar" ? "في انتظار المراجعة" : "Awaiting review")
                        : left <= 0
                          ? (lang === "ar" ? "على وشك الانتهاء" : "About to expire")
                          : (lang === "ar" ? `ينتهي بعد ${left} دقيقة` : `Expires in ${left} min`)}
                    </p>
                  </div>
                  <Can permission="appointments.edit">
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={busyId === row.id} onClick={() => void confirm(row)}>
                        <Check className="me-1 size-4" />{lang === "ar" ? "تأكيد" : "Confirm"}
                      </Button>
                      <Button size="sm" variant="destructive" disabled={busyId === row.id} onClick={() => { setRejectTarget(row); setRejectReason(""); }}>
                        <X className="me-1 size-4" />{lang === "ar" ? "رفض" : "Reject"}
                      </Button>
                    </div>
                  </Can>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] sm:w-full">
          <DialogHeader><DialogTitle>{lang === "ar" ? "رفض طلب الحجز" : "Reject booking request"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pending-rejection-reason">{lang === "ar" ? "سبب الرفض" : "Reason for rejection"}</Label>
            <Textarea id="pending-rejection-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} maxLength={1000} rows={5} placeholder={lang === "ar" ? "اكتب سببًا واضحًا..." : "Write a clear reason..."} />
            <p className="text-xs text-muted-foreground">{lang === "ar" ? "سيتم حفظ السبب ضمن سجل الموعد." : "The reason will be saved with the appointment."}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRejectTarget(null)}>{t("cancel")}</Button>
            <Button type="button" variant="destructive" disabled={busyId === rejectTarget?.id || !rejectReason.trim()} onClick={() => void reject()}>{lang === "ar" ? "تأكيد الرفض" : "Confirm rejection"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
