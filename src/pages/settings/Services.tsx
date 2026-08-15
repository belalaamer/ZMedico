import { useEffect, useMemo, useState } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Edit3, Power, Trash2, Search } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConsumablesEditor } from "@/components/ConsumablesEditor";

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
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");

  const load = async () => {
    const { data: c } = await supabase.from("service_categories").select("*").is("deleted_at", null).order("display_order");
    const { data: s } = await supabase.from("services").select("*").is("deleted_at", null).order("display_order");
    setCats(c ?? []); setServices(s ?? []);
  };
  useEffect(() => { load(); }, []);

  const saveCat = async () => {
    const name = (cf.name || "").trim();
    if (!name) return toast.error(t("nameRequired"));
    const payload = { name_en: name, name_ar: name, icon: cf.icon || null, color: cf.color || null, display_order: cf.display_order, is_active: cf.is_active };
    const { error } = editC ? await supabase.from("service_categories").update(payload).eq("id", editC.id) : await supabase.from("service_categories").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("saved")); setOC(false); load();
  };
  const saveSv = async () => {
    const name = (sf.name || "").trim();
    if (!name) return toast.error(t("nameRequired"));
    const { name: _ignored, ...rest } = sf;
    const payload = { ...rest, name_en: name, name_ar: name, category_id: sf.category_id || null, cost_price: sf.cost_price === "" ? null : sf.cost_price };
    const { error } = editS ? await supabase.from("services").update(payload).eq("id", editS.id) : await supabase.from("services").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("saved")); setOS(false); load();
  };
  const toggleSv = async (s: any) => { await supabase.from("services").update({ is_active: !s.is_active }).eq("id", s.id); load(); };
  const toggleCat = async (c: any) => { await supabase.from("service_categories").update({ is_active: !c.is_active }).eq("id", c.id); load(); };

  const delCat = async (c: any): Promise<void> => {
    if (services.some(s => s.category_id === c.id)) { toast.error(t("servicesHaveItems")); return; }
    const { error } = await supabase.from("service_categories").update({ deleted_at: new Date().toISOString() } as any).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };
  const delSv = async (s: any): Promise<void> => {
    const { error } = await supabase.from("services").update({ deleted_at: new Date().toISOString() } as any).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };

  const catById = useMemo(() => {
    const m = new Map<string, any>();
    cats.forEach(c => m.set(c.id, c));
    return m;
  }, [cats]);

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter(s => {
      if (catFilter !== "all" && s.category_id !== catFilter) return false;
      if (!q) return true;
      const name = `${s.name_en ?? ""} ${s.name_ar ?? ""} ${s.code ?? ""}`.toLowerCase();
      return name.includes(q);
    });
  }, [services, search, catFilter]);

  const openEditCat = (c: any) => { setEC(c); setCF({ ...c, name: c.name_en || c.name_ar || "" }); setOC(true); };
  const openEditSv = (s: any) => { setES(s); setSF({ ...s, name: s.name_en || s.name_ar || "" }); setOS(true); };

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
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">{t("color")}</TableHead>
                      <TableHead>{t("name")}</TableHead>
                      <TableHead className="w-32">{t("servicesMgmt")}</TableHead>
                      <TableHead className="w-28">{t("status")}</TableHead>
                      <TableHead className="w-16 text-end">—</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cats.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">—</TableCell></TableRow>
                    )}
                    {cats.map(c => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="size-8 rounded flex items-center justify-center text-xs text-white" style={{ background: c.color ?? "#7c3aed" }}>
                            {c.icon || ""}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{lang === "ar" ? c.name_ar : c.name_en}</TableCell>
                        <TableCell><Badge variant="outline">{services.filter(s => s.category_id === c.id).length}</Badge></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={c.is_active ? "status-completed" : "status-departed"}>
                            {c.is_active ? t("active") : t("inactive")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditCat(c)}><Edit3 className="size-4 me-2" />{t("edit")}</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleCat(c)}><Power className="size-4 me-2" />{c.is_active ? t("inactive") : t("active")}</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => delCat(c)}><Trash2 className="size-4 me-2" />{t("delete")}</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
          <TabsContent value="services" className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:justify-between">
              <div className="flex flex-1 gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute start-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input className="ps-8" placeholder={t("searchByNameOrCode")} value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allCategories")}</SelectItem>
                    {cats.map(c => <SelectItem key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
                  <div className="mt-3">
                    <ConsumablesEditor parentType="service" parentId={editS?.id ?? null} />
                  </div>
                  <DialogFooter><Button variant="ghost" onClick={() => setOS(false)}>{t("cancel")}</Button><Button className="gradient-primary text-primary-foreground" onClick={saveSv}>{t("save")}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("name")}</TableHead>
                      <TableHead>{t("category")}</TableHead>
                      <TableHead className="w-40">{t("durationMinutes")} · {t("defaultPrice")}</TableHead>
                      <TableHead className="w-28">{t("status")}</TableHead>
                      <TableHead className="w-16 text-end">—</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServices.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">—</TableCell></TableRow>
                    )}
                    {filteredServices.map(s => {
                      const cat = s.category_id ? catById.get(s.category_id) : null;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="min-w-0">
                            <div className="font-medium truncate">{lang === "ar" ? s.name_ar : s.name_en}</div>
                            {s.code && <div className="text-xs text-muted-foreground">{s.code}</div>}
                          </TableCell>
                          <TableCell>
                            {cat ? (
                              <Badge style={{ backgroundColor: cat.color ?? "#7c3aed", color: "#fff", border: "none" }}>
                                {lang === "ar" ? cat.name_ar : cat.name_en}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            <div>{s.default_duration_minutes} {t("minutesShort")}</div>
                            <div className="text-xs text-muted-foreground">{s.default_price}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={s.is_active ? "status-completed" : "status-departed"}>
                              {s.is_active ? t("active") : t("inactive")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditSv(s)}><Edit3 className="size-4 me-2" />{t("edit")}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toggleSv(s)}><Power className="size-4 me-2" />{s.is_active ? t("inactive") : t("active")}</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => delSv(s)}><Trash2 className="size-4 me-2" />{t("delete")}</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SettingsLayout>
  );
}