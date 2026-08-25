import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ListSkeleton";
import { Activity, ArrowLeft, ExternalLink, Stethoscope, User as UserIcon, MapPin, Clock, ScrollText, Receipt, CheckCircle2, MessageCircle } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreateInvoiceDialog } from "@/pages/invoices/CreateInvoiceDialog";
import { Can } from "@/components/Can";
import { doctorDisplayName } from "@/lib/doctorName";
import { appointmentWhatsAppMessage, openWhatsApp } from "@/lib/whatsapp";

const SAFE_KEYS = ["status", "doctor_id", "room", "priority", "is_walk_in", "checked_in_at", "started_at"];
const QUEUE_ACTIONS = [
  "status_change", "doctor_reassigned", "room_assigned", "walk_in_created", "consultation_opened",
];

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return "—"; }
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

  useEffect(() => {
    if (!appointmentId) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [{ data: a, error: aErr }, { data: l }] = await Promise.all([
        supabase
          .from("appointments")
          .select("id,patient_id,doctor_id,branch_id,room,scheduled_at,status,procedure,service_id,priority,checked_in_at,started_at,is_walk_in,duration_minutes,services(name_en,name_ar),patients(first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code,phone),branches(name_en,name_ar)")
          .eq("id", appointmentId)
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

  if (loading) {
    return <div className="p-4 sm:p-6 space-y-4"><Card className="p-0 overflow-hidden"><ListSkeleton rows={6} /></Card></div>;
  }
  if (!appt) {
    return (
      <div className="p-4 sm:p-6">
        <Card className="p-10 text-center text-muted-foreground">{t("noData")}</Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/queue" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="size-5" /></Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">{t("appointmentDetailTitle")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">{patientName} · {fmt(appt.scheduled_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link to={`/patients/${appt.patient_id}`}><UserIcon className="size-4 me-1" />{t("openChart")}</Link>
          </Button>
          {appt.patients?.phone && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
              onClick={() => {
                const ok = openWhatsApp(
                  appt.patients.phone,
                  appointmentWhatsAppMessage({ patientName, appointmentDate: fmt(appt.scheduled_at), branchName, lang }),
                );
                if (!ok) toast.error(lang === "ar" ? "رقم الهاتف غير صالح" : "Invalid phone number");
              }}
            >
              <MessageCircle className="size-4 me-1" />
              {lang === "ar" ? "رسالة WhatsApp" : "WhatsApp message"}
            </Button>
          )}
          {record && (
            <Button asChild size="sm" className="h-9">
              <Link to={`/medical/consultation/${record.id}`}><Stethoscope className="size-4 me-1" />{t("openConsultation")}</Link>
            </Button>
          )}
          {appt.status === "completed" && !record && (
            <Can permission="medical_records.create">
              <Button
                size="sm"
                className="h-9 gradient-primary text-primary-foreground"
                disabled={starting}
                onClick={async () => {
                  setStarting(true);
                  try {
                    const { data, error } = await supabase
                      .from("medical_records")
                      .insert({
                        patient_id: appt.patient_id,
                        appointment_id: appt.id,
                        branch_id: appt.branch_id,
                        doctor_id: appt.doctor_id ?? user?.id ?? null,
                        visit_date: new Date().toISOString().slice(0, 10),
                        visit_type: "consultation",
                        status: "draft",
                        created_by: user?.id ?? null,
                      } as any)
                      .select("id")
                      .single();
                    if (error) throw error;
                    nav(`/medical/records/${data.id}`);
                  } catch (e: any) {
                    toast.error(e?.message ?? (lang === "ar" ? "تعذر بدء الاستشارة" : "Could not start consultation"));
                  } finally {
                    setStarting(false);
                  }
                }}
              >
                <Stethoscope className="size-4 me-1" />
                {lang === "ar" ? "بدء الاستشارة" : "Start Consultation"}
              </Button>
            </Can>
          )}
          {appt.status === "completed" && (
            <Can permission="medical_records.create">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-9 border-primary/30 text-primary hover:bg-primary/10"
              >
                <Link to={`/physio?patient=${appt.patient_id}&appointment=${appt.id}&new=1`}>
                  <Activity className="size-4 me-1" />
                  {lang === "ar" ? "بدء حالة علاج طبيعي" : "Start Physio Case"}
                </Link>
              </Button>
            </Can>
          )}
          {appt.status === "completed" && (
            <Can permission="invoices.create">
              <Button
                size="sm"
                variant="outline"
                className="h-9 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => setInvoiceOpen(true)}
              >
                <Receipt className="size-4 me-1" />
                {lang === "ar" ? "إنشاء فاتورة" : "Generate Invoice"}
              </Button>
            </Can>
          )}
        </div>
      </header>

      {appt.status === "completed" && (
        <Card className="p-4 flex items-start gap-3 border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-emerald-700 dark:text-emerald-300">
              {lang === "ar" ? "الموعد مكتمل — الخطوات التالية" : "Appointment completed — next steps"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {lang === "ar"
                ? "تابع مباشرة إلى السجل الطبي أو ابدأ حالة علاج طبيعي أو أصدر الفاتورة."
                : "Continue to the medical record, start a physio case, or issue the invoice."}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 space-y-3 lg:col-span-1">
          <div className="text-xs text-muted-foreground">{t("status")}</div>
          <Badge variant="outline" className="capitalize">{String(appt.status).replace(/_/g, " ")}</Badge>
          {appt.is_walk_in && <Badge variant="secondary" className="ms-1">{t("walkIn")}</Badge>}
          {(appt.priority ?? 0) > 0 && <Badge variant="destructive" className="ms-1">{t("urgent")}</Badge>}
          <div className="pt-2 space-y-1.5 text-sm">
            <div className="flex items-center gap-2"><UserIcon className="size-4 text-muted-foreground" /><span>{t("doctor")}: {appt.doctor_id ? (profiles[appt.doctor_id] ? doctorDisplayName(profiles[appt.doctor_id], lang) : appt.doctor_id.slice(0, 8)) : "—"}</span></div>
            <div className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" /><span>{branchName}{appt.room ? ` · ${t("room")}: ${appt.room}` : ""}</span></div>
            <div className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" /><span>{t("appointmentTime")}: {fmt(appt.scheduled_at)}</span></div>
            <div className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" /><span>{t("checkedInAt")}: {fmt(appt.checked_in_at)}</span></div>
            <div className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" /><span>{t("inSessionTime")}: {fmt(appt.started_at)}</span></div>
          </div>
          {(appt.services || appt.procedure) && (
            <div className="pt-2 text-sm text-muted-foreground">
              {appt.services
                ? (lang === "ar" ? (appt.services.name_ar || appt.services.name_en) : (appt.services.name_en || appt.services.name_ar))
                : appt.procedure}
            </div>
          )}
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <ScrollText className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">{t("queueActionsHistory")}</h2>
            <Link to={`/queue/audit?appointment=${appt.id}`} className="ms-auto text-xs text-primary inline-flex items-center gap-1 hover:underline">
              {t("openInAudit")}<ExternalLink className="size-3" />
            </Link>
          </div>
          {logs.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">{t("noData")}</div>
          ) : (
            <ol className="relative ms-3 border-s border-border space-y-3">
              {logs.map((r) => (
                <li key={r.id} className="ps-4">
                  <div className="absolute -start-1.5 mt-1.5 size-3 rounded-full bg-primary/40 border border-primary/60" />
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <Badge variant="outline" className="text-[10px] capitalize">{r.action.replace(/_/g, " ")}</Badge>
                    <span className="text-xs text-muted-foreground">{fmt(r.created_at)}</span>
                    <span className="text-xs text-muted-foreground">· {profiles[r.user_id]?.full_name ?? (r.user_id ? r.user_id.slice(0, 8) : "—")}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{diff(r.old_values, r.new_values) || "—"}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <CreateInvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        presetPatientId={appt.patient_id}
        onSaved={() => setInvoiceOpen(false)}
      />
    </div>
  );
}