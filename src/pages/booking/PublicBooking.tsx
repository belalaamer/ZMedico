import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, Clock3, Globe2, MapPin, Phone, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getPublicBookingLocator } from "@/lib/publicBookingTenant";
import { toast } from "sonner";

 type Lang = "ar" | "en";

type Branch = {
  id: string;
  name_en: string;
  name_ar: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  working_hours_start: string | null;
  working_hours_end: string | null;
  working_days: number[] | null;
  max_future_booking_days: number;
  min_advance_booking_hours: number;
  slot_duration_minutes: number;
  require_confirmation: boolean;
};

type BookingOption = {
  id: string;
  name_en: string;
  name_ar: string;
  duration_minutes: number;
  source: "service" | "procedure";
};

type Doctor = {
  id: string;
  full_name: string | null;
  full_name_en: string | null;
  full_name_ar: string | null;
};

type Slot = {
  slot_start: string;
  slot_end: string;
  available: boolean;
};

type BookingResult = {
  booking_reference: string;
  scheduled_at: string;
  status: string;
  service_name_en: string;
  service_name_ar: string;
  branch_name_en: string;
  branch_name_ar: string;
};

type PublicBookingOptions = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  branches: Branch[];
  services: BookingOption[];
  procedures: BookingOption[];
  doctors: Doctor[];
};

type RpcError = { message?: string } | null;

function publicRpc<T>(name: string, args?: Record<string, unknown>) {
  const client = supabase as unknown as {
    rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: T | null; error: RpcError }>;
  };
  return client.rpc(name, args);
}

const WEEKDAY_NAMES: Record<Lang, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
};

function localDateInputValue(date: Date) {
  const tz = date.getTimezoneOffset();
  return new Date(date.getTime() - tz * 60_000).toISOString().slice(0, 10);
}

function nextBookableDate(branch?: Branch | null) {
  const today = new Date();
  for (let offset = 1; offset <= 14; offset += 1) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + offset);
    if (!branch?.working_days?.length || branch.working_days.includes(candidate.getDay())) {
      return localDateInputValue(candidate);
    }
  }
  return localDateInputValue(new Date(today.getTime() + 86_400_000));
}

function displayName(item: { name_en?: string | null; name_ar?: string | null }, lang: Lang) {
  return lang === "ar" ? item.name_ar || item.name_en || "—" : item.name_en || item.name_ar || "—";
}

function doctorName(doctor: Doctor, lang: Lang) {
  if (lang === "ar") return doctor.full_name_ar || doctor.full_name || doctor.full_name_en || "—";
  return doctor.full_name_en || doctor.full_name || doctor.full_name_ar || "—";
}

function formatSlot(iso: string, lang: Lang) {
  return new Date(iso).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-EG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatBookingDate(iso: string, lang: Lang) {
  return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getInitialDate(branch?: Branch | null) {
  return nextBookableDate(branch);
}

export default function PublicBooking() {
  const { lang, setLang } = useI18n();
  const isArabic = lang === "ar";
  const isArabicRef = useRef(isArabic);
  useEffect(() => { isArabicRef.current = isArabic; }, [isArabic]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState("ZMedico");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<BookingOption[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", complaint: "" });

  const branch = useMemo(() => branches.find((item) => item.id === branchId) ?? null, [branches, branchId]);
  const service = useMemo(() => services.find((item) => item.id === serviceId) ?? null, [services, serviceId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingOptions(true);
      setOptionsError(null);
      const locator = getPublicBookingLocator(window.location.hostname, window.location.search);
      let resolvedTenantId: string | null = null;
      if (locator.mode === "custom-domain") {
        const resolved = await publicRpc<Array<{ tenant_id?: string | null }>>("resolve_active_tenant_domain", { _hostname: locator.hostname });
        resolvedTenantId = resolved.data?.[0]?.tenant_id ?? null;
        if (resolved.error || !resolvedTenantId) {
          setOptionsError(isArabic ? "رابط الحجز غير مرتبط بعيادة نشطة" : "This booking link is not linked to an active clinic");
          setLoadingOptions(false);
          return;
        }
      } else if (locator.mode === "tenant-query") {
        const resolved = await publicRpc<Array<{ tenant_id?: string | null }>>("public_booking_tenant_by_slug", { p_slug: locator.slug });
        resolvedTenantId = resolved.data?.[0]?.tenant_id ?? null;
        if (resolved.error || !resolvedTenantId) {
          setOptionsError(isArabic ? "العيادة غير موجودة أو اشتراكها منتهٍ" : "The clinic does not exist or its subscription is inactive");
          setLoadingOptions(false);
          return;
        }
      } else {
        setOptionsError(isArabic ? "رابط الحجز يحتاج إلى معرف العيادة" : "This booking link needs a clinic identifier");
        setLoadingOptions(false);
        return;
      }
      const { data, error } = await publicRpc<PublicBookingOptions>("public_booking_options_for_tenant", { p_tenant_id: resolvedTenantId });
      if (cancelled) return;
      if (error || !data) {
        setOptionsError(error?.message || (isArabic ? "تعذر تحميل خيارات الحجز" : "Unable to load booking options"));
        setLoadingOptions(false);
        return;
      }
      setTenantId(data.tenant_id ?? resolvedTenantId);
      setTenantName(data.tenant_name || "ZMedico");
      const nextBranches = (data.branches ?? []) as Branch[];
      const nextServices = [
        ...((data?.services ?? []) as BookingOption[]),
        ...((data?.procedures ?? []) as BookingOption[]),
      ];
      setBranches(nextBranches);
      setServices(nextServices);
      // Doctors are loaded through the service-aware RPC below; do not render
      // the unfiltered options payload while the selected service is resolving.
      setDoctors([]);
      setBranchId((current) => current || nextBranches[0]?.id || "");
      setServiceId((current) => current || nextServices[0]?.id || "");
      setDate((current) => current || getInitialDate(nextBranches[0]));
      setLoadingOptions(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [isArabic]);

  useEffect(() => {
    if (!branch) return;
    setDate((current) => current || getInitialDate(branch));
  }, [branch]);

  useEffect(() => {
    if (!branchId || !serviceId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await publicRpc<Doctor[]>("list_doctors_for_service", {
        p_branch_id: branchId,
        p_service_id: serviceId,
        p_service_kind: service?.source ?? "service",
      });
      if (cancelled) return;
      if (error) {
        setDoctors([]);
        toast.error(error.message || (isArabic ? "تعذر تحميل الأطباء المؤهلين" : "Unable to load eligible doctors"));
        return;
      }
      const eligible = (data ?? []) as Doctor[];
      setDoctors(eligible);
      if (doctorId && !eligible.some((doctor) => doctor.id === doctorId)) setDoctorId("");
    })();
    return () => { cancelled = true; };
  }, [branchId, serviceId, service?.source]);

  useEffect(() => {
    let cancelled = false;
    const loadSlots = async () => {
      if (!branchId || !serviceId || !date) {
        setSlots([]);
        return;
      }
      if (!tenantId) {
        setSlots([]);
        setSlotsLoading(false);
        return;
      }
      setSlotsLoading(true);
      setSelectedSlot(null);
      const { data, error } = await publicRpc<Slot[]>("public_booking_slots_for_tenant", {
        p_tenant_id: tenantId,
        p_branch_id: branchId,
        p_service_id: serviceId,
        p_date: date,
        p_doctor_id: doctorId || null,
      });
      if (cancelled) return;
      if (error) {
        setSlots([]);
        toast.error(error.message || (isArabicRef.current ? "تعذر تحميل المواعيد المتاحة" : "Unable to load available times"));
      } else {
        setSlots((data ?? []).filter((slot) => slot.available));
      }
      setSlotsLoading(false);
    };
    void loadSlots();
    return () => { cancelled = true; };
  }, [tenantId, branchId, serviceId, doctorId, date]);

  // A slot is ephemeral; if it disappears while the user is on the details
  // step, return to the time picker instead of rendering a null slot.
  useEffect(() => {
    if (step === 3 && !selectedSlot) setStep(2);
  }, [step, selectedSlot]);

  const minDate = localDateInputValue(new Date(Date.now() + 86_400_000));
  const maxDate = useMemo(() => {
    const days = branch?.max_future_booking_days ?? 30;
    const max = new Date();
    max.setDate(max.getDate() + days);
    return localDateInputValue(max);
  }, [branch]);

  const dateHelp = useMemo(() => {
    if (!date) return "";
    const day = new Date(`${date}T12:00:00`).getDay();
    if (branch?.working_days?.length && !branch.working_days.includes(day)) {
      return isArabic ? "هذا الفرع مغلق في اليوم المختار" : "This branch is closed on the selected day";
    }
    return WEEKDAY_NAMES[lang][day];
  }, [branch, date, isArabic, lang]);

  const setField = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const continueToTime = () => {
    if (!branchId || !serviceId) {
      toast.error(isArabic ? "اختر الفرع والخدمة أولاً" : "Choose a branch and service first");
      return;
    }
    setStep(2);
  };

  const continueToDetails = () => {
    if (!selectedSlot) {
      toast.error(isArabic ? "اختر وقت الموعد أولاً" : "Choose an appointment time first");
      return;
    }
    setStep(3);
  };

  const submitBooking = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSlot || !branchId || !serviceId) return;
    if (!form.fullName.trim() || !form.phone.trim()) {
      toast.error(isArabic ? "اكتب الاسم ورقم الهاتف" : "Enter your name and phone number");
      return;
    }
    setSubmitting(true);
    const params = new URLSearchParams(window.location.search);
    if (!tenantId) return;
    const { data, error } = await publicRpc<BookingResult>("public_create_booking_for_tenant", {
      p_tenant_id: tenantId,
      p_branch_id: branchId,
      p_service_id: serviceId,
      p_slot_start: selectedSlot.slot_start,
      p_full_name: form.fullName.trim(),
      p_phone: form.phone.trim(),
      p_doctor_id: doctorId || null,
      p_email: form.email.trim() || null,
      p_complaint: form.complaint.trim() || null,
      p_source: params.get("utm_source") || "public_booking",
      p_metadata: {
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        landing_path: window.location.pathname,
      },
    });
    setSubmitting(false);
    if (error) {
      const message = String(error.message || "");
      const friendly = message.includes("slot_unavailable")
        ? (isArabic ? "هذا الموعد حُجز للتو. اختر وقتًا آخر." : "This time was just booked. Please choose another time.")
        : message.includes("invalid_phone")
          ? (isArabic ? "اكتب رقم هاتف صحيحًا." : "Enter a valid phone number.")
          : (isArabic ? "تعذر إتمام الحجز. حاول مرة أخرى." : "We could not complete the booking. Please try again.");
      toast.error(friendly);
      if (message.includes("slot_unavailable")) {
        setStep(2);
        setSelectedSlot(null);
      }
      return;
    }
    if (data) setResult(data);
  };

  if (result) {
    const statusText = result.status === "confirmed"
      ? (isArabic ? "تم تأكيد الموعد" : "Appointment confirmed")
      : (isArabic ? "تم استلام طلب الحجز" : "Booking request received");
    return (
      <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-8" dir={isArabic ? "rtl" : "ltr"}>
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
          <Card className="w-full overflow-hidden border-primary/20 shadow-xl">
            <div className="bg-primary px-6 py-8 text-primary-foreground">
              <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-primary-foreground/15">
                <Check className="size-8" />
              </div>
                  <p className="text-sm opacity-80">{tenantName}</p>
              <h1 className="mt-1 text-2xl font-bold">{statusText}</h1>
            </div>
            <div className="space-y-5 p-6">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
                <p className="text-sm text-muted-foreground">{isArabic ? "رقم الحجز" : "Booking reference"}</p>
                <p className="mt-1 text-3xl font-black tracking-widest text-primary">{result.booking_reference}</p>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3"><CalendarDays className="size-4 text-primary" /><span>{formatBookingDate(result.scheduled_at, lang)}</span></div>
                <div className="flex items-center gap-3"><Clock3 className="size-4 text-primary" /><span>{formatSlot(result.scheduled_at, lang)}</span></div>
                <div className="flex items-center gap-3"><MapPin className="size-4 text-primary" /><span>{displayName({ name_en: result.branch_name_en, name_ar: result.branch_name_ar }, lang)}</span></div>
                <div className="flex items-center gap-3"><ShieldCheck className="size-4 text-primary" /><span>{displayName({ name_en: result.service_name_en, name_ar: result.service_name_ar }, lang)}</span></div>
              </div>
              <p className="rounded-xl bg-muted/60 p-4 text-sm leading-6 text-muted-foreground">
                {result.status === "confirmed"
                  ? (isArabic ? "احتفظ برقم الحجز. سيصلك تذكير قبل الموعد حسب إعدادات العيادة." : "Keep your booking reference. You will receive a reminder according to the clinic settings.")
                  : (isArabic ? "سيقوم فريق الاستقبال بمراجعة الطلب والتواصل معك لتأكيد الموعد." : "Our reception team will review the request and contact you to confirm the appointment.")}
              </p>
              <Button className="w-full" variant="outline" onClick={() => window.location.reload()}>
                {isArabic ? "حجز موعد آخر" : "Book another appointment"}
              </Button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.15),transparent_36%),linear-gradient(180deg,hsl(var(--muted)/0.45),hsl(var(--background)))] px-4 py-6 md:px-8 md:py-10" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1 text-xs font-semibold text-primary shadow-sm">
              <ShieldCheck className="size-3.5" />
              {isArabic ? "حجز آمن ومباشر" : "Secure direct booking"}
            </div>
            <p className="text-sm font-semibold text-primary">{tenantName}</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight md:text-5xl">
              {isArabic ? "احجز موعدك بسهولة" : "Book your appointment"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              {isArabic ? "اختر الفرع والخدمة والوقت المناسب، وسيتولى فريقنا باقي الخطوات." : "Choose your branch, service, and preferred time. Our team will take care of the rest."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLang(isArabic ? "en" : "ar")} className="shrink-0 gap-2">
            <Globe2 className="size-4" />{isArabic ? "English" : "العربية"}
          </Button>
        </header>

        {optionsError ? (
          <Card className="mb-6 border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            {optionsError}
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="overflow-hidden border-primary/10 shadow-lg">
            <div className="flex items-center gap-2 border-b bg-background/80 px-5 py-4 text-sm font-semibold">
              <span className={cn("flex size-8 items-center justify-center rounded-full", step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted")}>1</span>
              <span className={step >= 1 ? "text-foreground" : "text-muted-foreground"}>{isArabic ? "الفرع والخدمة" : "Branch & service"}</span>
              <span className="mx-1 text-muted-foreground">/</span>
              <span className={cn("flex size-8 items-center justify-center rounded-full", step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted")}>2</span>
              <span className={step >= 2 ? "text-foreground" : "text-muted-foreground"}>{isArabic ? "الوقت" : "Time"}</span>
              <span className="mx-1 text-muted-foreground">/</span>
              <span className={cn("flex size-8 items-center justify-center rounded-full", step >= 3 ? "bg-primary text-primary-foreground" : "bg-muted")}>3</span>
              <span className={step >= 3 ? "text-foreground" : "text-muted-foreground"}>{isArabic ? "بياناتك" : "Your details"}</span>
            </div>

            <div className="space-y-6 p-5 md:p-7">
              {loadingOptions ? (
                <div className="space-y-4 py-10 text-center text-sm text-muted-foreground">{isArabic ? "جارٍ تحميل خيارات الحجز…" : "Loading booking options…"}</div>
              ) : (
                <>
                  {step === 1 ? (
                    <section className="space-y-5" aria-labelledby="booking-step-one">
                      <div>
                        <h2 id="booking-step-one" className="text-xl font-bold">{isArabic ? "ابدأ باختيار احتياجك" : "Start with your care preference"}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{isArabic ? "الخانات المتاحة ستظهر بعد اختيار التاريخ." : "Available times will appear after you select a date."}</p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="booking-branch">{isArabic ? "الفرع" : "Branch"}</Label>
                          <select id="booking-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring">
                            <option value="">{isArabic ? "اختر الفرع" : "Choose branch"}</option>
                            {branches.map((item) => <option key={item.id} value={item.id}>{displayName(item, lang)}</option>)}
                          </select>
                          {branch?.address ? <p className="flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="mt-0.5 size-3 shrink-0" />{branch.address}</p> : null}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="booking-service">{isArabic ? "الخدمة" : "Service"}</Label>
                          <select id="booking-service" value={serviceId} onChange={(event) => setServiceId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring">
                            <option value="">{isArabic ? "اختر الخدمة" : "Choose service"}</option>
                            {services.map((item) => <option key={`${item.source}-${item.id}`} value={item.id}>{displayName(item, lang)} · {item.duration_minutes} {isArabic ? "دقيقة" : "min"}</option>)}
                          </select>
                          {!services.length ? <p className="text-xs text-amber-600">{isArabic ? "لم تُضف خدمات للحجز الإلكتروني بعد." : "No online services are configured yet."}</p> : null}
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="booking-doctor">{isArabic ? "الطبيب (اختياري)" : "Doctor (optional)"}</Label>
                          <select id="booking-doctor" value={doctorId} onChange={(event) => setDoctorId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring">
                            <option value="">{isArabic ? "أي طبيب متاح" : "Any available doctor"}</option>
                            {doctors.map((item) => <option key={item.id} value={item.id}>{doctorName(item, lang)}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="booking-date">{isArabic ? "التاريخ" : "Date"}</Label>
                          <Input id="booking-date" type="date" min={minDate} max={maxDate} value={date} onChange={(event) => setDate(event.target.value)} />
                          <p className="text-xs text-muted-foreground">{dateHelp || (isArabic ? "اختر يومًا مناسبًا" : "Choose a suitable day")}</p>
                        </div>
                      </div>
                      <Button className="w-full" onClick={continueToTime} disabled={!branchId || !serviceId}>{isArabic ? "عرض المواعيد المتاحة" : "Show available times"}</Button>
                    </section>
                  ) : null}

                  {step === 2 ? (
                    <section className="space-y-5" aria-labelledby="booking-step-two">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 id="booking-step-two" className="text-xl font-bold">{isArabic ? "اختر الوقت المناسب" : "Choose a convenient time"}</h2>
                          <p className="mt-1 text-sm text-muted-foreground">{dateHelp} · {displayName(branch ?? {}, lang)} · {displayName(service ?? {}, lang)}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="gap-1"><ChevronLeft className="size-4 rtl:rotate-180" />{isArabic ? "تعديل" : "Edit"}</Button>
                      </div>
                      {slotsLoading ? <div className="py-10 text-center text-sm text-muted-foreground">{isArabic ? "جارٍ البحث عن المواعيد…" : "Finding available times…"}</div> : null}
                      {!slotsLoading && !slots.length ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{isArabic ? "لا توجد مواعيد متاحة لهذا اليوم. اختر تاريخًا آخر." : "No available times for this day. Please choose another date."}</div> : null}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {slots.map((slot) => <button type="button" key={slot.slot_start} onClick={() => setSelectedSlot(slot)} className={cn("rounded-xl border px-3 py-3 text-sm font-semibold transition-colors", selectedSlot?.slot_start === slot.slot_start ? "border-primary bg-primary text-primary-foreground shadow-md" : "bg-background hover:border-primary hover:bg-primary/5")}>{formatSlot(slot.slot_start, lang)}</button>)}
                      </div>
                      <Button className="w-full" onClick={continueToDetails} disabled={!selectedSlot}>{isArabic ? "متابعة البيانات" : "Continue with details"}</Button>
                    </section>
                  ) : null}

                  {step === 3 && selectedSlot ? (
                    <form className="space-y-5" onSubmit={submitBooking} aria-labelledby="booking-step-three">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 id="booking-step-three" className="text-xl font-bold">{isArabic ? "أكمل بيانات الحجز" : "Complete your booking"}</h2>
                          <p className="mt-1 text-sm text-muted-foreground">{formatBookingDate(selectedSlot!.slot_start, lang)} · {formatSlot(selectedSlot!.slot_start, lang)}</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setStep(2)} className="gap-1"><ChevronLeft className="size-4 rtl:rotate-180" />{isArabic ? "رجوع" : "Back"}</Button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2"><Label htmlFor="booking-name">{isArabic ? "الاسم بالكامل" : "Full name"}</Label><div className="relative"><UserRound className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground" /><Input id="booking-name" className="ps-9" value={form.fullName} onChange={(event) => setField("fullName", event.target.value)} autoComplete="name" required /></div></div>
                        <div className="space-y-2"><Label htmlFor="booking-phone">{isArabic ? "رقم الهاتف" : "Mobile number"}</Label><div className="relative"><Phone className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground" /><Input id="booking-phone" className="ps-9" value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="01xxxxxxxxx" autoComplete="tel" inputMode="tel" required /></div></div>
                      </div>
                      <div className="space-y-2"><Label htmlFor="booking-email">{isArabic ? "البريد الإلكتروني (اختياري)" : "Email (optional)"}</Label><Input id="booking-email" type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} autoComplete="email" /></div>
                      <div className="space-y-2"><Label htmlFor="booking-complaint">{isArabic ? "سبب الزيارة باختصار (اختياري)" : "Short reason for visit (optional)"}</Label><Textarea id="booking-complaint" value={form.complaint} onChange={(event) => setField("complaint", event.target.value)} rows={3} /></div>
                      <div className="rounded-xl bg-muted/60 p-4 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mb-1 inline-block size-4 text-primary" /> {isArabic ? "نستخدم بياناتك لتنسيق الموعد والتواصل بشأنه فقط." : "We use your details only to coordinate and communicate about this appointment."}</div>
                      <Button type="submit" className="w-full" disabled={submitting}>{submitting ? (isArabic ? "جارٍ تأكيد الحجز…" : "Confirming booking…") : (isArabic ? "تأكيد الحجز" : "Confirm booking")}</Button>
                    </form>
                  ) : null}
                </>
              )}
            </div>
          </Card>

          <aside className="space-y-4">
            <Card className="border-primary/10 bg-background/85 p-5 shadow-lg">
              <div className="mb-4 flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="size-5" /></div><div><h2 className="font-bold">{isArabic ? "ملخص الحجز" : "Booking summary"}</h2><p className="text-xs text-muted-foreground">{isArabic ? "سيظهر هنا بعد الاختيار" : "Updates as you choose"}</p></div></div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">{isArabic ? "الفرع" : "Branch"}</span><span className="text-end font-medium">{branch ? displayName(branch, lang) : "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">{isArabic ? "الخدمة" : "Service"}</span><span className="text-end font-medium">{service ? displayName(service, lang) : "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">{isArabic ? "التاريخ" : "Date"}</span><span className="text-end font-medium">{date ? new Date(`${date}T12:00:00`).toLocaleDateString(isArabic ? "ar-EG" : "en-EG") : "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">{isArabic ? "الوقت" : "Time"}</span><span className="text-end font-medium">{selectedSlot ? formatSlot(selectedSlot.slot_start, lang) : "—"}</span></div>
              </div>
            </Card>
            <Card className="border-primary/10 bg-primary/5 p-5">
              <h2 className="font-bold">{isArabic ? "قبل الحجز" : "Before you book"}</h2>
              <ul className="mt-3 space-y-3 text-sm leading-5 text-muted-foreground">
                <li className="flex gap-2"><Clock3 className="mt-0.5 size-4 shrink-0 text-primary" />{isArabic ? "احضر قبل الموعد بعشر دقائق." : "Please arrive 10 minutes before your appointment."}</li>
                <li className="flex gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-primary" />{isArabic ? "قد يتواصل معك الاستقبال لتأكيد بعض التفاصيل." : "Reception may contact you to confirm details."}</li>
                <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />{isArabic ? "لا نطلب بيانات طبية حساسة في نموذج الحجز." : "We do not request sensitive medical information in this form."}</li>
              </ul>
            </Card>
          </aside>
        </div>
        <footer className="mt-8 text-center text-xs text-muted-foreground">{isArabic ? `${tenantName} · حجز المواعيد` : `${tenantName} · Appointment booking`}</footer>
      </div>
    </main>
  );
}
