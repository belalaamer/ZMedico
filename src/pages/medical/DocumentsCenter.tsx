import { useEffect, useState } from "react";
import { Upload, FileText, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { patientDisplayDirection, patientDisplayName } from "@/lib/patientName";
import { Link } from "react-router-dom";
import { useDataSync } from "@/lib/dataSync";

export default function DocumentsCenter() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { currentBranchId } = useBranch();
  const [docs, setDocs] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [filterType, setFilterType] = useState("all");
  const [filterPatient, setFilterPatient] = useState("all");
  const [search, setSearch] = useState("");
  const [uploadPatient, setUploadPatient] = useState("");
  const [uploadType, setUploadType] = useState("other");
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    // `patient_documents` has no branch_id column; branch scope is derived
    // through the owning patient — the same indirection the RESTRICTIVE RLS
    // policy uses via user_has_branch_access_via_patient.
    let q = supabase.from("patient_documents")
      .select("*, patients!inner(branch_id,first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code)");
    if (currentBranchId) q = q.eq("patients.branch_id", currentBranchId);
    const { data } = await q.order("created_at", { ascending: false }).limit(300);
    setDocs(data ?? []);
  };
  const loadPatients = () => {
    let q = supabase.from("patients").select("id,first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code").is("deleted_at", null);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    q.order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setPatients(data ?? []));
  };
  useEffect(() => {
    load();
    loadPatients();
    // eslint-disable-next-line
  }, [currentBranchId]);
  useDataSync(["patients"], () => loadPatients());
  useDataSync(["patient_documents"], () => load());

  const filtered = docs.filter((d) => {
    if (filterType !== "all" && d.document_type !== filterType) return false;
    if (filterPatient !== "all" && d.patient_id !== filterPatient) return false;
    if (search) {
      const s = search.toLowerCase();
      const txt = `${d.title_en ?? ""} ${d.title_ar ?? ""} ${d.file_name ?? ""}`.toLowerCase();
      if (!txt.includes(s)) return false;
    }
    return true;
  });

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!uploadPatient) return toast.error(t("selectPatient"));
    const ALLOWED_MIME = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "application/dicom",
    ]);
    const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|pdf|dcm|dicom)$/i;
    const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name}: file exceeds 20 MB limit`);
        continue;
      }
      const mimeOk = file.type && ALLOWED_MIME.has(file.type);
      const extOk = ALLOWED_EXT.test(file.name);
      if (!mimeOk && !extOk) {
        toast.error(`${file.name}: unsupported file type`);
        continue;
      }
      const safeName = file.name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/_{2,}/g, "_")
        .slice(0, 100) || "file";
      const path = `${uploadPatient}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("patient-docs").upload(path, file);
      if (upErr) { toast.error(upErr.message); continue; }
      await supabase.from("patient_documents").insert({
        patient_id: uploadPatient, document_type: uploadType as any,
        title_en: file.name, title_ar: file.name,
        file_url: path, file_name: file.name, file_size: file.size, uploaded_by: user?.id,
      });
    }
    setUploading(false); toast.success(t("uploaded")); load();
  };

  const open = async (path: string) => {
    const { data } = await supabase.storage.from("patient-docs").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  const remove = async (d: any) => {
    await supabase.storage.from("patient-docs").remove([d.file_url]);
    await supabase.from("patient_documents").delete().eq("id", d.id);
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("documentsCenter")}</h1>

      <Card className="p-4 shadow-card space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>{t("filterByPatient")}</Label>
            <Select value={uploadPatient} onValueChange={setUploadPatient}>
              <SelectTrigger><SelectValue placeholder={t("selectPatient")}/></SelectTrigger>
              <SelectContent>{patients.map((p) => <SelectItem key={p.id} value={p.id}>#{p.patient_code} · {patientDisplayName(p, lang)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t("documentType")}</Label>
            <Select value={uploadType} onValueChange={setUploadType}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="lab_result">{t("docLabResult")}</SelectItem>
                <SelectItem value="xray">{t("docXray")}</SelectItem>
                <SelectItem value="mri">{t("docMri")}</SelectItem>
                <SelectItem value="ct_scan">{t("docCt")}</SelectItem>
                <SelectItem value="report">{t("docReport")}</SelectItem>
                <SelectItem value="other">{t("docOther")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>&nbsp;</Label>
            <label className="cursor-pointer flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border hover:bg-muted/40 text-sm">
              <Upload className="size-4"/>{uploading ? t("uploading") : t("uploadFile")}
              <input type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} disabled={uploading || !uploadPatient}/>
            </label>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs"/>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterAll")}</SelectItem>
            <SelectItem value="lab_result">{t("docLabResult")}</SelectItem>
            <SelectItem value="xray">{t("docXray")}</SelectItem>
            <SelectItem value="mri">{t("docMri")}</SelectItem>
            <SelectItem value="ct_scan">{t("docCt")}</SelectItem>
            <SelectItem value="report">{t("docReport")}</SelectItem>
            <SelectItem value="other">{t("docOther")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPatient} onValueChange={setFilterPatient}>
          <SelectTrigger className="w-56"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterAll")}</SelectItem>
            {patients.map((p) => <SelectItem key={p.id} value={p.id}>#{p.patient_code} · {patientDisplayName(p, lang)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? <div className="p-10 text-center text-muted-foreground">{t("noDocuments")}</div> : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map((d) => {
            const p = d.patients;
            const name = patientDisplayName(p, lang);
            return (
              <Card key={d.id} className="p-3 shadow-card flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><FileText className="size-5"/></div>
                <div className="flex-1 min-w-0">
                  <button onClick={() => open(d.file_url)} className="text-sm font-medium truncate text-start hover:underline block w-full">{lang === "ar" ? d.title_ar : d.title_en}</button>
                  <Link to={`/patients/${d.patient_id}`} className="text-xs text-muted-foreground truncate hover:underline block"><span dir={patientDisplayDirection(p, lang)}>{name}</span> · {formatDate(d.created_at, lang)}</Link>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(d)}><Trash2 className="size-4 text-destructive"/></Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
