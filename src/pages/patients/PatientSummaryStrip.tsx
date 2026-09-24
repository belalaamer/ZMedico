import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Activity, AlertTriangle, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format";

type Props = { patientId: string; patient: any; insurer?: any; canViewClinical: boolean };

export default function PatientSummaryStrip({ patientId, patient, insurer, canViewClinical }: Props) {
  const { lang } = useI18n();
  const [next, setNext] = useState<any>(null);
  const [last, setLast] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);

  useEffect(() => {
    let active = true;
    // Reset so previous patient's data never bleeds while the new fetch runs.
    setNext(null);
    setLast(null);
    setHistory(null);
    const nowIso = new Date().toISOString();
    const lastVisitQuery = canViewClinical
      ? supabase
          .from("medical_records")
          .select("id,visit_date,chief_complaint_en,chief_complaint_ar")
          .eq("patient_id", patientId)
          .order("visit_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null });

    const historyQuery = canViewClinical
      ? supabase
          .from("medical_history")
          .select("has_allergies,allergies_en,allergies_ar,has_diabetes,has_hypertension,has_heart_disease,has_bleeding_disorder")
          .eq("patient_id", patientId)
          .maybeSingle()
      : Promise.resolve({ data: null });

    Promise.all([
      supabase
        .from("appointments")
        .select("id,scheduled_at,procedure,status")
        .eq("patient_id", patientId)
        .is("deleted_at", null)
        .gte("scheduled_at", nowIso)
        .in("status", ["scheduled", "confirmed", "in_progress"])
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      lastVisitQuery,
      historyQuery,
    ]).then(([a, m, h]) => {
      if (!active) return;
      setNext(a.data ?? null);
      setLast(m.data ?? null);
      setHistory(h.data ?? null);
    });
    return () => { active = false; };
  }, [patientId, canViewClinical]);

  const chronicCount = history ? [
    history.has_diabetes, history.has_hypertension,
    history.has_heart_disease, history.has_bleeding_disorder,
  ].filter(Boolean).length : 0;
  const hasAllergies = !!(history?.has_allergies && (history.allergies_en || history.allergies_ar));

  const insExpiry = patient?.insurance_policy_expiry ? new Date(patient.insurance_policy_expiry) : null;
  const insExpired = insExpiry ? insExpiry.getTime() < Date.now() : false;
  const insName = insurer ? (lang === "ar" ? (insurer.name_ar || insurer.name_en) : insurer.name_en) : null;

  return (
    <Card className="p-3 shadow-card">
      <div className="flex flex-wrap items-stretch gap-2">
        <Chip
          icon={<Calendar className="size-4" />}
          label={lang === "ar" ? "الموعد القادم" : "Next visit"}
          value={next ? formatDateTime(next.scheduled_at, lang) : (lang === "ar" ? "لا يوجد" : "None scheduled")}
          tone={next ? "primary" : "muted"}
          to="/calendar"
        />
        {canViewClinical ? (
          <>
            <Chip
              icon={<Activity className="size-4" />}
              label={lang === "ar" ? "آخر زيارة" : "Last visit"}
              value={last ? formatDate(last.visit_date, lang) : "—"}
              tone="muted"
              to={last ? `/medical/records/${last.id}` : undefined}
            />
            <Chip
              icon={<AlertTriangle className="size-4" />}
              label={lang === "ar" ? "تنبيهات سريرية" : "Clinical alerts"}
              value={
                hasAllergies || chronicCount > 0
                  ? [
                      hasAllergies ? (lang === "ar" ? "حساسية" : "Allergies") : null,
                      chronicCount > 0 ? `${chronicCount} ${lang === "ar" ? "حالة مزمنة" : "chronic"}` : null,
                    ].filter(Boolean).join(" · ")
                  : (lang === "ar" ? "لا يوجد" : "None")
              }
              tone={hasAllergies ? "destructive" : chronicCount > 0 ? "warning" : "muted"}
            />
          </>
        ) : null}
        <Chip
          icon={<Shield className="size-4" />}
          label={lang === "ar" ? "التأمين" : "Insurance"}
          value={
            insName
              ? `${insName}${insExpired ? (lang === "ar" ? " · منتهٍ" : " · expired") : ""}`
              : (lang === "ar" ? "بدون تأمين" : "Self-pay")
          }
          tone={insName ? (insExpired ? "destructive" : "primary") : "muted"}
        />
      </div>
    </Card>
  );
}

function Chip({
  icon, label, value, tone, to,
}: {
  icon: React.ReactNode; label: string; value: string;
  tone: "primary" | "muted" | "warning" | "destructive";
  to?: string;
}) {
  const toneClass = {
    primary: "bg-primary/5 text-foreground border-primary/20",
    muted: "bg-muted/40 text-foreground border-border",
    warning: "bg-warning/10 text-foreground border-warning/30",
    destructive: "bg-destructive/10 text-foreground border-destructive/30",
  }[tone];
  const iconTone = {
    primary: "text-primary", muted: "text-muted-foreground",
    warning: "text-warning", destructive: "text-destructive",
  }[tone];

  const content = (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 min-w-[180px] ${toneClass}`}>
      <span className={iconTone}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </div>
  );
  return to ? <Link to={to} className="flex-1 min-w-[180px]">{content}</Link> : <div className="flex-1 min-w-[180px]">{content}</div>;
}