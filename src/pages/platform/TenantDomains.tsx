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
type RecordItem = { type?: string; name?: string; value?: string; url?: string; purpose?: string };
type Domain = { id: string; tenant_id: string; hostname: string; default_branch_id: string | null; status: string; validation_method: string; validation_records: RecordItem[]; cname_target: string | null; hostname_status: string | null; ssl_status: string | null; is_enabled: boolean; verified_at: string | null; last_checked_at: string | null; last_error: string | null; created_at: string };

type Props = { tenant: Tenant | null; branches: Branch[]; open: boolean; onOpenChange: (open: boolean) => void };

export default function TenantDomains({ tenant, branches, open, onOpenChange }: Props) {
  const { lang } = useI18n();
  const { toast } = useToast();
  const isAr = lang === "ar";
  const [domains, setDomains] = useState<Domain[]>([]);
  const [hostname, setHostname] = useState("");
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const createKeyRef = useRef<string | null>(null);

  const tenantBranches = branches.filter((branch) => branch.tenant_id === tenant?.id && branch.is_active);

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

  useEffect(() => { if (open && tenant) void load(); }, [open, tenant, load]);

  const add = async () => {
    if (!tenant || !hostname.trim()) { toast({ title: isAr ? "أدخل الدومين أولًا" : "Enter a hostname first", variant: "destructive" }); return; }
    setAdding(true);
    createKeyRef.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await invoke({ action: "create", tenant_id: tenant.id, hostname: hostname.trim(), default_branch_id: branchId || (tenantBranches[0]?.id ?? null), validation_method: "txt", idempotency_key: createKeyRef.current });
      toast({ title: isAr ? "تم تسجيل الدومين" : "Domain registered", description: isAr ? "أضف سجلات DNS الظاهرة ثم اضغط فحص الحالة." : "Add the DNS records shown below, then check status." });
      setHostname("");
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
        <section className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <div className="space-y-1.5"><Label>{isAr ? "الدومين" : "Hostname"}</Label><Input dir="ltr" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="portal.client.com" /></div>
          <div className="space-y-1.5"><Label>{isAr ? "الفرع الافتراضي" : "Default branch"}</Label><Select value={branchId || (tenantBranches[0]?.id ?? "none")} onValueChange={(value) => setBranchId(value === "none" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{tenantBranches.length === 0 ? <SelectItem value="none">{isAr ? "لا يوجد فرع نشط" : "No active branch"}</SelectItem> : tenantBranches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{isAr ? branch.name_ar || branch.name_en : branch.name_en || branch.name_ar}</SelectItem>)}</SelectContent></Select></div>
          <Button onClick={() => void add()} disabled={adding || tenantBranches.length === 0}>{adding ? <Loader2 className="me-2 size-4 animate-spin" /> : <Plus className="me-2 size-4" />}{isAr ? "إضافة" : "Add domain"}</Button>
        </section>

        {loading ? <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" />{isAr ? "جارٍ تحميل الدومينات…" : "Loading domains…"}</div> : domains.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{isAr ? "لا توجد دومينات لهذا العميل." : "No domains are registered for this tenant."}</div> : <div className="space-y-4">{domains.map((domain) => <div key={domain.id} className="space-y-4 rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><Globe2 className="size-4 text-primary" /><span dir="ltr">{domain.hostname}</span></div><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant={domain.status === "active" ? "default" : domain.status === "disabled" ? "secondary" : "outline"}>{domain.status}</Badge><span>hostname: {domain.hostname_status ?? "—"}</span><span>SSL: {domain.ssl_status ?? "—"}</span></div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void action(domain, "status")} disabled={busy !== null}>{busy === `status:${domain.id}` ? <Loader2 className="me-1 size-3.5 animate-spin" /> : <RefreshCw className="me-1 size-3.5" />}{isAr ? "فحص" : "Check status"}</Button>{domain.is_enabled ? <Button size="sm" variant="outline" onClick={() => void action(domain, "disable")} disabled={busy !== null}>{isAr ? "تعطيل" : "Disable"}</Button> : null}<Button size="sm" variant="ghost" className="text-destructive" onClick={() => void action(domain, "remove")} disabled={busy !== null}><Trash2 className="me-1 size-3.5" />{isAr ? "حذف" : "Remove"}</Button></div></div>
          {domain.status === "active" ? <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" />{isAr ? "الدومين جاهز للاستخدام" : "Domain is ready"}</div> : <div className="space-y-3 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/20"><div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300"><XCircle className="size-4" />{isAr ? "أكمل تحقق DNS ثم أعد الفحص" : "Complete DNS validation, then check again"}</div>{domain.cname_target ? <DnsRow label={isAr ? "CNAME للـSaaS target" : "CNAME to SaaS target"} name={domain.hostname} value={domain.cname_target} onCopy={copy} /> : null}{domain.validation_records.map((record, index) => <DnsRow key={`${domain.id}-${index}`} label={record.type === "http" ? "HTTP validation" : "TXT validation"} name={record.name ?? record.url ?? "—"} value={record.value ?? "—"} onCopy={copy} />)}</div>}
        </div>)}</div>}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{isAr ? "إغلاق" : "Close"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function DnsRow({ label, name, value, onCopy }: { label: string; name: string; value: string; onCopy: (value: string) => void }) {
  return <div className="grid gap-1 text-xs sm:grid-cols-[130px_1fr_1fr_auto] sm:items-center"><span className="font-medium">{label}</span><code dir="ltr" className="break-all rounded bg-background px-2 py-1">{name}</code><code dir="ltr" className="break-all rounded bg-background px-2 py-1">{value}</code><Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => void onCopy(value)} aria-label="Copy"><Copy className="size-3.5" /></Button></div>;
}
