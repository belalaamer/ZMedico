import { useEffect, useRef, useState } from "react";
import { Upload, FileText, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { useDataSync } from "@/lib/dataSync";
import { Can } from "@/components/Can";
import { logPhiAccess } from "@/lib/observability/phiAudit";

type Props = { patientId: string; autoOpenUpload?: boolean };

export default function PatientDocumentsTab({ patientId, autoOpenUpload }: Props) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [docs, setDocs] = useState<any[]>([]);
  const [uploadType, setUploadType] = useState<string>("other");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const phiLogged = useRef(false);

  const load = async () => {
    const { data } = await supabase
      .from("patient_documents")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(200);
    setDocs(data ?? []);
    // Task B: log PHI access once after data arrives, guarded against re-fires.
    if (data !== null) {
      if (!phiLogged.current) {
        phiLogged.current = true;
        logPhiAccess("document", null, { patientId });
      }
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patientId]);
  useDataSync(["patient_documents"], () => load());

  useEffect(() => {
    if (autoOpenUpload) inputRef.current?.click();
  }, [autoOpenUpload]);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const ALLOWED_MIME = new Set([
      "image/jpeg","image/png","image/webp","image/gif","application/pdf","application/dicom",
    ]);
    const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|pdf|dcm|dicom)$/i;
    const MAX_SIZE = 20 * 1024 * 1024;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) { toast.error(`${file.name}: > 20 MB`); continue; }
      const mimeOk = file.type && ALLOWED_MIME.has(file.type);
      const extOk = ALLOWED_EXT.test(file.name);
      if (!mimeOk && !extOk) { toast.error(`${file.name}: unsupported`); continue; }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_").slice(0, 100) || "file";
      const path = `${patientId}/${Date.now()}-${safeName}`;
      const uploadContentType =
        /\.(dcm|dicom)$/i.test(file.name) ? "application/dicom" : (file.type || undefined);
      const { error: upErr } = await supabase.storage
        .from("patient-docs")
        .upload(path, file, { contentType: uploadContentType });
      if (upErr) { toast.error(upErr.message); continue; }
      await supabase.from("patient_documents").insert({
        patient_id: patientId, document_type: uploadType as any,
        title_en: file.name, title_ar: file.name,
        file_url: path, file_name: file.name, file_size: file.size, uploaded_by: user?.id,
      });
    }
    setUploading(false);
    toast.success(t("uploaded"));
    load();
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
    <div className="space-y-4">
      <Can permission="medical_records.create">
        <Card className="p-4 shadow-card">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>{t("documentType")}</Label>
              <Select value={uploadType} onValueChange={setUploadType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <label className="cursor-pointer flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border hover:bg-muted/40 text-sm">
              <Upload className="size-4" />{uploading ? t("uploading") : t("uploadFile")}
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => upload(e.target.files)}
                disabled={uploading}
              />
            </label>
          </div>
        </Card>
      </Can>

      {docs.length === 0 ? (
        <div className="p-10 text-center text-muted-foreground">{t("noDocuments")}</div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {docs.map((d) => (
            <Card key={d.id} className="p-3 shadow-card flex items-center gap-3">
              <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <FileText className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <button onClick={() => open(d.file_url)} className="text-sm font-medium truncate text-start hover:underline block w-full">
                  {lang === "ar" ? (d.title_ar || d.title_en) : (d.title_en || d.title_ar)}
                </button>
                <div className="text-xs text-muted-foreground truncate">
                  {d.document_type} · {formatDate(d.created_at, lang)}
                </div>
              </div>
              <Can permission="medical_records.delete">
                <Button variant="ghost" size="icon" onClick={() => remove(d)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </Can>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
