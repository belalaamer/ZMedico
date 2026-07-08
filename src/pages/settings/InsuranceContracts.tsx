import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileSignature, Plus, Pencil, Trash2, Ban, ListPlus } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Company = { id: string; name_en: string; name_ar?: string | null };
type Contract = any;
type Rule = any;

export default function InsuranceContracts() {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  const T = (en: string, ar: string) => (isAr ? ar : en);
  // R2: admin-only edit affordances routed through AuthorizationService.
  const { authz } = useAuthorization("InsuranceContracts");
  const canEdit = authz.isSuperAdmin();
  const [sp, setSp] = useSearchParams();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>(sp.get("company") || "");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);

  const [contractDialog, setContractDialog] = useState<{ open: boolean; row: Contract | null }>({ open: false, row: null });
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; row: Rule | null }>({ open: false, row: null });

  const [services, setServices] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("insurance_companies").select("id,name_en,name_ar").eq("is_active", true).order("name_en")
      .then(({ data }) => setCompanies((data as any) ?? []));
    (supabase as any).from("services").select("id,name_en,name_ar").eq("is_active", true).order("name_en").limit(1000)
      .then(({ data }: any) => setServices(data ?? []));
    supabase.from("procedures").select("id,name_en,name_ar").eq("is_active", true).order("name_en").limit(1000)
      .then(({ data }) => setProcedures((data as any) ?? []));
  }, []);

  const loadContracts = async (cid: string) => {
    if (!cid) { setContracts([]); setSelectedContract(null); setRules([]); return; }
    const { data } = await (supabase as any).from("insurance_contracts")
      .select("*").eq("insurance_company_id", cid).order("created_at", { ascending: false });
    const list = (data as any) ?? [];
    setContracts(list);
    setSelectedContract((cur) => list.find((c: any) => c.id === cur?.id) ?? list[0] ?? null);
  };

  useEffect(() => {
    if (companyId) sp.set("company", companyId); else sp.delete("company");
    setSp(sp, { replace: true });
    void loadContracts(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!selectedContract?.id) { setRules([]); return; }
    (async () => {
      const { data } = await (supabase as any).from("insurance_contract_rules")
        .select("*").eq("contract_id", selectedContract.id).order("priority").order("created_at");
      setRules((data as any) ?? []);
    })();
  }, [selectedContract?.id]);

  const saveContract = async (form: any) => {
    if (!form.name_en?.trim()) { toast.error(T("Name required", "الاسم مطلوب")); return; }
    const payload = {
      insurance_company_id: companyId,
      name_en: form.name_en.trim(),
      name_ar: form.name_ar?.trim() || null,
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
      default_coverage_percent: Math.max(0, Math.min(100, Number(form.default_coverage_percent) || 0)),
      is_active: !!form.is_active,
      notes: form.notes || null,
    };
    const { error } = contractDialog.row
      ? await (supabase as any).from("insurance_contracts").update(payload).eq("id", contractDialog.row.id)
      : await (supabase as any).from("insurance_contracts").insert(payload);
    if (error) { toast.error(error.message); return; }
    setContractDialog({ open: false, row: null });
    toast.success(T("Saved", "تم الحفظ"));
    await loadContracts(companyId);
  };

  const removeContract = async (id: string) => {
    if (!confirm(T("Delete this contract and all its rules?", "حذف العقد وكل قواعده؟"))) return;
    const { error } = await (supabase as any).from("insurance_contracts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (selectedContract?.id === id) setSelectedContract(null);
    await loadContracts(companyId);
  };

  const saveRule = async (form: any) => {
    if (!selectedContract) return;
    if (!form.scope) { toast.error(T("Scope required", "النطاق مطلوب")); return; }
    const payload: any = {
      contract_id: selectedContract.id,
      scope: form.scope,
      target_id: form.scope === "item_type" ? null : (form.target_id || null),
      item_type: form.scope === "item_type" ? form.item_type : null,
      coverage_percent: form.excluded ? 0 : Math.max(0, Math.min(100, Number(form.coverage_percent) || 0)),
      max_amount_per_item: form.max_amount_per_item ? Number(form.max_amount_per_item) : null,
      excluded: !!form.excluded,
      priority: Number(form.priority) || 100,
    };
    if (payload.scope !== "item_type" && !payload.target_id) {
      toast.error(T("Target required for service/procedure rule", "هدف القاعدة مطلوب")); return;
    }
    if (payload.scope === "item_type" && !payload.item_type) {
      toast.error(T("Item type required", "نوع البند مطلوب")); return;
    }
    const { error } = ruleDialog.row
      ? await (supabase as any).from("insurance_contract_rules").update(payload).eq("id", ruleDialog.row.id)
      : await (supabase as any).from("insurance_contract_rules").insert(payload);
    if (error) { toast.error(error.message); return; }
    setRuleDialog({ open: false, row: null });
    toast.success(T("Saved", "تم الحفظ"));
    const { data } = await (supabase as any).from("insurance_contract_rules")
      .select("*").eq("contract_id", selectedContract.id).order("priority").order("created_at");
    setRules((data as any) ?? []);
  };

  const removeRule = async (id: string) => {
    if (!confirm(T("Delete rule?", "حذف القاعدة؟"))) return;
    const { error } = await (supabase as any).from("insurance_contract_rules").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRules((arr) => arr.filter((r) => r.id !== id));
  };

  const ruleTargetLabel = (r: Rule) => {
    if (r.scope === "item_type") return r.item_type;
    const list = r.scope === "service" ? services : procedures;
    const x = list.find((p) => p.id === r.target_id);
    return x ? (isAr ? (x.name_ar || x.name_en) : x.name_en) : (r.target_id ? r.target_id.slice(0, 8) + "…" : "—");
  };

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FileSignature className="size-5 text-primary" />
            <h1 className="text-2xl font-bold">{T("Insurance Contracts", "عقود التأمين")}</h1>
          </div>
          <div className="flex items-center gap-2 min-w-[260px]">
            <Label className="text-xs text-muted-foreground shrink-0">{T("Company", "الشركة")}</Label>
            <Combobox
              value={companyId}
              onChange={(v) => setCompanyId(v)}
              options={companies.map((c) => ({ value: c.id, label: isAr ? (c.name_ar || c.name_en) : c.name_en }))}
              placeholder={T("Select company…", "اختر شركة…")}
              searchPlaceholder={T("Search…", "بحث…")}
              emptyText={T("No companies", "لا توجد شركات")}
            />
          </div>
        </div>

        {!companyId ? (
          <Card className="p-8 text-center text-muted-foreground">
            {T("Select an insurance company to manage its contracts.", "اختر شركة تأمين لإدارة عقودها.")}
          </Card>
        ) : (
          <div className="grid lg:grid-cols-[320px_1fr] gap-4">
            <Card className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{T("Contracts", "العقود")}</div>
                {isAdmin && (
                  <Button size="sm" variant="outline" onClick={() => setContractDialog({ open: true, row: null })}>
                    <Plus className="me-1 size-4" />{T("New", "جديد")}
                  </Button>
                )}
              </div>
              <div className="divide-y divide-border">
                {contracts.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-6 text-center">{T("No contracts yet", "لا توجد عقود")}</div>
                ) : contracts.map((c) => (
                  <button key={c.id} type="button" onClick={() => setSelectedContract(c)}
                    className={`w-full text-start py-2 px-2 rounded-md hover:bg-muted/50 ${selectedContract?.id === c.id ? "bg-muted" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium flex-1 truncate">{isAr ? (c.name_ar || c.name_en) : c.name_en}</span>
                      <Badge variant="outline" className="text-[10px]">{c.default_coverage_percent}%</Badge>
                      {c.is_active ? <span className="size-2 rounded-full bg-success" /> : <span className="size-2 rounded-full bg-muted-foreground/40" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {c.valid_from || "—"} → {c.valid_to || "∞"}
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-4 space-y-4">
              {!selectedContract ? (
                <div className="text-center text-muted-foreground py-10 text-sm">{T("Pick or create a contract.", "اختر عقداً أو أنشئ واحداً.")}</div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="text-lg font-bold">{isAr ? (selectedContract.name_ar || selectedContract.name_en) : selectedContract.name_en}</div>
                      <div className="text-xs text-muted-foreground">
                        {T("Default", "افتراضي")}: {selectedContract.default_coverage_percent}% ·
                        {" "}{selectedContract.valid_from || "—"} → {selectedContract.valid_to || "∞"} ·
                        {" "}{selectedContract.is_active ? T("Active", "نشط") : T("Inactive", "متوقف")}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setContractDialog({ open: true, row: selectedContract })}><Pencil className="size-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeContract(selectedContract.id)}><Trash2 className="size-4" /></Button>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold">{T("Coverage rules", "قواعد التغطية")}</div>
                      {isAdmin && (
                        <Button size="sm" variant="outline" onClick={() => setRuleDialog({ open: true, row: null })}>
                          <ListPlus className="me-1 size-4" />{T("Add rule", "إضافة قاعدة")}
                        </Button>
                      )}
                    </div>
                    {rules.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-6 text-center">
                        {T("No rules. Lines will use the contract default percent.", "لا توجد قواعد. ستُستخدم النسبة الافتراضية للعقد.")}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-xs text-muted-foreground">
                            <tr className="border-b border-border">
                              <th className="text-start py-1.5 pr-2">{T("Scope", "النطاق")}</th>
                              <th className="text-start py-1.5 pr-2">{T("Target", "الهدف")}</th>
                              <th className="text-end py-1.5 pr-2">{T("Coverage", "التغطية")}</th>
                              <th className="text-end py-1.5 pr-2">{T("Cap / item", "حد البند")}</th>
                              <th className="text-end py-1.5 pr-2">{T("Priority", "الأولوية")}</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rules.map((r) => (
                              <tr key={r.id} className="border-b border-border last:border-0">
                                <td className="py-1.5 pr-2"><Badge variant="outline" className="text-[10px]">{r.scope}</Badge></td>
                                <td className="py-1.5 pr-2">{ruleTargetLabel(r)}</td>
                                <td className="py-1.5 pr-2 text-end tabular-nums">
                                  {r.excluded
                                    ? <Badge variant="outline" className="text-[10px] text-destructive border-destructive"><Ban className="me-1 size-3" />{T("Excluded", "مستثناة")}</Badge>
                                    : `${r.coverage_percent}%`}
                                </td>
                                <td className="py-1.5 pr-2 text-end tabular-nums">{r.max_amount_per_item ?? "—"}</td>
                                <td className="py-1.5 pr-2 text-end tabular-nums">{r.priority}</td>
                                <td className="text-end">
                                  {isAdmin && (
                                    <>
                                      <Button size="icon" variant="ghost" onClick={() => setRuleDialog({ open: true, row: r })}><Pencil className="size-4" /></Button>
                                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeRule(r.id)}><Trash2 className="size-4" /></Button>
                                    </>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-2">
                      {T("Resolution: exact service/procedure → item type → contract default. Excluded always wins.",
                         "الترتيب: الخدمة/الإجراء الدقيق ← نوع البند ← افتراضي العقد. الاستثناء يفوز دائماً.")}
                    </p>
                  </div>
                </>
              )}
            </Card>
          </div>
        )}
      </div>

      <ContractDialog
        open={contractDialog.open}
        initial={contractDialog.row}
        onCancel={() => setContractDialog({ open: false, row: null })}
        onSave={saveContract}
        T={T}
        t={t}
      />
      <RuleDialog
        open={ruleDialog.open}
        initial={ruleDialog.row}
        services={services}
        procedures={procedures}
        onCancel={() => setRuleDialog({ open: false, row: null })}
        onSave={saveRule}
        T={T}
        t={t}
        isAr={isAr}
      />
    </SettingsLayout>
  );
}

function ContractDialog({ open, initial, onCancel, onSave, T, t }: any) {
  const [form, setForm] = useState<any>({ default_coverage_percent: 80, is_active: true });
  useEffect(() => {
    if (open) setForm(initial ?? { default_coverage_percent: 80, is_active: true });
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? T("Edit contract", "تعديل العقد") : T("New contract", "عقد جديد")}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label>{T("Name (EN)", "الاسم (EN)")}</Label><Input value={form.name_en ?? ""} onChange={(e) => setForm({ ...form, name_en: e.target.value })} maxLength={150} /></div>
          <div className="space-y-1"><Label>{T("Name (AR)", "الاسم (AR)")}</Label><Input dir="rtl" value={form.name_ar ?? ""} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} maxLength={150} /></div>
          <div className="space-y-1"><Label>{T("Valid from", "صالح من")}</Label><Input type="date" value={form.valid_from ?? ""} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></div>
          <div className="space-y-1"><Label>{T("Valid to", "صالح حتى")}</Label><Input type="date" value={form.valid_to ?? ""} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></div>
          <div className="space-y-1"><Label>{T("Default coverage %", "نسبة افتراضية %")}</Label><Input type="number" min={0} max={100} value={form.default_coverage_percent ?? 0} onChange={(e) => setForm({ ...form, default_coverage_percent: e.target.value })} /></div>
          <div className="space-y-1"><Label>{T("Active", "نشط")}</Label><div className="pt-2"><Switch checked={!!form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div></div>
          <div className="space-y-1 sm:col-span-2"><Label>{t("notes")}</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t("cancel")}</Button>
          <Button onClick={() => onSave(form)} className="gradient-primary text-primary-foreground">{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDialog({ open, initial, services, procedures, onCancel, onSave, T, t, isAr }: any) {
  const [form, setForm] = useState<any>({ scope: "service", coverage_percent: 100, priority: 100, excluded: false });
  useEffect(() => {
    if (open) setForm(initial ?? { scope: "service", coverage_percent: 100, priority: 100, excluded: false });
  }, [open, initial]);

  const targetOptions = useMemo(() => {
    const list = form.scope === "service" ? services : form.scope === "procedure" ? procedures : [];
    return list.map((x: any) => ({ value: x.id, label: isAr ? (x.name_ar || x.name_en) : x.name_en }));
  }, [form.scope, services, procedures, isAr]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? T("Edit rule", "تعديل قاعدة") : T("New rule", "قاعدة جديدة")}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{T("Scope", "النطاق")}</Label>
            <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v, target_id: null, item_type: null })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="service">{T("Specific service", "خدمة محددة")}</SelectItem>
                <SelectItem value="procedure">{T("Specific procedure", "إجراء محدد")}</SelectItem>
                <SelectItem value="item_type">{T("Whole item type", "نوع البند كاملاً")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.scope === "item_type" ? (
            <div className="space-y-1">
              <Label>{T("Item type", "نوع البند")}</Label>
              <Select value={form.item_type ?? ""} onValueChange={(v) => setForm({ ...form, item_type: v })}>
                <SelectTrigger><SelectValue placeholder={T("Pick…", "اختر…")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">{T("Service", "خدمة")}</SelectItem>
                  <SelectItem value="product">{T("Product", "منتج")}</SelectItem>
                  <SelectItem value="procedure">{T("Procedure", "إجراء")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1 sm:col-span-1">
              <Label>{T("Target", "الهدف")}</Label>
              <Combobox
                value={form.target_id ?? ""}
                onChange={(v) => setForm({ ...form, target_id: v })}
                options={targetOptions}
                placeholder={T("Pick target…", "اختر الهدف…")}
                searchPlaceholder={T("Search…", "بحث…")}
                emptyText={T("None", "لا يوجد")}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label>{T("Coverage %", "نسبة التغطية %")}</Label>
            <Input type="number" min={0} max={100} disabled={!!form.excluded}
              value={form.coverage_percent ?? 0}
              onChange={(e) => setForm({ ...form, coverage_percent: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{T("Max per item", "حد أقصى للبند")}</Label>
            <Input type="number" min={0} step="0.01" value={form.max_amount_per_item ?? ""}
              onChange={(e) => setForm({ ...form, max_amount_per_item: e.target.value })}
              placeholder={T("Optional", "اختياري")} />
          </div>
          <div className="space-y-1">
            <Label>{T("Priority (lower wins)", "الأولوية (الأقل يفوز)")}</Label>
            <Input type="number" min={0} value={form.priority ?? 100}
              onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{T("Excluded (0%)", "مستثناة (0%)")}</Label>
            <div className="pt-2"><Switch checked={!!form.excluded} onCheckedChange={(v) => setForm({ ...form, excluded: v })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t("cancel")}</Button>
          <Button onClick={() => onSave(form)} className="gradient-primary text-primary-foreground">{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}