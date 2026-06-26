import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Stethoscope, FileText, Pill, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";

type Item = {
  id: string;
  kind: "visit" | "diagnosis" | "prescription" | "procedure";
  date: string;
  title: string;
  subtitle?: string;
  href?: string;
};

export default function PatientTimeline({ patientId }: { patientId: string }) {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [{ data: visits }, { data: rx }] = await Promise.all([
        supabase
          .from("medical_records")
          .select("id,visit_date,visit_type,chief_complaint_en,chief_complaint_ar,medical_specialties(name_en,name_ar),record_diagnoses(id,created_at,diagnoses(code,name_en,name_ar)),record_procedures(id,created_at,quantity,procedures(name_en,name_ar))")
          .eq("patient_id", patientId)
          .is("deleted_at", null)
          .order("visit_date", { ascending: false })
          .limit(100),
        supabase
          .from("prescriptions")
          .select("id,created_at,medical_record_id,prescription_items(id,medications(name_en,name_ar))")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (!active) return;
      const out: Item[] = [];
      (visits ?? []).forEach((v: any) => {
        out.push({
          id: `v-${v.id}`,
          kind: "visit",
          date: v.visit_date,
          title: v.chief_complaint_en || v.chief_complaint_ar || t("consultation"),
          subtitle: v.medical_specialties ? (lang === "ar" ? v.medical_specialties.name_ar : v.medical_specialties.name_en) : t(("visit_" + v.visit_type) as any) ?? v.visit_type,
          href: `/medical/records/${v.id}`,
        });
        (v.record_diagnoses ?? []).forEach((rd: any) => {
          if (!rd.diagnoses) return;
          out.push({
            id: `d-${rd.id}`,
            kind: "diagnosis",
            date: rd.created_at,
            title: lang === "ar" ? (rd.diagnoses.name_ar ?? rd.diagnoses.name_en) : rd.diagnoses.name_en,
            subtitle: rd.diagnoses.code,
            href: `/medical/records/${v.id}`,
          });
        });
        (v.record_procedures ?? []).forEach((rp: any) => {
          if (!rp.procedures) return;
          out.push({
            id: `p-${rp.id}`,
            kind: "procedure",
            date: rp.created_at,
            title: lang === "ar" ? (rp.procedures.name_ar ?? rp.procedures.name_en) : rp.procedures.name_en,
            subtitle: rp.quantity > 1 ? `×${rp.quantity}` : undefined,
            href: `/medical/records/${v.id}`,
          });
        });
      });
      (rx ?? []).forEach((p: any) => {
        const meds = (p.prescription_items ?? [])
          .map((it: any) => it.medications ? (lang === "ar" ? (it.medications.name_ar ?? it.medications.name_en) : it.medications.name_en) : null)
          .filter(Boolean);
        out.push({
          id: `rx-${p.id}`,
          kind: "prescription",
          date: p.created_at,
          title: meds.length ? meds.slice(0, 3).join(" · ") + (meds.length > 3 ? ` +${meds.length - 3}` : "") : t("prescription"),
          subtitle: `${meds.length} ${t("medications")}`,
          href: `/medical/prescriptions/${p.id}`,
        });
      });
      out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setItems(out);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [patientId, lang, t]);

  if (loading) return <Card className="p-6 shadow-card text-sm text-muted-foreground">…</Card>;
  if (items.length === 0) return <Card className="p-6 shadow-card text-sm text-muted-foreground text-center">{t("noVisits")}</Card>;

  return (
    <Card className="p-5 shadow-card">
      <ol className="relative border-s border-border ms-2 space-y-4">
        {items.map((it) => (
          <li key={it.id} className="ms-4">
            <span className={`absolute -start-1.5 mt-1.5 size-3 rounded-full ring-4 ring-background ${dotColor(it.kind)}`} />
            <Link to={it.href ?? "#"} className="block p-3 rounded-lg border border-border hover:bg-muted/40">
              <div className="flex items-start gap-2 flex-wrap">
                <Badge variant="outline" className={`flex items-center gap-1 ${badgeClass(it.kind)}`}>
                  {iconFor(it.kind)}
                  <span>{t(("item" + cap(it.kind)) as any)}</span>
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{it.title}</div>
                  {it.subtitle && <div className="text-xs text-muted-foreground truncate">{it.subtitle}</div>}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">{formatDateTime(it.date, lang)}</div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }
function iconFor(kind: Item["kind"]) {
  if (kind === "visit") return <FileText className="size-3" />;
  if (kind === "diagnosis") return <Stethoscope className="size-3" />;
  if (kind === "prescription") return <Pill className="size-3" />;
  return <Activity className="size-3" />;
}
function dotColor(kind: Item["kind"]) {
  if (kind === "visit") return "bg-primary";
  if (kind === "diagnosis") return "bg-warning";
  if (kind === "prescription") return "bg-success";
  return "bg-accent";
}
function badgeClass(kind: Item["kind"]) {
  if (kind === "visit") return "status-progress";
  if (kind === "diagnosis") return "status-review";
  if (kind === "prescription") return "status-completed";
  return "status-progress";
}