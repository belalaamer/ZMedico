import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Globe2, Loader2, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Tenant = { id: string; name: string };
type Branch = { id: string; name_en: string; name_ar: string; tenant_id?: string | null; is_active: boolean };
type RecordItem = { type?: string; name?: string; value?: string; url?: string; purpose?: string; txt_name?: string; txt_value?: string };
type ProvisioningMode = "custom_hostname" | "provider_subdomain";
type Domain = { id: string; tenant_id: string; hostname: string; default_branch_id: string | null; status: string; validation_method: string; validation_records: RecordItem[]; cname_target: string | null; hostname_status: string | null; ssl_status: string | null; is_enabled: boolean; verified_at: string | null; last_checked_at: string | null; last_error: string | null; provisioning_mode: ProvisioningMode; created_at: string };

const ZMEDICO_SUBDOMAIN_SUFFIX = "belalaamer.com";

type Props = { tenant: Tenant | null; branches: Branch[]; open: boolean; onOpenChange: (open: boolean) => void };
type PlatformChangePayload = { tenant_id: string; category: "domains"; action: string; summary: string; after_values?: Record<string, unknown> };

export default function TenantDomains({ tenant, branches, open, onOpenChange }: Props) {
  const { lang } = useI18n();
  const { toast } = useToast();
  const isAr = lang === "ar";
  const [domains, setDomains] = useState<Domain[]>([]);
  const [hostname, setHostname] = useState("");
  const [subdomainSlug, setSubdomainSlug] = useState("");
  const [provisioningMode, setProvisioningMode] = useState<ProvisioningMode>("provider_subdomain");
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const createKeyRef = useRef<string | null>(null);

  const tenantBranches = branches.filter((branch) => branch.tenant_id === tenant?.id && branch.is_active);

  const logChange = async (payload: PlatformChangePayload) => {
    const { error } = await supabase.rpc("platform_log_change" as never, { payload } as never);
    if (error && import.meta.env.DEV) console.warn("[Platform] domain change log unavailable", error.message);
  };

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    if (import.meta.env.DEV) {
      const result = await supabase.functions.invoke("manage-custom-domain", { body });
      if (result.error) throw new Error(result.error.message || (isAr ? "تعذر الاتصال بخدمة الدومينات" : "Unable to contact domain service"));
      const payload = result.data as { error?: string };
      if (payload?.error) throw new Error(payload.error);
      return result.data as { domains?: Domain[]; domain?: Domain; ok?: boolean };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error(isAr ? "انتهت جلسة الدخول، سجل الدخول مرة أخرى" : "Your session has expired; sign in again");
    const response = await fetch("/api/domains", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        ...(body.idempotency_key ? { "X-Idempotency-Key": String(body.idempotency_key) } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok || payload.error) throw new Error(payload.error || (isAr ? "تعذر الاتصال بخدمة الدومينات" : "Unable to contact domain service"));
    return payload as { domains?: Domain[]; domain?: Domain; ok?: boolean };
  }, [isAr]);

  const load = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const result = await invoke({ action: "list", tenant_id: tenant.id });
      setDomains(result.domains ?? []);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setLoading(false); }
  }, [invoke, tenant, toast]);

  useEffect(() => {
    if (open && tenant) {
      setBranchId("");
      void load();
    }
  }, [open, tenant, load]);

  const add = async () => {
    const value = provisioningMode === "provider_subdomain" ? subdomainSlug.trim() : hostname.trim();
    if (!tenant || !value) { toast({ title: provisioningMode === "provider_subdomain" ? (isAr ? "أدخل اسم الـSubdomain أولًا" : "Enter a subdomain slug first") : (isAr ? "أدخل الدومين أولًا" : "Enter a hostname first"), variant: "destructive" }); return; }
    if (!branchId) { toast({ title: isAr ? "اختر الفرع الافتراضي أولًا" : "Choose the default branch first", variant: "destructive" }); return; }
    const selectedBranch = tenantBranches.find((branch) => branch.id === branchId);
    const finalHostname = provisioningMode === "provider_subdomain" ? `${value}.${ZMEDICO_SUBDOMAIN_SUFFIX}` : value;
    const confirmation = isAr
      ? `سيتم تسجيل ${finalHostname} للعميل ${tenant.name} وربطه بالفرع ${selectedBranch?.name_ar || selectedBranch?.name_en || "المحدد"}. هل تريد المتابعة؟`
      : `Register ${finalHostname} for ${tenant.name} and map it to ${selectedBranch?.name_en || selectedBranch?.name_ar || "the selected branch"}?`;
    if (!window.confirm(confirmation)) return;
    setAdding(true);
    createKeyRef.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await invoke({ action: provisioningMode === "provider_subdomain" ? "create_subdomain" : "create", tenant_id: tenant.id, ...(provisioningMode === "provider_subdomain" ? { subdomain_slug: value } : { hostname: value, validation_method: "txt" }), default_branch_id: branchId, idempotency_key: createKeyRef.current });
      toast({ title: provisioningMode === "provider_subdomain" ? (isAr ? "تم إنشاء Subdomain العيادة" : "Clinic subdomain created") : (isAr ? "تم تسجيل الدومين" : "Domain registered"), description: provisioningMode === "provider_subdomain" ? `${value}.${ZMEDICO_SUBDOMAIN_SUFFIX}` : (isAr ? "أضف سجلات DNS الظاهرة ثم اضغط فحص الحالة." : "Add the DNS records shown below, then check status.") });
      void logChange({ tenant_id: tenant.id, category: "domains", action: "create", summary: provisioningMode === "provider_subdomain" ? (isAr ? `تم إنشاء Subdomain ${value}` : `Subdomain ${value} created`) : (isAr ? `تم تسجيل الدومين ${value}` : `Domain ${value} registered`), after_values: { provisioning_mode: provisioningMode, hostname: provisioningMode === "provider_subdomain" ? `${value}.${ZMEDICO_SUBDOMAIN_SUFFIX}` : value } });
      setHostname("");
      setSubdomainSlug("");
      createKeyRef.current = null;
      await load();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setAdding(false); }
  };

  const action = async (domain: Domain, name: "status" | "disable" | "remove") => {
    if (name === "remove" && !window.confirm(isAr ? `حذف ${domain.hostname} نهائيًا؟` : `Remove ${domain.hostname} permanently?`)) return;
    setBusy(`${name}:${domain.id}`);
    try {
      await invoke({ action: name, domain_id: domain.id });
      toast({ title: name === "status" ? (isAr ? "تم تحديث الحالة" : "Status refreshed") : (isAr ? "تم تحديث الدومين" : "Domain updated") });
      void logChange({ tenant_id: domain.tenant_id, category: "domains", action: name, summary: name === "status" ? (isAr ? `تم فحص حالة ${domain.hostname}` : `${domain.hostname} status checked`) : (isAr ? `تم تنفيذ ${name} على ${domain.hostname}` : `${name} applied to ${domain.hostname}`), after_values: { hostname: domain.hostname } });
      await load();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const copy = async (value: string) => {
    await navigator.clipboard?.writeText(value);
    toast({ title: isAr ? "تم النسخ" : "Copied" });
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}>
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Globe2 className="size-5 text-primary" />{isAr ? "الدومينات المخصصة" : "Custom domains"} · {tenant?.name}</DialogTitle><p className="text-sm text-muted-foreground">{isAr ? "اربط دومين العميل بعد تفعيل Cloudflare for SaaS. لن يظهر Active قبل نجاح hostname وSSL." : "Connect the tenant domain after Cloudflare for SaaS is configured. It will not become Active until hostname and SSL are active."}</p></DialogHeader>

      <div className="space-y-5">
          <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div className="space-y-1.5"><Label>{isAr ? "طريقة الربط" : "Connection type"}</Label><Select value={provisioningMode} onValueChange={(value) => setProvisioningMode(value as ProvisioningMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="provider_subdomain">{isAr ? "Subdomain من ZMedico (فوري)" : "ZMedico subdomain (instant)"}</SelectItem><SelectItem value="custom_hostname">{isAr ? "دومين العميل (Cloudflare for SaaS)" : "Customer domain (Cloudflare for SaaS)"}</SelectItem></SelectContent></Select></div>
          {provisioningMode === "provider_subdomain" ? <div className="rounded-lg bg-emerald-50 p-3 text-xs leading-6 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200"><p className="font-semibold">{isAr ? "الطريقة الأسهل — بدون إعداد DNS عند العميل" : "Easiest option — no customer DNS setup"}</p><p>{isAr ? `اكتب اسمًا مثل blitz-physio وسيصبح ${`blitz-physio.${ZMEDICO_SUBDOMAIN_SUFFIX}`} جاهزًا تلقائيًا بعد الإنشاء.` : `Enter a slug such as blitz-physio and ${`blitz-physio.${ZMEDICO_SUBDOMAIN_SUFFIX}`} will be ready automatically after creation.`}</p></div> : <div className="rounded-lg bg-blue-50 p-3 text-xs leading-6 text-blue-950 dark:bg-blue-950/20 dark:text-blue-100"><p className="font-semibold">{isAr ? "خطوات ربط دومين العميل" : "Customer-domain connection steps"}</p><ol className="list-decimal space-y-0.5 ps-5"><li>{isAr ? "استخدم Subdomain مثل www.client.com، وليس الدومين الجذري فقط." : "Use a subdomain such as www.client.com, not the root domain alone."}</li><li>{isAr ? "اضغط Add domain ثم انسخ سجلات DNS التي تظهر." : "Click Add domain, then copy the DNS records shown."}</li><li>{isAr ? "أضف CNAME للـSaaS وسجل CNAME الخاص بتجديد SSL أو سجلات TXT التي تظهر عند الحاجة." : "Add the SaaS CNAME and the SSL-renewal CNAME or TXT records shown."}</li><li>{isAr ? "لا تضف https كسجل DNS، ثم اضغط Check status." : "Do not add https as a DNS record, then click Check status."}</li></ol></div>}
          <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <div className="space-y-1.5"><Label>{provisioningMode === "provider_subdomain" ? (isAr ? "اسم الـSubdomain" : "Subdomain slug") : (isAr ? "الدومين" : "Hostname")}</Label>{provisioningMode === "provider_subdomain" ? <div className="flex items-center gap-2"><Input dir="ltr" value={subdomainSlug} onChange={(e) => setSubdomainSlug(e.target.value)} placeholder="blitz-physio" /><span dir="ltr" className="shrink-0 text-xs text-muted-foreground">.{ZMEDICO_SUBDOMAIN_SUFFIX}</span></div> : <Input dir="ltr" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="portal.client.com" />}</div>
          <div className="space-y-1.5"><Label>{isAr ? "الفرع الافتراضي" : "Default branch"}</Label><Select value={branchId || "none"} onValueChange={(value) => setBranchId(value === "none" ? "" : value)}><SelectTrigger><SelectValue placeholder={isAr ? "اختر الفرع" : "Choose branch"} /></SelectTrigger><SelectContent><SelectItem value="none">{isAr ? "اختر الفرع" : "Choose a branch"}</SelectItem>{tenantBranches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{isAr ? branch.name_ar || branch.name_en : branch.name_en || branch.name_ar}</SelectItem>)}</SelectContent></Select></div>
          <Button onClick={() => void add()} disabled={adding || tenantBranches.length === 0 || !branchId}>{adding ? <Loader2 className="me-2 size-4 animate-spin" /> : <Plus className="me-2 size-4" />}{provisioningMode === "provider_subdomain" ? (isAr ? "إنشاء Subdomain" : "Create subdomain") : (isAr ? "إضافة" : "Add domain")}</Button>
          </div>
        </section>

        {loading ? <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" />{isAr ? "جارٍ تحميل الدومينات…" : "Loading domains…"}</div> : domains.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{isAr ? "لا توجد دومينات لهذا العميل." : "No domains are registered for this tenant."}</div> : <div className="space-y-4">{domains.map((domain) => <div key={domain.id} className="space-y-4 rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><Globe2 className="size-4 text-primary" /><span dir="ltr">{domain.hostname}</span></div><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant={domain.status === "active" ? "default" : domain.status === "disabled" ? "secondary" : "outline"}>{domain.status}</Badge><Badge variant="outline">{domain.provisioning_mode === "provider_subdomain" ? (isAr ? "ZMedico Subdomain" : "ZMedico subdomain") : (isAr ? "Cloudflare SaaS" : "Cloudflare SaaS")}</Badge><span>hostname: {domain.hostname_status ?? "—"}</span><span>SSL: {domain.ssl_status ?? "—"}</span></div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void action(domain, "status")} disabled={busy !== null}>{busy === `status:${domain.id}` ? <Loader2 className="me-1 size-3.5 animate-spin" /> : <RefreshCw className="me-1 size-3.5" />}{isAr ? "فحص" : "Check status"}</Button>{domain.is_enabled ? <Button size="sm" variant="outline" onClick={() => void action(domain, "disable")} disabled={busy !== null}>{isAr ? "تعطيل" : "Disable"}</Button> : null}<Button size="sm" variant="ghost" className="text-destructive" onClick={() => void action(domain, "remove")} disabled={busy !== null}><Trash2 className="me-1 size-3.5" />{isAr ? "حذف" : "Remove"}</Button></div></div>
          {domain.status === "active" ? <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" />{domain.provisioning_mode === "provider_subdomain" ? (isAr ? "Subdomain جاهز للاستخدام فورًا" : "Subdomain is ready to use") : (isAr ? "الدومين جاهز للاستخدام" : "Domain is ready")}</div> : <div className="space-y-3 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/20"><div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300"><XCircle className="size-4" />{domain.provisioning_mode === "provider_subdomain" ? (isAr ? "أعد الفحص للتأكد من حالة Subdomain" : "Check the subdomain status again") : (isAr ? "أكمل تحقق DNS ثم أعد الفحص" : "Complete DNS validation, then check again")}</div>{domain.provisioning_mode === "custom_hostname" ? <p className="text-xs text-amber-800 dark:text-amber-300">{isAr ? "لا تضف https:// كسجل DNS. HTTPS يتم تفعيله تلقائيًا بعد نجاح CNAME وTXT وإصدار شهادة SSL." : "Do not add https:// as a DNS record. HTTPS becomes active automatically after CNAME/TXT validation and SSL issuance."}</p> : null}          {domain.cname_target ? <DnsRow label={isAr ? "CNAME للـSaaS target" : "CNAME to SaaS target"} name={domain.hostname} value={domain.cname_target} onCopy={copy} /> : null}{domain.validation_records.map((record, index) => { const recordName = record.name ?? record.txt_name ?? record.url ?? "—"; const recordValue = record.value ?? record.txt_value ?? "—"; const label = record.type === "http" ? (isAr ? "تحقق HTTP (ليس DNS)" : "HTTP validation (not DNS)") : record.purpose === "ssl_dcv" ? (isAr ? "CNAME لتجديد SSL تلقائيًا" : "CNAME for automatic SSL renewal") : (record.purpose === "ssl" || record.txt_name) ? (isAr ? "TXT لشهادة SSL" : "SSL TXT validation") : (isAr ? "TXT للتحقق" : "TXT validation"); return <DnsRow key={`${domain.id}-${index}`} label={label} name={recordName} value={recordValue} onCopy={copy} />; })}</div>}
        </div>)}</div>}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{isAr ? "إغلاق" : "Close"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function DnsRow({ label, name, value, onCopy }: { label: string; name: string; value: string; onCopy: (value: string) => void }) {
  return <div className="grid gap-1 text-xs sm:grid-cols-[130px_1fr_1fr_auto] sm:items-center"><span className="font-medium">{label}</span><code dir="ltr" className="break-all rounded bg-background px-2 py-1">{name}</code><code dir="ltr" className="break-all rounded bg-background px-2 py-1">{value}</code><Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => void onCopy(value)} aria-label="Copy"><Copy className="size-3.5" /></Button></div>;
}
