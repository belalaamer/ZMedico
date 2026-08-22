import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Link2, Loader2, RefreshCw, ShieldCheck, Unplug, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Connection = {
  id: string;
  branch_id: string;
  provider: string;
  ad_account_id: string;
  business_id: string | null;
  currency: string;
  timezone: string;
  api_version: string;
  status: "configured" | "connected" | "needs_reauth" | "error" | "disconnected";
  token_configured: boolean;
  last_tested_at: string | null;
  last_successful_sync_at: string | null;
  last_attempted_sync_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
};

type FunctionResponse = { connection?: Connection; ok?: boolean; rows?: number; error?: string };

type FormState = {
  ad_account_id: string;
  business_id: string;
  currency: string;
  timezone: string;
  api_version: string;
  access_token: string;
};

const INITIAL_FORM: FormState = { ad_account_id: "", business_id: "", currency: "EGP", timezone: "Africa/Cairo", api_version: "v20.0", access_token: "" };

function statusLabel(status: Connection["status"], isArabic: boolean) {
  const labels: Record<Connection["status"], [string, string]> = {
    configured: ["تم الحفظ — يحتاج اختبار", "Saved — test required"],
    connected: ["متصل", "Connected"],
    needs_reauth: ["يحتاج إعادة التفويض", "Needs reauthorization"],
    error: ["خطأ في الاتصال", "Connection error"],
    disconnected: ["غير متصل", "Disconnected"],
  };
  return labels[status]?.[isArabic ? 0 : 1] ?? status;
}

function formatDate(value: string | null, isArabic: boolean) {
  if (!value) return isArabic ? "لم يتم بعد" : "Not yet";
  return new Date(value).toLocaleString(isArabic ? "ar-EG" : "en-EG", { dateStyle: "medium", timeStyle: "short" });
}

export default function MetaAdsConnection() {
  const { lang } = useI18n();
  const { currentBranchId, branches } = useBranch();
  const isArabic = lang === "ar";
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const branchName = useMemo(() => {
    const branch = branches.find((item) => item.id === currentBranchId);
    return branch ? (isArabic ? branch.name_ar || branch.name_en : branch.name_en || branch.name_ar) : (isArabic ? "الفرع الحالي" : "Current branch");
  }, [branches, currentBranchId, isArabic]);

  const load = useCallback(async () => {
    if (!currentBranchId) {
      setConnection(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke<FunctionResponse>("meta-ads-connection", { body: { action: "get", branch_id: currentBranchId } });
    if (error || data?.error) {
      if (!String(data?.error ?? error?.message ?? "").includes("not found")) toast.error(data?.error ?? error?.message ?? (isArabic ? "تعذر تحميل إعدادات Meta" : "Unable to load Meta settings"));
      setConnection(null);
    } else if (data?.connection) {
      setConnection(data.connection);
      setForm((current) => ({ ...current, ad_account_id: data.connection?.ad_account_id ?? "", business_id: data.connection?.business_id ?? "", currency: data.connection?.currency ?? "EGP", timezone: data.connection?.timezone ?? "Africa/Cairo", api_version: data.connection?.api_version ?? "v20.0", access_token: "" }));
    }
    setLoading(false);
  }, [currentBranchId, isArabic]);

  useEffect(() => { void load(); }, [load]);

  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentBranchId || !form.ad_account_id.trim() || form.access_token.trim().length < 20) {
      toast.error(isArabic ? "أدخل Ad Account ID وToken صحيحًا" : "Enter a valid Ad Account ID and token");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<FunctionResponse>("meta-ads-connection", { body: { action: "save", branch_id: currentBranchId, ad_account_id: form.ad_account_id.trim(), business_id: form.business_id.trim() || null, currency: form.currency, timezone: form.timezone, api_version: form.api_version, access_token: form.access_token.trim() } });
    if (error || data?.error) toast.error(data?.error ?? error?.message ?? (isArabic ? "تعذر حفظ الاتصال" : "Unable to save connection"));
    else {
      setConnection(data?.connection ?? null);
      setForm((current) => ({ ...current, access_token: "" }));
      toast.success(isArabic ? "تم حفظ الاتصال بأمان" : "Connection saved securely");
    }
    setSaving(false);
  };

  const test = async () => {
    if (!connection || testing) return;
    setTesting(true);
    const { data, error } = await supabase.functions.invoke<FunctionResponse>("meta-ads-connection", { body: { action: "test", connection_id: connection.id, branch_id: connection.branch_id } });
    if (error || data?.error) {
      toast.error(data?.error ?? error?.message ?? (isArabic ? "فشل اختبار Meta" : "Meta test failed"));
      await load();
    } else {
      toast.success(isArabic ? `تم الاتصال بنجاح — ${data?.rows ?? 0} صف تجريبي` : `Connection succeeded — ${data?.rows ?? 0} sample rows`);
      setConnection((current) => current ? { ...current, status: "connected", last_tested_at: new Date().toISOString(), last_error_code: null, last_error_message: null } : current);
    }
    setTesting(false);
  };

  const disconnect = async () => {
    if (!connection || disconnecting) return;
    setDisconnecting(true);
    const { data, error } = await supabase.functions.invoke<FunctionResponse>("meta-ads-connection", { body: { action: "disconnect", connection_id: connection.id, branch_id: connection.branch_id } });
    if (error || data?.error) toast.error(data?.error ?? error?.message ?? (isArabic ? "تعذر فصل الاتصال" : "Unable to disconnect"));
    else { toast.success(isArabic ? "تم فصل Meta وحذف الـToken المشفر" : "Meta disconnected and encrypted token removed"); setConnection(null); setForm(INITIAL_FORM); }
    setDisconnecting(false);
  };

  return <div className="space-y-5" dir={isArabic ? "rtl" : "ltr"}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-primary"><Link2 className="size-4" />{isArabic ? "تكاملات التسويق" : "Marketing integrations"}</div><h2 className="text-xl font-bold">{isArabic ? "ربط Meta Ads" : "Meta Ads connection"}</h2><p className="mt-1 text-sm text-muted-foreground">{isArabic ? `إعداد مستقل للفرع: ${branchName}` : `Separate connection for: ${branchName}`}</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="me-2 size-4" />{isArabic ? "تحديث" : "Refresh"}</Button></div>

    <Card className="border-emerald-200 bg-emerald-50/60 p-4 shadow-none dark:border-emerald-900 dark:bg-emerald-950/20"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" /><div><p className="font-semibold text-emerald-950 dark:text-emerald-100">{isArabic ? "البيانات محمية" : "Your credentials stay protected"}</p><p className="mt-1 text-xs leading-5 text-emerald-900/80 dark:text-emerald-100/80">{isArabic ? "الـToken يُرسل إلى خدمة خلفية ويُحفظ مشفرًا. لن يظهر مرة أخرى في الشاشة ولن يصل إلى مستخدمي العيادة أو المتصفح." : "The token is sent to a backend service and stored encrypted. It is never shown again and is not exposed to clinic staff or the browser."}</p></div></div></Card>

    {!currentBranchId ? <Card className="p-8 text-center text-sm text-muted-foreground">{isArabic ? "اختر فرعًا أولًا" : "Choose a branch first"}</Card> : loading ? <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{isArabic ? "جارٍ تحميل إعدادات Meta…" : "Loading Meta settings…"}</Card> : <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <Card className="p-5 shadow-sm"><div className="mb-5"><h3 className="font-semibold">{isArabic ? "بيانات الحساب" : "Account details"}</h3><p className="mt-1 text-xs text-muted-foreground">{isArabic ? "كل فرع يمكنه استخدام حساب Meta مختلفًا." : "Each branch can use its own Meta account."}</p></div><form className="space-y-4" onSubmit={save}><div className="space-y-2"><Label htmlFor="meta-ad-account">Ad Account ID</Label><Input id="meta-ad-account" value={form.ad_account_id} onChange={(event) => update("ad_account_id", event.target.value)} placeholder="act_123456789" autoComplete="off" /></div><div className="space-y-2"><Label htmlFor="meta-business">Business ID <span className="text-muted-foreground">({isArabic ? "اختياري" : "optional"})</span></Label><Input id="meta-business" value={form.business_id} onChange={(event) => update("business_id", event.target.value)} placeholder="123456789012345" autoComplete="off" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="meta-currency">{isArabic ? "العملة" : "Currency"}</Label><Select value={form.currency} onValueChange={(value) => update("currency", value)}><SelectTrigger id="meta-currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EGP">EGP — Egyptian Pound</SelectItem><SelectItem value="USD">USD — US Dollar</SelectItem><SelectItem value="EUR">EUR — Euro</SelectItem><SelectItem value="SAR">SAR — Saudi Riyal</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="meta-timezone">{isArabic ? "المنطقة الزمنية" : "Timezone"}</Label><Input id="meta-timezone" value={form.timezone} onChange={(event) => update("timezone", event.target.value)} placeholder="Africa/Cairo" /></div></div><div className="space-y-2"><Label htmlFor="meta-version">Meta API version</Label><Input id="meta-version" value={form.api_version} onChange={(event) => update("api_version", event.target.value)} placeholder="v20.0" /></div><div className="space-y-2"><Label htmlFor="meta-token">Access Token</Label><Input id="meta-token" type="password" value={form.access_token} onChange={(event) => update("access_token", event.target.value)} placeholder={connection?.token_configured ? (isArabic ? "محفوظ — أدخل Token جديدًا للتدوير" : "Saved — enter a new token to rotate") : "Paste your System User token"} autoComplete="new-password" /><p className="text-[11px] text-muted-foreground">{isArabic ? "لن يتم عرض القيمة بعد الحفظ. استخدم Token بصلاحية ads_read فقط." : "The value will not be shown after saving. Use a token with ads_read only."}</p></div><Button type="submit" className="w-full" disabled={saving}>{saving ? <Loader2 className="me-2 size-4 animate-spin" /> : <KeyRound className="me-2 size-4" />}{saving ? (isArabic ? "جارٍ الحفظ…" : "Saving…") : (connection ? (isArabic ? "تدوير وحفظ Token جديد" : "Rotate and save token") : (isArabic ? "حفظ الاتصال" : "Save connection"))}</Button></form></Card>
      <Card className="p-5 shadow-sm"><div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="font-semibold">{isArabic ? "حالة الاتصال" : "Connection status"}</h3><p className="mt-1 text-xs text-muted-foreground">{isArabic ? "اختبر الاتصال قبل تشغيل المزامنة اليومية." : "Test the connection before enabling daily sync."}</p></div>{connection ? <Badge variant={connection.status === "connected" ? "default" : "secondary"}>{statusLabel(connection.status, isArabic)}</Badge> : <Badge variant="outline">{isArabic ? "غير مهيأ" : "Not configured"}</Badge>}</div>{connection ? <div className="space-y-4"><StatusRow label={isArabic ? "Ad Account" : "Ad Account"} value={connection.ad_account_id} /><StatusRow label={isArabic ? "Token" : "Token"} value={connection.token_configured ? (isArabic ? "محفوظ بشكل مشفر" : "Stored encrypted") : (isArabic ? "غير موجود" : "Not configured")} ok={connection.token_configured} /><StatusRow label={isArabic ? "آخر اختبار" : "Last tested"} value={formatDate(connection.last_tested_at, isArabic)} /><StatusRow label={isArabic ? "آخر مزامنة ناجحة" : "Last successful sync"} value={formatDate(connection.last_successful_sync_at, isArabic)} />{connection.last_error_message ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"><div className="mb-1 flex items-center gap-2 font-semibold"><XCircle className="size-4" />{isArabic ? "آخر خطأ" : "Last error"}</div><p>{connection.last_error_message}</p></div> : null}<div className="flex flex-wrap gap-2 pt-2"><Button onClick={() => void test()} disabled={testing || !connection.token_configured}>{testing ? <Loader2 className="me-2 size-4 animate-spin" /> : <CheckCircle2 className="me-2 size-4" />}{isArabic ? "اختبار الاتصال" : "Test connection"}</Button><Button variant="outline" onClick={() => void disconnect()} disabled={disconnecting}>{disconnecting ? <Loader2 className="me-2 size-4 animate-spin" /> : <Unplug className="me-2 size-4" />}{isArabic ? "فصل الاتصال" : "Disconnect"}</Button></div></div> : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{isArabic ? "لم يتم إعداد Meta Ads لهذا الفرع بعد." : "Meta Ads is not configured for this branch yet."}</div>}</Card>
    </div>}
  </div>;
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return <div className="flex items-center justify-between gap-3 border-b pb-3 text-sm last:border-b-0"><span className="text-muted-foreground">{label}</span><span className="flex items-center gap-2 text-end font-medium">{ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : null}{value}</span></div>;
}
