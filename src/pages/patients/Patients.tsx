import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { useDataSync } from "@/lib/dataSync";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Phone, Mail, MapPin, MoreHorizontal, Calendar as CalendarIcon, FileText, Eye, Trash2, UserRound, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { Can } from "@/components/Can";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { ListSkeleton } from "@/components/ListSkeleton";
import { Fab } from "@/components/ui/fab";
import { ReferrerPicker } from "./ReferrerPicker";
import { PullToRefresh } from "@/components/PullToRefresh";
import { TablePager } from "@/components/TablePager";
import { CreateInvoiceDialog } from "../invoices/CreateInvoiceDialog";
import { containsArabicScript, patientDisplayDirection, patientDisplayName } from "@/lib/patientName";
import { sanitizeSearch } from "@/lib/sanitizeSearch";

const PAGE_SIZE = 50;

type Patient = {
  id: string;
  patient_code: number;
  first_name_en: string;
  last_name_en: string | null;
  first_name_ar: string | null;
  last_name_ar: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  gender: "male" | "female" | null;
  city: string | null;
  address: string | null;
  dob: string | null;
  blood_type: string | null;
  notes: string | null;
  branch_id: string | null;
  created_at: string;
  name_language: "ar" | "en" | null;
  whatsapp_opt_in: boolean;
};

type PortalCredentials = {
  patientId: string;
  email: string;
  username: string;
  password: string;
  patientName: string;
  patientNameAr: string;
};

type PortalTemplate = {
  body_en: string;
  body_ar: string;
  subject_en?: string;
  subject_ar?: string;
  meta_template_name?: string | null;
  meta_template_language?: string | null;
};

const schema = z.object({
  name_en: z.string().trim().max(160).optional(),
  name_ar: z.string().trim().max(160).optional(),
  phone: z.string().trim().min(1, "Phone is required").max(30),
  phone2: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  dob: z.string().optional(),
  // Empty Select values must be normalized before validation; the database accepts NULL.
  gender: z.preprocess((value) => value === "" ? undefined : value, z.enum(["male", "female"]).optional()),
  blood_type: z.string().trim().max(10).optional(),
  address: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(1000).optional(),
}).refine((value) => Boolean(value.name_en?.trim() || value.name_ar?.trim()), {
  path: ["name_en"],
  message: "Name is required",
});

export default function PatientsPage() {
  const { t, lang } = useI18n();
  const { currentBranchId, branchSelectionReady } = useBranch();
  const navigate = useNavigate();
  // R2: canonical authorization entry point.
  const { authz } = useAuthorization("Patients");
  const [items, setItems] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q.trim());
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Patient | null>(null);
  const [duesByPatient, setDuesByPatient] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [invoiceForPatient, setInvoiceForPatient] = useState<string | null>(null);
  const [autoCreatePortalCredentials, setAutoCreatePortalCredentials] = useState(false);
  const [portalCredentials, setPortalCredentials] = useState<PortalCredentials | null>(null);
  const [portalTemplates, setPortalTemplates] = useState<Record<"email" | "sms" | "whatsapp", PortalTemplate | null>>({ email: null, sms: null, whatsapp: null });
  const [portalSupportContact, setPortalSupportContact] = useState("");
  const [sendingPortalChannel, setSendingPortalChannel] = useState<"email" | "whatsapp" | null>(null);

  const [form, setForm] = useState({
    name_en: "", name_ar: "", phone: "", phone2: "", email: "",
    dob: "", gender: "" as "" | "male" | "female", whatsapp_opt_in: false,
    blood_type: "", address: "", notes: "",
    referred_by_patient_id: null as string | null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    if (!branchSelectionReady || !currentBranchId) {
      setItems([]);
      setTotal(0);
      setDuesByPatient({});
      setLoading(false);
      return;
    }
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    // RBAC-11 / UX fix: sort by patient_code (a guaranteed strictly-
    // increasing, never-reused sequence assigned by tg_patient_assign_code)
    // instead of created_at. Previously the list was ordered by created_at,
    // which does not always correspond to the visible "#N" numbering shown
    // per row (e.g. batches of older records inserted later than newer-
    // numbered ones) -- so a user scanning the numbered list saw the
    // numbers jump around non-sequentially. patient_code descending gives
    // the same "most recently registered first" ordering intent while
    // guaranteeing the visible numbers are always in consistent order.
    let query = supabase.from("patients")
      .select("id,patient_code,first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,phone,phone2,email,gender,city,address,dob,blood_type,notes,branch_id,created_at,whatsapp_opt_in", { count: "exact" })
      .is("deleted_at", null)
      .eq("branch_id", currentBranchId);

    const searchTerm = sanitizeSearch(deferredQ);
    if (searchTerm) {
      const filters = [
        `first_name_en.ilike.%${searchTerm}%`,
        `last_name_en.ilike.%${searchTerm}%`,
        `first_name_ar.ilike.%${searchTerm}%`,
        `last_name_ar.ilike.%${searchTerm}%`,
        `phone.ilike.%${searchTerm}%`,
        `phone2.ilike.%${searchTerm}%`,
        `email.ilike.%${searchTerm}%`,
      ];
      if (/^\d+$/.test(searchTerm)) filters.push(`patient_code.eq.${searchTerm}`);
      query = query.or(filters.join(","));
    }

    query = query.order("patient_code", { ascending: false }).range(from, to);
    const { data, error, count } = await query;
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Patient[]);
        setTotal(count ?? 0);
  }, [branchSelectionReady, currentBranchId, deferredQ, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(0); }, [currentBranchId, deferredQ]);
  useDataSync(["patients"], () => { void load(); });

  // Lightweight batched outstanding-debt badge: a single query for the visible
  // patients, no per-row work, no joins.
  useEffect(() => {
    if (!branchSelectionReady || !currentBranchId || !items.length) { setDuesByPatient({}); return; }
    let active = true;
    const ids = items.map((p) => p.id);
    (async () => {
      const q = supabase
        .from("invoices")
        .select("patient_id,total,paid_amount,status,deleted_at")
        .in("patient_id", ids)
        .eq("branch_id", currentBranchId)
        .is("deleted_at", null)
        .in("status", ["pending", "partial"]);
      const { data } = await q;
      if (!active) return;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ patient_id: string; total: number | null; paid_amount: number | null }>) {
        const due = Number(r.total || 0) - Number(r.paid_amount || 0);
        if (due > 0.009) map[r.patient_id] = (map[r.patient_id] ?? 0) + due;
      }
      setDuesByPatient(map);
    })();
    return () => { active = false; };
  }, [branchSelectionReady, currentBranchId, items]);

  useEffect(() => {
    if (!portalCredentials || !currentBranchId) {
      setPortalTemplates({ email: null, sms: null, whatsapp: null });
      setPortalSupportContact("");
      return;
    }
    let active = true;
    void (async () => {
      const [emailResult, smsResult, whatsappResult, settingsResult] = await Promise.all([
        (supabase as any).from("email_templates").select("body_en,body_ar,subject_en,subject_ar").eq("template_key", "patient_portal_credentials").eq("is_active", true).maybeSingle(),
        (supabase as any).from("sms_templates").select("body_en,body_ar").eq("template_key", "patient_portal_credentials").eq("is_active", true).maybeSingle(),
        (supabase as any).from("whatsapp_templates").select("body_en,body_ar,meta_template_name,meta_template_language").eq("template_key", "patient_portal_credentials").eq("is_active", true).maybeSingle(),
        supabase.from("patient_portal_settings").select("support_email,support_phone").eq("branch_id", currentBranchId).maybeSingle(),
      ]);
      if (!active) return;
      const settings = settingsResult.data as { support_email?: string | null; support_phone?: string | null } | null;
      setPortalTemplates({
        email: (emailResult.data as PortalTemplate | null) ?? null,
        sms: (smsResult.data as PortalTemplate | null) ?? null,
        whatsapp: (whatsappResult.data as PortalTemplate | null) ?? null,
      });
      setPortalSupportContact([settings?.support_email, settings?.support_phone].filter(Boolean).join(" / "));
    })();
    return () => { active = false; };
  }, [portalCredentials, currentBranchId]);

  const portalTemplateValues = portalCredentials ? {
    patient_name: portalCredentials.patientName || portalCredentials.patientNameAr,
    patient_name_ar: portalCredentials.patientNameAr || portalCredentials.patientName,
    patient_portal_username: portalCredentials.username,
    patient_portal_password: portalCredentials.password,
    patient_portal_url: `${window.location.origin}/patient-portal/login`,
    support_contact: portalSupportContact || (lang === "ar" ? "تواصل مع العيادة" : "Contact the clinic"),
  } : null;

  const renderPortalTemplate = (body: string) => body.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, key: string) => String(portalTemplateValues?.[key as keyof NonNullable<typeof portalTemplateValues>] ?? ""));

  const copyPortalMessage = async (kind: "email" | "sms" | "whatsapp") => {
    const template = portalTemplates[kind];
    if (!template || !portalTemplateValues) {
      toast.error(lang === "ar" ? "القالب غير متاح؛ طبّق migration القوالب أولًا." : "Template is unavailable; apply the template migration first.");
      return;
    }
    const subject = kind === "email" ? `${lang === "ar" ? "الموضوع: " : "Subject: "}${renderPortalTemplate(lang === "ar" ? (template.subject_ar ?? "") : (template.subject_en ?? ""))}` : "";
    const body = renderPortalTemplate(lang === "ar" ? template.body_ar : template.body_en);
    await navigator.clipboard.writeText([subject, body].filter(Boolean).join("\n\n"));
    toast.success(lang === "ar" ? `تم نسخ رسالة ${kind === "email" ? "البريد" : kind === "sms" ? "SMS" : "WhatsApp"}` : `${kind.toUpperCase()} message copied`);
  };

  const sendPortalMessage = async (channel: "email" | "whatsapp") => {
    if (!portalCredentials) return;
    const warning = channel === "whatsapp"
      ? (lang === "ar" ? "سيتم إرسال كلمة المرور المؤقتة عبر قالب WhatsApp معتمد. تأكد من موافقة المريض قبل المتابعة." : "The temporary password will be sent through an approved WhatsApp template. Confirm patient consent before continuing.")
      : (lang === "ar" ? "سيتم إرسال كلمة المرور المؤقتة إلى البريد الإلكتروني المسجل للمريض." : "The temporary password will be sent to the patient’s registered email.");
    if (!window.confirm(warning)) return;
    setSendingPortalChannel(channel);
    const template = portalTemplates.whatsapp;
    const { data: result, error } = await supabase.functions.invoke("send-patient-portal-message", {
      body: {
        patient_id: portalCredentials.patientId,
        channel,
        username: portalCredentials.username,
        temporary_password: portalCredentials.password,
        language: lang,
        ...(channel === "whatsapp" ? { template_name: template?.meta_template_name ?? "", template_language: template?.meta_template_language ?? (lang === "ar" ? "ar" : "en_US") } : {}),
      },
    });
    setSendingPortalChannel(null);
    if (error || result?.error) {
      toast.error(result?.error ?? error?.message ?? (lang === "ar" ? "تعذر إرسال الرسالة" : "Message could not be sent"));
      return;
    }
    toast.success(lang === "ar" ? "تم قبول الرسالة للإرسال" : "Message accepted for delivery");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Please check the form"); return; }
    const d = parsed.data;
    if (autoCreatePortalCredentials && !d.email) {
      toast.error(lang === "ar" ? "أدخل البريد الإلكتروني لتوليد بيانات دخول المريض" : "Enter an email to generate patient portal credentials");
      return;
    }
    const payload = {
      first_name_en: d.name_en?.trim() || d.name_ar?.trim() || "",
      last_name_en: null,
      first_name_ar: d.name_ar?.trim() || d.name_en?.trim() || "",
      last_name_ar: null,
      name_language: containsArabicScript(d.name_ar?.trim() || d.name_en?.trim() || "") ? "ar" : "en",
      phone: d.phone,
      phone2: d.phone2 || null,
      email: d.email || null,
      dob: d.dob || null,
      gender: d.gender || null,
      blood_type: d.blood_type || null,
      address: d.address || null,
      notes: d.notes || null,
      branch_id: currentBranchId,
      referred_by_patient_id: form.referred_by_patient_id || null,
      whatsapp_opt_in: form.whatsapp_opt_in,
      whatsapp_opt_in_at: form.whatsapp_opt_in ? new Date().toISOString() : null,
      whatsapp_opt_in_source: form.whatsapp_opt_in ? "clinic_staff" : null,
    };
    const { data: createdPatient, error } = await supabase.from("patients").insert(payload).select("id").single();
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تمت إضافة المريض" : "Patient added");
    if (createdPatient?.id && d.email) {
      const { data: portalResult, error: portalError } = await supabase.functions.invoke("patient-portal-invite", { body: { patient_id: createdPatient.id, auto_credentials: autoCreatePortalCredentials } });
      if (portalError || portalResult?.error) {
        toast.warning(lang === "ar" ? "تم إنشاء المريض، لكن تعذر إرسال دعوة البوابة. يمكنك إعادة المحاولة من ملف المريض." : "Patient created, but the portal invitation could not be sent. You can retry from the patient profile.");
      } else if (portalResult?.credentials) {
        setPortalCredentials({
          ...portalResult.credentials,
          patientId: createdPatient.id,
          patientName: d.name_en?.trim() || d.name_ar?.trim() || "",
          patientNameAr: d.name_ar?.trim() || d.name_en?.trim() || "",
        });
        toast.success(lang === "ar" ? "تم إنشاء بيانات الدخول المؤقتة" : "Temporary portal credentials created");
      } else {
        toast.success(lang === "ar" ? "تم إرسال دعوة بوابة المريض إلى البريد الإلكتروني" : "Patient portal invitation sent by email");
      }
    }
    setOpen(false);
    setAutoCreatePortalCredentials(false);
    setForm({ name_en: "", name_ar: "", phone: "", phone2: "", email: "", dob: "", gender: "", whatsapp_opt_in: false, blood_type: "", address: "", notes: "", referred_by_patient_id: null });
    load();
  };

  const handleDelete = async (p: Patient) => {
    const { error } = await supabase.from("patients").update({ deleted_at: new Date().toISOString() }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حذف المريض" : "Patient deleted");
    setConfirmDel(null);
    load();
  };

  const filtered = items;

  return (
    <PullToRefresh onRefresh={load}>
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("patients")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} {t("patients").toLowerCase()}</p>
        </div>
        <div className="flex gap-2 items-center w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9" />
          </div>
          <Can permission="patients.create">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  className="gradient-primary text-primary-foreground min-h-11"
                  aria-label={t("addPatient")}
                >
                  <Plus className="me-2 size-4" />
                  <span className="hidden xs:inline sm:inline">{t("addPatient")}</span>
                  <span className="sm:hidden">{t("addPatient")}</span>
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("newPatient")}</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "الاسم بالإنجليزية" : "Name in English"}</Label>
                  <Input dir="ltr" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} maxLength={160} placeholder="Mohamed Ibrahim" />
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "الاسم بالعربية" : "Name in Arabic"}</Label>
                  <Input dir="rtl" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} maxLength={160} placeholder="محمد إبراهيم" />
                </div>
                <p className="sm:col-span-2 text-xs text-muted-foreground -mt-2">{lang === "ar" ? "أدخل اسمًا واحدًا على الأقل؛ ويمكنك تعبئة الاسمين معًا." : "Enter at least one name; you may provide both languages."}</p>
                <div className="space-y-2">
                  <Label>{t("phone")} *</Label>
                  <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="+20..." maxLength={30} />
                </div>
                <div className="space-y-2">
                  <Label>{t("phone2")}</Label>
                  <Input dir="ltr" value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} maxLength={30} />
                </div>
                <div className="space-y-2">
                  <Label>{t("email")}</Label>
                  <Input dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div>
                    <Label>{lang === "ar" ? "إنشاء دخول بوابة المريض تلقائيًا" : "Create patient portal login automatically"}</Label>
                    <p className="text-xs text-muted-foreground mt-1">{lang === "ar" ? "يتطلب بريدًا إلكترونيًا. سيتم توليد Username وكلمة مرور مؤقتة تظهر مرة واحدة بعد الحفظ." : "Requires an email. A username and temporary password will be generated and shown once after saving."}</p>
                  </div>
                  <Switch checked={autoCreatePortalCredentials} onCheckedChange={setAutoCreatePortalCredentials} disabled={!form.email.trim()} />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>{lang === "ar" ? "موافقة رسائل WhatsApp" : "WhatsApp messaging consent"}</Label>
                    <p className="text-xs text-muted-foreground mt-1">{lang === "ar" ? "لا تُرسل الرسائل التلقائية إلا بعد موافقة المريض." : "Automated messages are sent only after the patient opts in."}</p>
                  </div>
                  <Switch checked={form.whatsapp_opt_in} onCheckedChange={(v) => setForm({ ...form, whatsapp_opt_in: v })} />
                </div>
                <div className="space-y-2">
                  <Label>{t("dob")}</Label>
                  <Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t("gender")}</Label>
                  <Select value={form.gender || "none"} onValueChange={(v) => setForm({ ...form, gender: v === "none" ? "" : v as "male" | "female" })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— {t("none")} —</SelectItem>
                      <SelectItem value="male">{t("male")}</SelectItem>
                      <SelectItem value="female">{t("female")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("bloodType")}</Label>
                  <Select value={form.blood_type} onValueChange={(v) => setForm({ ...form, blood_type: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("address")}</Label>
                  <Input dir="auto" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={255} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("referredByPatient")}</Label>
                  <ReferrerPicker
                    value={form.referred_by_patient_id}
                    onChange={(v) => setForm({ ...form, referred_by_patient_id: v })}
                    branchId={currentBranchId}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("notes")}</Label>
                  <Textarea dir="auto" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={1000} />
                </div>
                <DialogFooter className="sm:col-span-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                  <Button type="submit" className="gradient-primary text-primary-foreground">{t("save")}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
            </Dialog>
          </Can>
        </div>
      </div>

      <Card className="shadow-card overflow-hidden">
        {loading ? (
          <ListSkeleton rows={8} />
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noPatients")}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">{lang === "ar" ? "المريض" : "Patient"}</TableHead>
                  <TableHead className="hidden md:table-cell">{lang === "ar" ? "التواصل" : "Contact"}</TableHead>
                  <TableHead className="hidden lg:table-cell">{lang === "ar" ? "الحالة المالية" : "Financial Status"}</TableHead>
                  <TableHead className="w-[60px] text-end"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const name = patientDisplayName(p, lang);
                  const nameDir = patientDisplayDirection(p, lang);
                  const due = duesByPatient[p.id] ?? 0;
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/40">
                      <TableCell className="min-w-0 p-2 sm:p-3">
                        <Link to={`/patients/${p.id}`} className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <div aria-hidden="true" className="size-9 sm:size-10 rounded-full gradient-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">
                            <UserRound className="size-4 sm:size-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                              <span dir={nameDir} className="font-semibold truncate text-sm sm:text-[15px]">{name}</span>
                              <Badge variant="outline" className="text-[10px] leading-4 px-1.5 shrink-0">#{p.patient_code}</Badge>
                            </div>
                            <div className="md:hidden text-xs text-muted-foreground truncate mt-0.5">
                              {p.phone || p.email || "—"}
                            </div>
                            {due > 0 && <Badge className="md:hidden mt-1 text-[10px] leading-4 px-1.5 bg-destructive/10 text-destructive border border-destructive/30 tabular-nums">
                              {lang === "ar" ? "متبقي" : "Due"} {due.toFixed(2)}
                            </Badge>}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell align-middle">
                        <div className="text-[13px] text-muted-foreground flex flex-col gap-0.5 min-w-0">
                          {p.phone && <span className="flex items-center gap-1.5 truncate"><Phone className="size-3 shrink-0" />{p.phone}</span>}
                          {p.email && <span className="flex items-center gap-1.5 truncate"><Mail className="size-3 shrink-0" />{p.email}</span>}
                          {p.city && <span className="flex items-center gap-1.5 truncate"><MapPin className="size-3 shrink-0" />{p.city}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell align-middle">
                        {due > 0 ? (
                          <Badge className="bg-destructive/10 text-destructive border border-destructive/30 tabular-nums hover:bg-destructive/15">
                            {lang === "ar" ? "متبقي" : "Due"} {due.toFixed(2)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            {lang === "ar" ? "مسدد" : "Cleared"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-end align-middle">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-9" aria-label="Actions">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => navigate(`/patients/${p.id}`)}>
                              <Eye className="size-4 me-2" /> {lang === "ar" ? "عرض الملف" : "View Profile"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/calendar?patient_id=${p.id}`)}>
                              <CalendarIcon className="size-4 me-2" /> {lang === "ar" ? "حجز موعد" : "Book Appointment"}
                            </DropdownMenuItem>
                            {authz.can("invoices.create") && (
                              <DropdownMenuItem onClick={() => setInvoiceForPatient(p.id)}>
                                <FileText className="size-4 me-2" /> {lang === "ar" ? "إنشاء فاتورة" : "Create Invoice"}
                              </DropdownMenuItem>
                            )}
                            {authz.can("patients.delete") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setConfirmDel(p)}
                                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                >
                                  <Trash2 className="size-4 me-2" /> {lang === "ar" ? "حذف" : "Delete"}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <TablePager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </Card>

      <Can permission="patients.create">
        <Fab ariaLabel={t("addPatient")} onClick={() => setOpen(true)}>
          <Plus className="size-6" />
        </Fab>
      </Can>

      <Dialog open={!!portalCredentials} onOpenChange={(o) => !o && setPortalCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "بيانات دخول بوابة المريض" : "Patient portal credentials"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{lang === "ar" ? "هذه البيانات مؤقتة. سلّمها للمريض بطريقة آمنة، واطلب منه تغيير كلمة المرور بعد أول دخول. لن تظهر كلمة المرور مرة أخرى بعد إغلاق هذه النافذة." : "These credentials are temporary. Share them securely and ask the patient to change the password after the first sign-in. The password will not be shown again after closing this dialog."}</p>
            <div className="rounded-md border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">Email</div><div className="font-medium break-all">{portalCredentials?.email}</div></div>
            <div className="rounded-md border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">Username</div><div className="font-medium">{portalCredentials?.username}</div></div>
            <div className="rounded-md border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">Temporary password</div><div className="font-mono font-medium break-all">{portalCredentials?.password}</div></div>
            <Button type="button" variant="outline" className="w-full" onClick={() => portalCredentials && navigator.clipboard.writeText(`Username: ${portalCredentials.username}\nPassword: ${portalCredentials.password}`)}><Copy className="me-2 size-4" />{lang === "ar" ? "نسخ بيانات الدخول" : "Copy credentials"}</Button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => sendPortalMessage("email")} disabled={sendingPortalChannel !== null}><Mail className="me-2 size-4" />{sendingPortalChannel === "email" ? "…" : (lang === "ar" ? "إرسال بالبريد" : "Send by email")}</Button>
              <Button type="button" variant="secondary" onClick={() => sendPortalMessage("whatsapp")} disabled={sendingPortalChannel !== null}><Phone className="me-2 size-4" />{sendingPortalChannel === "whatsapp" ? "…" : (lang === "ar" ? "إرسال WhatsApp" : "Send WhatsApp")}</Button>
            </div>
            <div className="border-t pt-3 space-y-3">
              <div>
                <div className="font-medium">{lang === "ar" ? "قوالب الرسائل الجاهزة" : "Ready-to-copy message templates"}</div>
                <p className="text-xs text-muted-foreground mt-1">{lang === "ar" ? "تتم تعبئة المتغيرات محليًا داخل هذه النافذة فقط. لا يتم الإرسال تلقائيًا ولا تُحفظ كلمة المرور في القالب أو سجل الرسائل." : "Variables are rendered locally in this dialog only. Nothing is sent automatically, and the password is not saved in the template or message log."}</p>
              </div>
              {(["sms", "email", "whatsapp"] as const).map((kind) => {
                const template = portalTemplates[kind];
                const body = template && portalTemplateValues ? renderPortalTemplate(lang === "ar" ? template.body_ar : template.body_en) : "";
                const subject = kind === "email" && template && portalTemplateValues ? renderPortalTemplate(lang === "ar" ? (template.subject_ar ?? "") : (template.subject_en ?? "")) : "";
                return <div key={kind} className="space-y-2 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2"><Label>{kind === "sms" ? "SMS" : kind === "email" ? (lang === "ar" ? "البريد الإلكتروني" : "Email") : "WhatsApp"}</Label><Button type="button" size="sm" variant="outline" onClick={() => copyPortalMessage(kind)} disabled={!template}><Copy className="me-2 size-3.5" />{lang === "ar" ? "نسخ" : "Copy"}</Button></div>
                  {kind === "email" && subject && <div className="text-xs font-medium">{lang === "ar" ? "الموضوع: " : "Subject: "}{subject}</div>}
                  <Textarea readOnly value={body || (lang === "ar" ? "القالب غير متاح حاليًا" : "Template unavailable")} dir={lang === "ar" ? "rtl" : "ltr"} rows={kind === "sms" ? 3 : 6} className="text-xs" />
                </div>;
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "حذف المريض" : "Delete patient"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? "هل أنت متأكد من حذف هذا المريض؟ لا يمكن التراجع عن هذا الإجراء."
                : "Are you sure you want to delete this patient? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && handleDelete(confirmDel)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "ar" ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateInvoiceDialog
        open={!!invoiceForPatient}
        onOpenChange={(o) => !o && setInvoiceForPatient(null)}
        presetPatientId={invoiceForPatient ?? undefined}
        onSaved={() => setInvoiceForPatient(null)}
      />
    </div>
    </PullToRefresh>
  );
}
