import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit3, Power } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RowActions } from "@/components/RowActions";

export default function Services() {
  const { t, lang } = useI18n();
  const [cats, setCats] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [openCat, setOC] = useState(false);
  const [openSv, setOS] = useState(false);
  const [editC, setEC] = useState<any>(null);
  const [editS, setES] = useState<any>(null);
  const [cf, setCF] = useState<any>({ name: "", icon: "", color: "#7c3aed", display_order: 0, is_active: true });
  const [sf, setSF] = useState<any>({ category_id: "", name: "", code: "", default_duration_minutes: 30, default_price: 0, cost_price: null, requires_appointment: true, available_online: true, display_order: 0, is_active: true });

  const load = async () => {
    const { data: c } = await supabase.from("service_categories").select("*").is("deleted_at", null).order("display_order");
    const { data: s } = await supabase.from("services").select("*").is("deleted_at", null).order("display_order");
    setCats(c ?? []); setServices(s ?? []);
  };
  useEffect(() => { load(); }, []);

  const saveCat = async () => {
    const name = (cf.name || "").trim();
    if (!name) return toast.error("required");
    const payload = { name_en: name, name_ar: name, icon: cf.icon || null, color: cf.color || null, display_order: cf.display_order, is_active: cf.is_active };
    const { error } = editC ? await supabase.from("service_categories").update(payload).eq("id", editC.id) : await supabase.from("service_categories").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("saved")); setOC(false); load();
  };
  const saveSv = async () => {
    const name = (sf.name || "").trim();
    if (!name) return toast.error("required");
    const { name: _ignored, ...rest } = sf;
    const payload = { ...rest, name_en: name, name_ar: name, category_id: sf.category_id || null, cost_price: sf.cost_price === "" ? null : sf.cost_price };
    const { error } = editS ? await supabase.from("services").update(payload).eq("id", editS.id) : await supabase.from("services").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("saved")); setOS(false); load();
  };
  const toggleSv = async (s: any) => { await supabase.from("services").update({ is_active: !s.is_active }).eq("id", s.id); load(); };
  const toggleCat = async (c: any) => { await supabase.from("service_categories").update({ is_active: !c.is_active }).eq("id", c.id); load(); };

  const delCat = async (c: any) => {
    if (services.some(s => s.category_id === c.id)) { toast.error(lang === "ar" ? "لا يمكن الحذف: تحتوي على خدمات" : "Cannot delete: has services"); return; }
    const { error } = await supabase.from("service_categories").update({ deleted_at: new Date().toISOString() } as any).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(t("delete")); load();
  };
  const delSv = async (s: any) => {
    const { error } = await supabase.from("services").update({ deleted_at: new Date().toISOString() } as any).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(t("delete")); load();
  };

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("servicesMgmt")}</h1>
        <Tabs defaultValue="services">
          <TabsList>
            <TabsTrigger value="services">{t("servicesMgmt")}</TabsTrigger>
            <TabsTrigger value="categories">{t("serviceCategories")}</TabsTrigger>
          </TabsList>
          <TabsContent value="categories" className="space-y-3">
            <div className="flex justify-end">
              <Dialog open={openCat} onOpenChange={setOC}>
                <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground" onClick={() => { setEC(null); setCF({ name: "", icon: "", color: "#7c3aed", display_order: cats.length, is_active: true }); setOC(true); }}><Plus className="me-2 size-4" />{t("addCategory")}</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editC ? t("edit") : t("addCategory")}</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><Label>{t("name")} / الاسم</Label><Input value={cf.name} onChange={e => setCF({ ...cf, name: e.target.value })} /></div>
                    <div><Label>{t("icon")}</Label><Input value={cf.icon ?? ""} onChange={e => setCF({ ...cf, icon: e.target.value })} /></div>
                    <div><Label>{t("color")}</Label><Input type="color" value={cf.color ?? "#7c3aed"} onChange={e => setCF({ ...cf, color: e.target.value })} /></div>
                    <div><Label>{t("displayOrder")}</Label><Input type="number" value={cf.display_order} onChange={e => setCF({ ...cf, display_order: +e.target.value })} /></div>
                  </div>
                  <DialogFooter><Button variant="ghost" onClick={() => setOC(false)}>{t("cancel")}</Button><Button className="gradient-primary text-primary-foreground" onClick={saveCat}>{t("save")}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Card className="overflow-hidden"><div className="divide-y">{cats.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3">
                <div className="size-8 rounded" style={{ background: c.color ?? "#7c3aed" }} />
                <div className="flex-1"><div className="font-medium">{lang === "ar" ? c.name_ar : c.name_en}</div></div>
                <Badge variant="outline">{services.filter(s => s.category_id === c.id).length}</Badge>
                <Button variant="ghost" size="icon" onClick={() => { setEC(c); setCF({ ...c, name: c.name_en || c.name_ar || "" }); setOC(true); }}><Edit3 className="size-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => toggleCat(c)}><Power className="size-4" /></Button>
                <RowActions onEdit={() => { setEC(c); setCF({ ...c, name: c.name_en || c.name_ar || "" }); setOC(true); }} onDelete={() => delCat(c)} />
              </div>
            ))}</div></Card>
          </TabsContent>
          <TabsContent value="services" className="space-y-3">
            <div className="flex justify-end">
              <Dialog open={openSv} onOpenChange={setOS}>
                <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground" onClick={() => { setES(null); setSF({ category_id: "", name: "", code: "", default_duration_minutes: 30, default_price: 0, cost_price: null, requires_appointment: true, available_online: true, display_order: services.length, is_active: true }); setOS(true); }}><Plus className="me-2 size-4" />{t("addService")}</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editS ? t("edit") : t("addService")}</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><Label>{t("category")}</Label>
                      <Select value={sf.category_id || "none"} onValueChange={v => setSF({ ...sf, category_id: v === "none" ? "" : v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="none">—</SelectItem>{cats.map(c => <SelectItem key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2"><Label>{t("name")} / الاسم</Label><Input value={sf.name} onChange={e => setSF({ ...sf, name: e.target.value })} /></div>
                    <div><Label>{t("code")}</Label><Input value={sf.code ?? ""} onChange={e => setSF({ ...sf, code: e.target.value })} /></div>
                    <div><Label>{t("durationMinutes")}</Label><Input type="number" value={sf.default_duration_minutes} onChange={e => setSF({ ...sf, default_duration_minutes: +e.target.value })} /></div>
                    <div><Label>{t("defaultPrice")}</Label><Input type="number" step="0.01" value={sf.default_price} onChange={e => setSF({ ...sf, default_price: +e.target.value })} /></div>
                    <div><Label>{t("costPrice")}</Label><Input type="number" step="0.01" value={sf.cost_price ?? ""} onChange={e => setSF({ ...sf, cost_price: e.target.value === "" ? null : +e.target.value })} /></div>
                    <div className="flex items-center justify-between rounded-lg border p-2"><Label>{t("requiresAppointment")}</Label><Switch checked={!!sf.requires_appointment} onCheckedChange={v => setSF({ ...sf, requires_appointment: v })} /></div>
                    <div className="flex items-center justify-between rounded-lg border p-2"><Label>{t("availableOnline")}</Label><Switch checked={!!sf.available_online} onCheckedChange={v => setSF({ ...sf, available_online: v })} /></div>
                  </div>
                  <DialogFooter><Button variant="ghost" onClick={() => setOS(false)}>{t("cancel")}</Button><Button className="gradient-primary text-primary-foreground" onClick={saveSv}>{t("save")}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Card className="overflow-hidden"><div className="divide-y">{services.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{lang === "ar" ? s.name_ar : s.name_en}</div>
                  <div className="text-xs text-muted-foreground">{s.default_duration_minutes} min · {s.default_price}</div>
                </div>
                <Badge variant="outline" className={s.is_active ? "status-completed" : "status-departed"}>{s.is_active ? t("active") : t("inactive")}</Badge>
                <Button variant="ghost" size="icon" onClick={() => { setES(s); setSF({ ...s, name: s.name_en || s.name_ar || "" }); setOS(true); }}><Edit3 className="size-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => toggleSv(s)}><Power className="size-4" /></Button>
                <RowActions onEdit={() => { setES(s); setSF({ ...s, name: s.name_en || s.name_ar || "" }); setOS(true); }} onDelete={() => delSv(s)} />
              </div>
            ))}</div></Card>
          </TabsContent>
        </Tabs>
      </div>
    </SettingsLayout>
  );
}