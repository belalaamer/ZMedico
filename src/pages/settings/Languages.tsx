import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Languages() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ code: "", name_en: "", name_ar: "", is_active: true, is_default: false, is_rtl: false });

  const load = async () => { const { data } = await supabase.from("system_languages").select("*").order("code"); setItems(data ?? []); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!f.code || !f.name_en || !f.name_ar) return toast.error(t("requiredFields"));
    if (f.is_default) await supabase.from("system_languages").update({ is_default: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await supabase.from("system_languages").insert(f);
    if (error) return toast.error(error.message);
    toast.success(t("saved")); setOpen(false); load();
  };
  const toggleActive = async (l: any) => { await supabase.from("system_languages").update({ is_active: !l.is_active }).eq("id", l.id); load(); };
  const setDefault = async (l: any) => {
    await supabase.from("system_languages").update({ is_default: false }).neq("id", l.id);
    await supabase.from("system_languages").update({ is_default: true }).eq("id", l.id);
    load();
  };

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("languageSettings")}</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />{t("addLanguage")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("addLanguage")}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("languageCode")}</Label><Input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} /></div>
                <div><Label>{t("nameEn2")}</Label><Input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} /></div>
                <div><Label>{t("nameAr2")}</Label><Input dir="rtl" value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} /></div>
                <div className="flex items-center justify-between rounded-lg border p-2"><Label>{t("isRtl")}</Label><Switch checked={f.is_rtl} onCheckedChange={v => setF({ ...f, is_rtl: v })} /></div>
                <div className="flex items-center justify-between rounded-lg border p-2"><Label>{t("isDefault")}</Label><Switch checked={f.is_default} onCheckedChange={v => setF({ ...f, is_default: v })} /></div>
              </div>
              <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button><Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Card className="overflow-hidden"><div className="divide-y">{items.map(l => (
          <div key={l.id} className="flex items-center gap-3 p-3">
            <Badge variant="outline">{l.code}</Badge>
            <div className="flex-1"><div className="font-medium">{lang === "ar" ? l.name_ar : l.name_en}</div></div>
            {l.is_rtl && <Badge variant="outline">RTL</Badge>}
            {l.is_default && <Badge className="bg-primary text-primary-foreground">{t("isDefault")}</Badge>}
            <Button size="sm" variant="outline" onClick={() => setDefault(l)} disabled={l.is_default}>{t("setDefault")}</Button>
            <Switch checked={l.is_active} onCheckedChange={() => toggleActive(l)} />
          </div>
        ))}</div></Card>
      </div>
    </SettingsLayout>
  );
}