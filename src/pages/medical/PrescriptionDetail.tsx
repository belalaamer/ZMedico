import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, Copy, Check, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { generatePrescriptionPdf } from "@/lib/prescriptionPdf";
import { openWhatsApp, prescriptionWhatsAppMessage } from "@/lib/whatsapp";
import { logPhiAccess } from "@/lib/observability/phiAudit";
import { patientDisplayDirection, patientDisplayName } from "@/lib/patientName";
import { useAuthorization } from "@/lib/authz/useAuthorization";

export default function PrescriptionDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { authz } = useAuthorization("PrescriptionDetail");
  const canCreate = authz.can("medical_records.create");
  const canEdit = authz.can("medical_records.edit");
  const [rx, setRx] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [patient, setPatient] = useState<any>(null);
  const phiLogged = useRef(false);

  const load = async () => {
    if (!id) return;
    const { data: r } = await supabase.from("prescriptions").select("*").eq("id", id).maybeSingle();
    if (!r) return;
    setRx(r);
    const [{ data: it }, { data: p }] = await Promise.all([
      supabase.from("prescription_items").select("*, medications(*)").eq("prescription_id", id),
      supabase.from("patients").select("*").eq("id", r.patient_id).maybeSingle(),
    ]);
    setItems(it ?? []); setPatient(p);
    // Task B: log PHI access once after data arrives, guarded against re-fires.
    if (!phiLogged.current) {
      phiLogged.current = true;
      logPhiAccess("prescription", r.id, { patientId: r.patient_id });
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!rx || !patient) return <div className="text-center text-muted-foreground py-10">…</div>;

  const name = patientDisplayName(patient, lang);
  const nameDirection = patientDisplayDirection(patient, lang);

  const print = () => generatePrescriptionPdf({ prescription: rx, items, patient, lang });

  const sendWhatsApp = () => {
    if (!patient?.phone) {
      toast.error(lang === "ar" ? "لا يوجد رقم هاتف للمريض" : "Patient has no phone number");
      return;
    }
    const message = prescriptionWhatsAppMessage({
      patientName: name,
      date: formatDate(rx.prescription_date, lang),
      lang,
      link: window.location.href,
    });
    if (!openWhatsApp(patient.phone, message)) {
      toast.error(lang === "ar" ? "رقم هاتف غير صالح" : "Invalid phone number");
    }
  };

  const markCompleted = async () => {
    const { error } = await supabase.from("prescriptions").update({ status: "completed" }).eq("id", rx.id);
    if (error) return toast.error(error.message);
    toast.success(t("save")); load();
  };

  const clone = async () => {
    // Carry the medical_record_id forward. Without it the cloned prescription
    // is an orphan row: the branch-isolation RLS gate routes through the
    // parent medical record, and a NULL reference used to fall outside every
    // branch boundary (cross-tenant readable) before the policy was hardened —
    // after the hardening, an orphan insert is rejected outright.
    const { data: nrx, error } = await supabase.from("prescriptions").insert({
      patient_id: rx.patient_id, doctor_id: user?.id,
      medical_record_id: rx.medical_record_id,
      notes_en: rx.notes_en, notes_ar: rx.notes_ar,
    } as any).select("id").single();
    if (error || !nrx) return toast.error(error?.message ?? "error");
    const rows = items.map((it) => ({
      prescription_id: nrx.id, medication_id: it.medication_id, dosage: it.dosage,
      frequency: it.frequency, duration: it.duration, quantity: it.quantity,
      instructions_en: it.instructions_en, instructions_ar: it.instructions_ar,
    }));
    await supabase.from("prescription_items").insert(rows as any);
    toast.success(t("save"));
    window.location.href = `/medical/prescriptions/${nrx.id}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm"><Link to="/medical/prescriptions"><ArrowLeft className="me-2 size-4"/>{t("prescriptions")}</Link></Button>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={rx.status === "active" ? "status-progress" : rx.status === "completed" ? "status-completed" : "status-cancelled"}>{rx.status === "active" ? t("activeRx") : rx.status === "completed" ? t("completed") : t("discontinued")}</Badge>
          {canCreate ? <Button size="sm" variant="outline" onClick={clone}><Copy className="me-2 size-4"/>{t("cloneRefill")}</Button> : null}
          {canEdit && rx.status === "active" ? <Button size="sm" variant="outline" onClick={markCompleted}><Check className="me-2 size-4"/>{t("markCompletedRx")}</Button> : null}
          <Button size="sm" variant="outline" onClick={sendWhatsApp} className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200 dark:bg-green-950/30 dark:hover:bg-green-900/40 dark:text-green-300 dark:border-green-900">
            <MessageCircle className="me-2 size-4"/>WhatsApp
          </Button>
          <Button size="sm" className="gradient-primary text-primary-foreground" onClick={print}><Printer className="me-2 size-4"/>{t("print")}</Button>
        </div>
      </div>

      <Card className="p-6 shadow-card">
        <div className="flex justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="text-xs text-muted-foreground uppercase">{t("rxFor")}</div>
            <Link to={`/patients/${patient.id}`} className="font-bold text-lg hover:underline" dir={nameDirection}>{name}</Link>
          </div>
          <div className="text-end">
            <div className="text-xs text-muted-foreground uppercase">{t("rxDate")}</div>
            <div className="font-medium">{formatDate(rx.prescription_date, lang)}</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr><th className="p-2 text-start">{t("medication")}</th><th className="p-2">{t("dosage")}</th><th className="p-2">{t("frequency")}</th><th className="p-2">{t("durationField")}</th><th className="p-2 text-end">{t("qty")}</th></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="p-2">
                    <div className="font-medium">{lang === "ar" ? it.medications?.name_ar : it.medications?.name_en} {it.medications?.strength && <span className="text-xs text-muted-foreground">{it.medications.strength}</span>}</div>
                    {it.instructions_en && <div className="text-xs text-muted-foreground italic">{it.instructions_en}</div>}
                  </td>
                  <td className="p-2 text-center">{it.dosage ?? "—"}</td>
                  <td className="p-2 text-center">{it.frequency ?? "—"}</td>
                  <td className="p-2 text-center">{it.duration ?? "—"}</td>
                  <td className="p-2 text-end tabular-nums">{it.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
