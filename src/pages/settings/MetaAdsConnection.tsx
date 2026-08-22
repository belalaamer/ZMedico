import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Link2, Loader2, Plus, RefreshCw, ShieldCheck, Unplug, XCircle } from "lucide-react";
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

type FunctionResponse = { connection?: Connection; connections?: Connection[]; ok?: boolean; rows?: number; error?: string };
type FormState = { ad_account_id: string; business_id: string; currency: string; timezone: string; api_version: string };
const INITIAL_FORM: FormState = { ad_account_id: "", business_id: "", currency: "EGP", timezone: "Africa/Cairo", api_version: "v20.0" };

async function functionErrorMessage(error: unknown, data: FunctionResponse | undefined, fallback: string) {
  if (data?.error) return data.error;
  const response = (error as { context?: Response } | null)?.context;
  if (response) {
    const body = await response.clone().json().catch(() => null) as FunctionResponse | null;
    if (body?.error) return body.error;
  }
  if (error instanceof Error && error.message && !error.message.includes("non-2xx")) return error.message;
  return fallback;
}

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
  const [connections, setConnections] = useState<Connection[]>([]);
  const [token, setToken] = useState("");
  const [tokenSource, setTokenSource] = useState<"new" | "saved">("new");
  const [reuseConnectionId, setReuseConnectionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const branchName = useMemo(() => {
    const branch = branches.find((item) => item.id === currentBranchId);
    return branch ? (isArabic ? branch.name_ar || branch.name_en : branch.name_en || branch.name_ar) : (isArabic ? "الفرع الحالي" : "Current branch");
  }, [branches, currentBranchId, isArabic]);

  const configuredConnections = useMemo(() => connections.filter((connection) => connection.token_configured), [connections]);

  const load = useCallback(async () => {
    if (!currentBranchId) { setConnections([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke<FunctionResponse>("meta-ads-connection", { body: { action: "list", branch_id: currentBranchId } });
    if (error || data?.error) {
      toast.error(await functionErrorMessage(error, data, isArabic ? "تعذر تحميل إعدادات Meta" : "Unable to load Meta settings"));
      setConnections([]);
    } else {
      const next = data?.connections ?? [];
      setConnections(next);
      setReuseConnectionId((current) => current && next.some((connection) => connection.id === current) ? current : next.find((connection) => connection.token_configured)?.id ?? "");
    }
    setLoading(false);
  }, [currentBranchId, isArabic]);

  useEffect(() => { void load(); }, [load]);

  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentBranchId || !form.ad_account_id.trim()) {
      toast.error(isArabic ? "أدخل Ad Account ID" : "Enter an Ad Account ID");
      return;
    }
    if (tokenSource === "new" && token.trim().length < 20) {
      toast.error(isArabic ? "أدخل Token صالحًا" : "Enter a valid token");
      return;
    }
    if (tokenSource === "saved" && !reuseConnectionId) {
      toast.error(isArabic ? "اختر Token محفوظًا لإعادة استخدامه" : "Choose a saved token to reuse");
      return;
    }
    setSaving(true);
    const body: Record<string, string | null> = { action: "save", branch_id: currentBranchId, ad_account_id: form.ad_account_id.trim(), business_id: form.business_id.trim() || null, currency: form.currency, timezone: form.timezone, api_version: form.api_version };
    if (tokenSource === "new" && token.trim()) body.access_token = token.trim();
    else body.reuse_connection_id = reuseConnectionId;
    const { data, error } = await supabase.functions.invoke<FunctionResponse>("meta-ads-connection", { body });
    if (error || data?.error) toast.error(await functionErrorMessage(error, data, isArabic ? "تعذر حفظ الحساب" : "Unable to save account"));
    else {
      toast.success(isArabic ? "تمت إضافة الحساب باستخدام Token العيادة" : "Ad account saved using the clinic token");
      setToken("");
      setForm(INITIAL_FORM);
      await load();
    }
    setSaving(false);
  };

  const test = async (connection: Connection) => {
    if (testingId) return;
    setTestingId(connection.id);
    const { data, error } = await supabase.functions.invoke<FunctionResponse>("meta-ads-connection", { body: { action: "test", connection_id: connection.id, branch_id: connection.branch_id } });
    if (error || data?.error) toast.error(await functionErrorMessage(error, data, isArabic ? "فشل اختبار Meta" : "Meta test failed"));
    else toast.success(isArabic ? `تم الاتصال — ${data?.rows ?? 0} صف تجريبي` : `Connected — ${data?.rows ?? 0} sample rows`);
    await load();
    setTestingId(null);
  };

  const disconnect = async (connection: Connection) => {
    if (disconnectingId) return;
    setDisconnectingId(connection.id);
    const { data, error } = await supabase.functions.invoke<FunctionResponse>("meta-ads-connection", { body: { action: "disconnect", connection_id: connection.id, branch_id: connection.branch_id } });
    if (error || data?.error) toast.error(await functionErrorMessage(error, data, isArabic ? "تعذر فصل الحساب" : "Unable to disconnect account"));
    else toast.success(isArabic ? "تم فصل الحساب وحذف Token هذا السجل" : "Account disconnected and its token removed");
    await load();
    setDisconnectingId(null);
  };

  return <div className="space-y-5" dir={isArabic ? "rtl" : "ltr"}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-primary"><Link2 className="size-4" />{isArabic ? "تكاملات التسويق" : "Marketing integrations"}</div><h2 className="text-xl font-bold">{isArabic ? "حسابات Meta Ads" : "Meta Ads accounts"}</h2><p className="mt-1 text-sm text-muted-foreground">{isArabic ? `إدارة عدة حسابات للفرع: ${branchName}` : `Manage multiple accounts for: ${branchName}`}</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="me-2 size-4" />{isArabic ? "تحديث" : "Refresh"}</Button></div>

    <Card className="border-emerald-200 bg-emerald-50/60 p-4 shadow-none dark:border-emerald-900 dark:bg-emerald-950/20"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" /><div><p className="font-semibold text-emerald-950 dark:text-emerald-100">{isArabic ? "Token واحد لعدة حسابات" : "One token for multiple accounts"}</p><p className="mt-1 text-xs leading-5 text-emerald-900/80 dark:text-emerald-100/80">{isArabic ? "يمكنك إضافة أكثر من Ad Account باستخدام نفس System User Token، طالما الحسابات مضافة إليه في Meta بصلاحية القراءة. الـToken يُحفظ مشفرًا ولا يظهر بعد الحفظ." : "Add multiple ad accounts with the same System User token when Meta has assigned those accounts with read access. The token is encrypted and never shown after saving."}</p></div></div></Card>

    {!currentBranchId ? <Card className="p-8 text-center text-sm text-muted-foreground">{isArabic ? "اختر فرعًا أولًا" : "Choose a branch first"}</Card> : loading ? <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{isArabic ? "جارٍ تحميل الحسابات…" : "Loading accounts…"}</Card> : <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <Card className="p-5 shadow-sm"><div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="font-semibold">{isArabic ? "الحسابات المضافة" : "Connected accounts"}</h3><p className="mt-1 text-xs text-muted-foreground">{isArabic ? `${connections.length} حسابات مرتبطة بهذا الفرع` : `${connections.length} account(s) connected to this branch`}</p></div><Badge variant="outline">{configuredConnections.length ? (isArabic ? "Token محفوظ" : "Token saved") : (isArabic ? "لا يوجد Token" : "No token")}</Badge></div>{connections.length ? <div className="space-y-3">{connections.map((connection) => <div key={connection.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{connection.ad_account_id}</p><p className="mt-1 text-xs text-muted-foreground">{connection.business_id ? `Business ${connection.business_id}` : (isArabic ? "بدون Business ID" : "No Business ID")}</p></div><Badge variant={connection.status === "connected" ? "default" : "secondary"}>{statusLabel(connection.status, isArabic)}</Badge></div><div className="mt-3 grid gap-2 text-xs text-muted-foreground"><StatusRow label={isArabic ? "Token" : "Token"} value={connection.token_configured ? (isArabic ? "محفوظ ومشفر" : "Stored encrypted") : (isArabic ? "غير موجود" : "Not configured")} ok={connection.token_configured} /><StatusRow label={isArabic ? "آخر اختبار" : "Last tested"} value={formatDate(connection.last_tested_at, isArabic)} /><StatusRow label={isArabic ? "آخر مزامنة" : "Last sync"} value={formatDate(connection.last_successful_sync_at, isArabic)} /></div>{connection.last_error_message ? <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"><div className="mb-1 flex items-center gap-2 font-semibold"><XCircle className="size-4" />{isArabic ? "آخر خطأ" : "Last error"}</div><p>{connection.last_error_message}</p></div> : null}<div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => void test(connection)} disabled={testingId === connection.id || !connection.token_configured}>{testingId === connection.id ? <Loader2 className="me-2 size-4 animate-spin" /> : <CheckCircle2 className="me-2 size-4" />}{isArabic ? "اختبار" : "Test"}</Button><Button variant="outline" size="sm" onClick={() => void disconnect(connection)} disabled={disconnectingId === connection.id}>{disconnectingId === connection.id ? <Loader2 className="me-2 size-4 animate-spin" /> : <Unplug className="me-2 size-4" />}{isArabic ? "فصل" : "Disconnect"}</Button></div></div>)}</div> : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{isArabic ? "لم تتم إضافة حسابات Meta لهذا الفرع بعد." : "No Meta accounts have been added for this branch yet."}</div>}</Card>
      <Card className="p-5 shadow-sm"><div className="mb-5"><div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-primary"><Plus className="size-4" /><span>{isArabic ? "إضافة حساب إعلاني" : "Add ad account"}</span></div><h3 className="font-semibold">{isArabic ? "ربط Ad Account جديد" : "Connect another Ad Account"}</h3><p className="mt-1 text-xs text-muted-foreground">{isArabic ? "لا تحتاج إلى إنشاء Token جديد إذا كان الحساب مضافًا إلى نفس System User." : "You do not need a new token when the account is assigned to the same System User."}</p></div><form className="space-y-4" onSubmit={save}><div className="space-y-2"><Label htmlFor="meta-ad-account">Ad Account ID</Label><Input id="meta-ad-account" value={form.ad_account_id} onChange={(event) => update("ad_account_id", event.target.value)} placeholder="act_123456789" autoComplete="off" /></div><div className="space-y-2"><Label htmlFor="meta-business">Business ID <span className="text-muted-foreground">({isArabic ? "اختياري" : "optional"})</span></Label><Input id="meta-business" value={form.business_id} onChange={(event) => update("business_id", event.target.value)} placeholder="123456789012345" autoComplete="off" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="meta-currency">{isArabic ? "العملة" : "Currency"}</Label><Select value={form.currency} onValueChange={(value) => update("currency", value)}><SelectTrigger id="meta-currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EGP">EGP — Egyptian Pound</SelectItem><SelectItem value="USD">USD — US Dollar</SelectItem><SelectItem value="EUR">EUR — Euro</SelectItem><SelectItem value="SAR">SAR — Saudi Riyal</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="meta-timezone">{isArabic ? "المنطقة الزمنية" : "Timezone"}</Label><Input id="meta-timezone" value={form.timezone} onChange={(event) => update("timezone", event.target.value)} placeholder="Africa/Cairo" /></div></div><div className="space-y-2"><Label htmlFor="meta-version">Meta API version</Label><Input id="meta-version" value={form.api_version} onChange={(event) => update("api_version", event.target.value)} placeholder="v20.0" /></div>{configuredConnections.length ? <div className="space-y-2"><Label htmlFor="meta-token-source">{isArabic ? "مصدر الـToken" : "Token source"}</Label><Select value={tokenSource} onValueChange={(value) => setTokenSource(value as "new" | "saved")}><SelectTrigger id="meta-token-source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="saved">{isArabic ? "استخدم Token محفوظًا لهذا الفرع" : "Reuse a saved branch token"}</SelectItem><SelectItem value="new">{isArabic ? "أدخل Token جديدًا" : "Enter a new token"}</SelectItem></SelectContent></Select></div> : null}{tokenSource === "saved" && configuredConnections.length ? <div className="space-y-2"><Label htmlFor="meta-reuse-token">{isArabic ? "Token المحفوظ" : "Saved token"}</Label><Select value={reuseConnectionId} onValueChange={setReuseConnectionId}><SelectTrigger id="meta-reuse-token"><SelectValue placeholder={isArabic ? "اختر اتصالًا" : "Choose a connection"} /></SelectTrigger><SelectContent>{configuredConnections.map((connection) => <SelectItem key={connection.id} value={connection.id}>{connection.ad_account_id}</SelectItem>)}</SelectContent></Select></div> : null}{tokenSource === "new" ? <div className="space-y-2"><Label htmlFor="meta-token">Access Token</Label><Input id="meta-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={isArabic ? "أدخل Token جديدًا" : "Enter a new System User token"} autoComplete="new-password" /><p className="text-[11px] text-muted-foreground">{isArabic ? "لن يتم عرض القيمة بعد الحفظ. استخدم Token بصلاحية ads_read فقط." : "The value will not be shown after saving. Use a token with ads_read only."}</p></div> : null}<Button type="submit" className="w-full" disabled={saving}>{saving ? <Loader2 className="me-2 size-4 animate-spin" /> : <KeyRound className="me-2 size-4" />}{isArabic ? "حفظ الحساب" : "Save account"}</Button></form></Card>
    </div>}
  </div>;
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return <div className="flex items-center justify-between gap-3 border-b pb-2 text-xs last:border-b-0"><span className="text-muted-foreground">{label}</span><span className="flex items-center gap-2 text-end font-medium">{ok ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : null}{value}</span></div>;
}
