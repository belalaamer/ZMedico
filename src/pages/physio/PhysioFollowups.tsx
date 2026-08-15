import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Calendar, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListSkeleton } from "@/components/ListSkeleton";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export default function PhysioFollowups() {
  const { currentBranchId } = useBranch();
  const { lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<any[]>([]);
  const [therapists, setTherapists] = useState<Record<string, string>>({});
  const [therapistId, setTherapistId] = useState<string>("_all");
  const [horizon, setHorizon] = useState<number>(7);

  useEffect(() => {
    if (!currentBranchId) { setCases([]); setLoading(false); return; }
    setLoading(true);
    (async () => {
      const { data } = await supabase.from("physio_cases" as any)
        .select("id,diagnosis,status,therapist_id,followup_enabled,followup_due_date,patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
        .eq("branch_id", currentBranchId).is("deleted_at", null)
        .eq("status", "active").eq("followup_enabled", true)
        .not("followup_due_date", "is", null)
        .order("followup_due_date", { ascending: true });
      const list = (data as any) ?? [];
      setCases(list);
      const ids = Array.from(new Set(list.map((c: any) => c.therapist_id).filter(Boolean))) as string[];
      if (ids.length) {
        // Bug fix: staff_profiles has no first_name_en/last_name_en columns
        // -- this query errored (PostgREST 400) so `tps` was always
        // null/[], meaning every therapist here showed as an 8-char UUID
        // slice. The display name lives on profiles.full_name, reached the
        // same way PhysioCases.tsx already does it correctly.
        const { data: tps } = await supabase.from("staff_profiles")
          .select("id,profile:profiles!staff_profiles_id_fkey(full_name,email)").in("id", ids);
        const map: Record<string, string> = {};
        (tps ?? []).forEach((t: any) => { map[t.id] = t.profile?.full_name || t.profile?.email || t.id.slice(0, 8); });
        setTherapists(map);
      } else setTherapists({});
      setLoading(false);
    })();
  }, [currentBranchId]);

  const today = new Date().toISOString().slice(0, 10);
  const horizonDate = useMemo(() => new Date(Date.now() + horizon * 86400_000).toISOString().slice(0, 10), [horizon]);

  const filtered = useMemo(() => cases.filter(c =>
    (therapistId === "_all" || (c.therapist_id ?? "_none") === therapistId)
    && (c.followup_due_date <= horizonDate)
  ), [cases, therapistId, horizonDate]);

  const overdue = filtered.filter(c => c.followup_due_date < today);
  const dueSoon = filtered.filter(c => c.followup_due_date >= today);

  const patientName = (p: any) => lang === "ar"
    ? `${p?.first_name_ar ?? p?.first_name_en ?? ""} ${p?.last_name_ar ?? p?.last_name_en ?? ""}`.trim()
    : `${p?.first_name_en ?? ""} ${p?.last_name_en ?? ""}`.trim();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{lang === "ar" ? "متابعات العلاج الطبيعي" : "Physio follow-ups"}</h1>
        <p className="text-sm text-muted-foreground mt-1">{lang === "ar" ? "حالات نشطة بمتابعة مفعّلة" : "Active cases with follow-up enabled"}</p>
      </div>

      <Card className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label>{lang === "ar" ? "المعالج" : "Therapist"}</Label>
          <Select value={therapistId} onValueChange={setTherapistId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">{lang === "ar" ? "الكل" : "All"}</SelectItem>
              <SelectItem value="_none">{lang === "ar" ? "غير محدد" : "Unassigned"}</SelectItem>
              {Object.entries(therapists).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{lang === "ar" ? "خلال (يوم)" : "Within (days)"}</Label>
          <Input type="number" min={0} max={90} value={horizon} onChange={e => setHorizon(Math.max(0, Math.min(90, Number(e.target.value) || 0)))} />
        </div>
        <div className="col-span-2 md:col-span-2 flex items-end gap-2 text-sm text-muted-foreground">
          <Badge variant="outline" className="status-cancelled">{overdue.length} {lang === "ar" ? "متأخرة" : "overdue"}</Badge>
          <Badge variant="outline" className="status-pending">{dueSoon.length} {lang === "ar" ? "قريبة" : "due soon"}</Badge>
        </div>
      </Card>

      {loading ? <ListSkeleton rows={6} /> : (
        <>
          <Section
            title={lang === "ar" ? "متأخرة" : "Overdue"}
            icon={<AlertCircle className="size-4 text-destructive" />}
            items={overdue} empty={lang === "ar" ? "لا متأخرات" : "Nothing overdue"}
            lang={lang} therapists={therapists} patientName={patientName} accent="destructive"
          />
          <Section
            title={lang === "ar" ? "قريبة الاستحقاق" : "Due soon"}
            icon={<Calendar className="size-4 text-muted-foreground" />}
            items={dueSoon} empty={lang === "ar" ? "لا متابعات قريبة" : "Nothing due soon"}
            lang={lang} therapists={therapists} patientName={patientName}
          />
        </>
      )}
    </div>
  );
}

function Section({ title, icon, items, empty, lang, therapists, patientName, accent }: any) {
  return (
    <Card className="overflow-hidden">
      <div className="p-4 text-sm font-semibold flex items-center gap-2">{icon}{title} <span className="text-muted-foreground font-normal">({items.length})</span></div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((c: any) => (
            <Link key={c.id} to={`/physio/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/40">
              <div className="flex-1 min-w-0">
                {/* UX fix: this was the last file still showing the "#N"
                    patient clinic-number badge on a card that just
                    references a patient -- missed in the earlier sweep.
                    Only the main Patients list should show it. */}
                <div className="text-sm font-medium truncate">{patientName(c.patients)}</div>
                <div className="text-xs text-muted-foreground truncate">{c.diagnosis || "—"} · {c.therapist_id ? (therapists[c.therapist_id] ?? "—") : (lang === "ar" ? "غير محدد" : "Unassigned")}</div>
              </div>
              <Badge variant="outline" className={accent === "destructive" ? "status-cancelled" : "status-pending"}>
                {lang === "ar" ? "حتى" : "due"} {formatDate(c.followup_due_date, lang)}
              </Badge>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
