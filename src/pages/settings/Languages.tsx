import { useEffect, useRef, useState } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { useOperationScope } from "@/hooks/useOperationScope";
import { useConfirmedRowMutation } from "@/hooks/useConfirmedRowMutation";
import type { Tables } from "@/integrations/supabase/types";

export default function Languages() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { currentBranchId } = useBranch();
  const scopeKey = user ? `${user.id}:${currentBranchId ?? "all"}` : null;
  const captureScope = useOperationScope(scopeKey);
  const mutation = useConfirmedRowMutation(scopeKey, lang, t("saved"));
  const [items, setItems] = useState<Tables<"system_languages">[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: "", name_en: "", name_ar: "", is_default: false, is_rtl: false });
  const pendingSave = useRef(new Set<string>());
  const [saving, setSaving] = useState(false);
  useEffect(() => { setSaving(false); setOpen(false); }, [scopeKey]);

  const load = async () => {
    const isCurrent = captureScope();
    const { data, error } = await supabase.from("system_languages").select("*").order("code");
    if (!isCurrent()) return;
    if (error) throw error;
    setItems(data ?? []);
  };
  useEffect(() => {
    let current = true;
    setItems([]);
    if (scopeKey) {
      void supabase.from("system_languages").select("*").order("code").then(({ data, error }) => {
        if (!current) return;
        if (error) toast.error(lang === "ar" ? "تعذر تحميل اللغات. أعد المحاولة." : "Unable to load languages. Try again.");
        else setItems(data ?? []);
      }, () => { if (current) toast.error(lang === "ar" ? "تعذر تحميل اللغات. أعد المحاولة." : "Unable to load languages. Try again."); });
    }
    return () => { current = false; };
  }, [scopeKey, lang]);

  const save = async () => {
    const isCurrent = captureScope();
    if (!scopeKey || !isCurrent() || pendingSave.current.has(scopeKey)) return;
    if (!f.code.trim() || !f.name_en.trim() || !f.name_ar.trim()) return toast.error(t("requiredFields"));
    pendingSave.current.add(scopeKey); setSaving(true);
    try {
      const { data, error } = await supabase.rpc("create_system_language", { _code: f.code.trim(), _name_en: f.name_en.trim(), _name_ar: f.name_ar.trim(), _is_rtl: f.is_rtl, _is_default: f.is_default });
      if (error || typeof data !== "string" || !data) throw error ?? new Error("Unconfirmed language creation");
      if (!isCurrent()) return;
      toast.success(t("saved")); setOpen(false);
      try { await load(); } catch { if (isCurrent()) toast.error(lang === "ar" ? "تم الحفظ، لكن تعذر تحديث اللغات. حدّث الصفحة." : "Saved, but languages could not be refreshed. Refresh the page."); }
    } catch {
      if (isCurrent()) toast.error(lang === "ar" ? "تعذر تأكيد حفظ اللغة. حدّث القائمة قبل إعادة المحاولة." : "Language save could not be confirmed. Refresh the list before retrying.");
    } finally { pendingSave.current.delete(scopeKey); if (isCurrent()) setSaving(false); }
  };
  const toggleActive = (l: Tables<"system_languages">) => mutation.run(l.id, () => supabase.from("system_languages")
    .update({ is_active: !l.is_active }).eq("id", l.id).eq("is_active", l.is_active).select("id").maybeSingle(), load);
  const setDefault = (l: Tables<"system_languages">) => mutation.run("default-language", async () => {
    const { data, error } = await supabase.rpc("set_default_system_language", { _language_id: l.id });
    return { data: data === l.id ? { id: "default-language" } : null, error };
  }, load);

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("languageSettings")}</h1>
          <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
            <DialogTrigger asChild><Button disabled={saving} className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />{t("addLanguage")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("addLanguage")}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>{t("languageCode")}</Label><Input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} /></div>
                <div><Label>{t("nameEn2")}</Label><Input value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} /></div>
                <div><Label>{t("nameAr2")}</Label><Input dir="rtl" value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} /></div>
                <div className="flex items-center justify-between rounded-lg border p-2"><Label>{t("isRtl")}</Label><Switch checked={f.is_rtl} onCheckedChange={v => setF({ ...f, is_rtl: v })} /></div>
                <div className="flex items-center justify-between rounded-lg border p-2"><Label>{t("isDefault")}</Label><Switch checked={f.is_default} onCheckedChange={v => setF({ ...f, is_default: v })} /></div>
              </div>
              <DialogFooter><Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>{t("cancel")}</Button><Button className="gradient-primary text-primary-foreground" disabled={saving} onClick={save}>{saving ? "…" : t("save")}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Card className="overflow-hidden"><div className="divide-y">{items.map(l => (
          <div key={l.id} className="flex items-center gap-3 p-3">
            <Badge variant="outline">{l.code}</Badge>
            <div className="flex-1"><div className="font-medium">{lang === "ar" ? l.name_ar : l.name_en}</div></div>
            {l.is_rtl && <Badge variant="outline">RTL</Badge>}
            {l.is_default && <Badge className="bg-primary text-primary-foreground">{t("isDefault")}</Badge>}
            <Button size="sm" variant="outline" onClick={() => setDefault(l)} disabled={l.is_default || !l.is_active || mutation.isPending("default-language")}>{t("setDefault")}</Button>
            <Switch aria-label={`${lang === "ar" ? "تغيير حالة اللغة" : "Toggle language status"} ${l.code}`} disabled={l.is_default || mutation.isPending(l.id)} checked={l.is_active} onCheckedChange={() => toggleActive(l)} />
          </div>
        ))}</div></Card>
      </div>
    </SettingsLayout>
  );
}
