import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Can } from "@/components/Can";
import { logPhiAccess } from "@/lib/observability/phiAudit";

const STATUS = [
  "healthy", "caries", "filled", "crown", "implant", "extracted", "root_canal", "bridge",
] as const;

const STATUS_COLOR: Record<string, string> = {
  healthy: "bg-success/30 text-success-foreground border-success",
  caries: "bg-warning/40 text-warning-foreground border-warning",
  filled: "bg-info/40 text-info-foreground border-info",
  crown: "bg-purple-400/40 text-foreground border-purple-500",
  implant: "bg-purple-600/40 text-foreground border-purple-700",
  root_canal: "bg-orange-400/40 text-foreground border-orange-500",
  extracted: "bg-muted text-muted-foreground border-border line-through",
  bridge: "bg-pink-400/40 text-foreground border-pink-500",
};

const STATUS_LABEL: Record<string, string> = {
  healthy: "chartLegendHealthy", caries: "chartLegendCaries", filled: "chartLegendFilled",
  crown: "chartLegendCrown", implant: "chartLegendImplant", root_canal: "chartLegendRootCanal",
  extracted: "chartLegendExtracted", bridge: "chartLegendBridge",
};

// FDI numbering
const UPPER_RIGHT = ["18","17","16","15","14","13","12","11"];
const UPPER_LEFT  = ["21","22","23","24","25","26","27","28"];
const LOWER_LEFT  = ["31","32","33","34","35","36","37","38"];
const LOWER_RIGHT = ["48","47","46","45","44","43","42","41"];

export default function PatientDental() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [patient, setPatient] = useState<any>(null);
  const [chart, setChart] = useState<Record<string, any>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [procs, setProcs] = useState<any[]>([]);
  const phiLogged = useRef(false);

  const load = async () => {
    if (!id) return;
    const [{ data: p }, { data: ch }, { data: rp }] = await Promise.all([
      supabase.from("patients").select("*").eq("id", id).maybeSingle(),
      supabase.from("dental_chart").select("*").eq("patient_id", id),
      supabase.from("record_procedures").select("*, procedures(name_en,name_ar), medical_records!inner(patient_id, visit_date)").eq("medical_records.patient_id", id),
    ]);
    setPatient(p);
    const map: Record<string, any> = {};
    (ch ?? []).forEach((row: any) => { map[row.tooth_number] = row; });
    setChart(map);
    setProcs(rp ?? []);
    // Task B: log PHI access once after data arrives, guarded against re-fires.
    if (p?.id) {
      if (!phiLogged.current) {
        phiLogged.current = true;
        logPhiAccess("dental_chart", p.id, { patientId: p.id });
      }
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const sel = selected ? chart[selected] : null;
  const selProcs = useMemo(() => selected ? procs.filter((p) => p.tooth_number === selected) : [], [selected, procs]);

  const upsertTooth = async (tooth: string, patch: any) => {
    const existing = chart[tooth];
    let res;
    if (existing?.id) {
      res = await supabase.from("dental_chart").update({ ...patch, last_updated_by: user?.id }).eq("id", existing.id);
    } else {
      res = await supabase.from("dental_chart").insert({ patient_id: id, tooth_number: tooth, status: patch.status ?? "healthy", notes: patch.notes ?? null, last_updated_by: user?.id });
    }
    if (res.error) return toast.error(res.error.message);
    toast.success(t("save"));
    load();
  };

  const Tooth = ({ n }: { n: string }) => {
    const row = chart[n];
    const status = row?.status || "healthy";
    const isSel = selected === n;
    return (
      <button onClick={() => setSelected(n)}
        className={cn(
          "size-10 rounded-md border text-xs font-bold transition",
          STATUS_COLOR[status] || "bg-background border-border text-muted-foreground",
          isSel && "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110"
        )}>{n}</button>
    );
  };

  if (!patient) return <div className="text-center text-muted-foreground py-10">…</div>;
  const name = lang === "ar"
    ? `${patient.first_name_ar ?? patient.first_name_en} ${patient.last_name_ar ?? patient.last_name_en ?? ""}`.trim()
    : `${patient.first_name_en} ${patient.last_name_en ?? ""}`.trim();

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm"><Link to={`/patients/${id}`}><ArrowLeft className="me-2 size-4"/>{name}</Link></Button>
        <div className="flex items-center gap-2">
          <Button onClick={() => window.print()} variant="outline" size="sm"><Printer className="me-2 size-4"/>{t("print")}</Button>
        </div>
      </div>

      <Card className="p-6 shadow-card">
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="text-xl md:text-2xl font-bold">{t("dentalChart")} — {name}</h1>
          <span className="text-xs text-muted-foreground">{t("fdiNotation")}</span>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 text-[10px] text-muted-foreground uppercase">
            <div>{t("upperRight")}</div><div className="text-end">{t("upperLeft")}</div>
          </div>
          <div className="flex justify-center gap-1.5 flex-wrap">
            {UPPER_RIGHT.map((n) => <Tooth key={n} n={n} />)}
            <div className="w-2"/>
            {UPPER_LEFT.map((n) => <Tooth key={n} n={n} />)}
          </div>
          <div className="border-t border-dashed border-border my-4"/>
          <div className="flex justify-center gap-1.5 flex-wrap">
            {LOWER_RIGHT.map((n) => <Tooth key={n} n={n} />)}
            <div className="w-2"/>
            {LOWER_LEFT.map((n) => <Tooth key={n} n={n} />)}
          </div>
          <div className="grid grid-cols-2 text-[10px] text-muted-foreground uppercase mt-1">
            <div>{t("lowerRight")}</div><div className="text-end">{t("lowerLeft")}</div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">{t("legend")}</div>
          <div className="flex flex-wrap gap-2">
            {STATUS.map((s) => (
              <div key={s} className="flex items-center gap-1.5 text-xs">
                <span className={cn("inline-block size-4 rounded border", STATUS_COLOR[s])} />
                <span>{t(STATUS_LABEL[s] as any)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Selected tooth editor */}
      <Card className="p-5 shadow-card print:hidden">
        {!selected ? <div className="text-sm text-muted-foreground text-center py-6">{t("selectTooth")}</div> : (
          <ToothEditor tooth={selected} row={sel} procs={selProcs} onSave={(patch) => upsertTooth(selected, patch)} />
        )}
      </Card>
    </div>
  );
}

function ToothEditor({ tooth, row, procs, onSave }: any) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<string>(row?.status ?? "healthy");
  const [notes, setNotes] = useState<string>(row?.notes ?? "");
  useEffect(() => { setStatus(row?.status ?? "healthy"); setNotes(row?.notes ?? ""); }, [row, tooth]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t("toothNumber")} {tooth}</h3>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>{t("toothStatus")}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS.map((s) => <SelectItem key={s} value={s}>{t(STATUS_LABEL[s] as any)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>{t("notes")}</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500}/></div>
      </div>
      <div className="flex justify-end">
        <Can permission="medical_records.edit">
          <Button onClick={() => onSave({ status, notes: notes || null })} className="gradient-primary text-primary-foreground"><Save className="me-2 size-4"/>{t("saveChart")}</Button>
        </Can>
      </div>

      {procs.length > 0 && (
        <div className="pt-3 border-t border-border">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">{t("proceduresTab")}</div>
          <div className="space-y-1.5">
            {procs.map((p: any) => (
              <div key={p.id} className="text-sm flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{new Date(p.medical_records.visit_date).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}</span>
                <span>·</span>
                <span>{lang === "ar" ? p.procedures?.name_ar : p.procedures?.name_en}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
