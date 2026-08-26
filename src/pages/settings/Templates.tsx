import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Templates({ kind }: { kind: "email" | "sms" | "whatsapp" }) {
  const { t, lang } = useI18n();
  const table = kind === "email" ? "email_templates" : kind === "sms" ? "sms_templates" : "whatsapp_templates";
  const titleKey = kind === "email" ? "emailTemplates" : kind === "sms" ? "smsTemplates" : "whatsappTemplates";
  const [items, setItems] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);

  const load = async () => {
    const { data } = await (supabase as any).from(table).select("*").order("template_key");
    setItems(data ?? []);
  };
  useEffect(() => { load(); setSel(null); /* eslint-disable-next-line */ }, [kind]);

  const save = async () => {
    if (!sel) return;
    const payload: any = { name_en: sel.name_en, name_ar: sel.name_ar, body_en: sel.body_en, body_ar: sel.body_ar, is_active: sel.is_active };
    if (kind === "email") { payload.subject_en = sel.subject_en; payload.subject_ar = sel.subject_ar; }
    if (kind === "whatsapp") { payload.meta_template_name = sel.meta_template_name || null; payload.meta_template_language = sel.meta_template_language || "ar"; }
    const { error } = await (supabase as any).from(table).update(payload).eq("id", sel.id);
    if (error) return toast.error(error.message);
    toast.success(t("saved")); load();
  };

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t(titleKey as any)}</h1>
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
          <Card className="overflow-hidden"><div className="divide-y">
            {items.map(it => (
              <button key={it.id} onClick={() => setSel(it)} className={`w-full text-start p-3 hover:bg-muted ${sel?.id === it.id ? "bg-muted" : ""}`}>
                <div className="font-medium text-sm">{lang === "ar" ? it.name_ar : it.name_en}</div>
                <div className="text-xs text-muted-foreground">{it.template_key}</div>
              </button>
            ))}
            {items.length === 0 && <div className="p-6 text-center text-muted-foreground">{t("noData")}</div>}
          </div></Card>
          <Card className="p-5">
            {!sel ? <div className="text-muted-foreground">Select a template</div> : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{sel.template_key}</Badge>
                  {sel.variables?.map((v: string) => <Badge key={v} variant="outline">{`{{${v}}}`}</Badge>)}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t("nameEn2")}</Label><Input value={sel.name_en} onChange={e => setSel({ ...sel, name_en: e.target.value })} /></div>
                  <div><Label>{t("nameAr2")}</Label><Input dir="rtl" value={sel.name_ar} onChange={e => setSel({ ...sel, name_ar: e.target.value })} /></div>
                  {kind === "email" && (<>
                    <div><Label>{t("subject")} (EN)</Label><Input value={sel.subject_en ?? ""} onChange={e => setSel({ ...sel, subject_en: e.target.value })} /></div>
                    <div><Label>{t("subject")} (AR)</Label><Input dir="rtl" value={sel.subject_ar ?? ""} onChange={e => setSel({ ...sel, subject_ar: e.target.value })} /></div>
                  </>)}
                  {kind === "whatsapp" && (<>
                    <div><Label>Approved Meta template name</Label><Input value={sel.meta_template_name ?? ""} onChange={e => setSel({ ...sel, meta_template_name: e.target.value })} placeholder="patient_portal_credentials" /></div>
                    <div><Label>Meta template language</Label><Input value={sel.meta_template_language ?? "ar"} onChange={e => setSel({ ...sel, meta_template_language: e.target.value })} placeholder="ar" /></div>
                  </>)}
                  <div className="col-span-2"><Label>{t("body")} (EN)</Label><Textarea rows={5} value={sel.body_en ?? ""} onChange={e => setSel({ ...sel, body_en: e.target.value })} /></div>
                  <div className="col-span-2"><Label>{t("body")} (AR)</Label><Textarea dir="rtl" rows={5} value={sel.body_ar ?? ""} onChange={e => setSel({ ...sel, body_ar: e.target.value })} /></div>
                </div>
                <div className="flex justify-end gap-2"><Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button></div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </SettingsLayout>
  );
}