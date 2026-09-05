import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { toast } from "sonner";
import { ShieldAlert, Sparkles, KeyRound, Loader2 } from "lucide-react";

// Single source of truth for selectable AI providers. Adding OpenAI /
// Anthropic / Groq later is just adding an entry here.
const PROVIDERS: { value: string; label: string }[] = [
  { value: "gemini", label: "Google Gemini" },
];

const MODEL_PRESETS = ["gemini-3.6-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

type AIConfig = {
  provider: string;
  model: string | null;
  temperature: number | null;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_status: "success" | "failed" | null;
  last_test_error: string | null;
  has_api_key: boolean;
};

const DEFAULT_CONFIG: AIConfig = {
  provider: "gemini",
  model: null,
  temperature: 1,
  is_active: false,
  last_tested_at: null,
  last_test_status: null,
  last_test_error: null,
  has_api_key: false,
};

/** Mirrors the error-unwrapping pattern used across admin-* edge function
 *  callers (see UserManagement.tsx's admin-create-user call): a functions.invoke
 *  failure can surface either as `error` (network/HTTP) or `data.error`
 *  (function-level failure), and the real message for the former is often
 *  buried in `error.context`. */
async function extractErrorMessage(data: any, error: any, fallback: string): Promise<string> {
  let msg = (data as any)?.error ?? error?.message ?? fallback;
  try {
    const ctx: any = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) msg = body.error;
    }
  } catch {
    // best-effort only — fall back to whatever msg already holds
  }
  return msg;
}

export default function AISettings() {
  const { lang } = useI18n();
  const { authz, loading: authzLoading } = useAuthorization();
  const isSystemOwner = authz.holdsAnyRole("system_owner");

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG);

  const [provider, setProvider] = useState(DEFAULT_CONFIG.provider);
  const [modelPreset, setModelPreset] = useState<string>("custom");
  const [modelCustom, setModelCustom] = useState("");
  const [temperature, setTemperature] = useState<number>(1);
  const [aiEnabled, setAiEnabled] = useState(false);

  // The API key input NEVER receives a server-provided value. It always
  // starts (and resets after a successful save/remove) as an empty string.
  // `has_api_key` from get_config only ever drives the "Configured" badge,
  // never the input's value attribute.
  const [apiKeyInput, setApiKeyInput] = useState("");
  const keyEdited = apiKeyInput.trim().length > 0;

  const [saving, setSaving] = useState(false);
  const [updatingKey, setUpdatingKey] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);
  const [testing, setTesting] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("ai-admin-settings", {
      body: { action: "get_config" },
    });
    if (error || (data as any)?.error) {
      const msg = await extractErrorMessage(data, error, lang === "ar" ? "فشل تحميل إعدادات الذكاء الاصطناعي" : "Failed to load AI settings");
      toast.error(msg);
      setLoading(false);
      return;
    }
    const cfg = { ...DEFAULT_CONFIG, ...(data as Partial<AIConfig>) };
    setConfig(cfg);
    setProvider(cfg.provider || DEFAULT_CONFIG.provider);
    setAiEnabled(!!cfg.is_active);
    setTemperature(cfg.temperature ?? 1);
    const modelValue = cfg.model ?? "";
    if (modelValue && MODEL_PRESETS.includes(modelValue)) {
      setModelPreset(modelValue);
      setModelCustom("");
    } else {
      setModelPreset("custom");
      setModelCustom(modelValue);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isSystemOwner) return;
    void fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSystemOwner]);

  const resolvedModel = modelPreset === "custom" ? modelCustom.trim() : modelPreset;

  const handleSave = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("ai-admin-settings", {
      body: {
        action: "save_config",
        provider,
        model: resolvedModel || null,
        temperature,
        ai_enabled: aiEnabled,
      },
    });
    if (error || (data as any)?.error) {
      const msg = await extractErrorMessage(data, error, lang === "ar" ? "فشل حفظ الإعدادات" : "Failed to save settings");
      toast.error(msg);
      setSaving(false);
      return;
    }

    // Save button also pushes a newly-typed key, if any — but only ever
    // the value the user just typed in this session, never a placeholder.
    if (keyEdited) {
      const keyResult = await saveApiKey(apiKeyInput.trim(), { silent: true });
      if (!keyResult.ok) {
        setSaving(false);
        return;
      }
    }

    toast.success(lang === "ar" ? "تم حفظ الإعدادات" : "Settings saved");
    setSaving(false);
    await fetchConfig();
  };

  const saveApiKey = async (apiKey: string, opts?: { silent?: boolean }): Promise<{ ok: boolean }> => {
    const { data, error } = await supabase.functions.invoke("ai-admin-settings", {
      body: { action: "save_api_key", api_key: apiKey },
    });
    if (error || (data as any)?.error) {
      const msg = await extractErrorMessage(data, error, lang === "ar" ? "فشل حفظ مفتاح الـ API" : "Failed to save the API key");
      toast.error(msg);
      return { ok: false };
    }
    setApiKeyInput("");
    setConfig((c) => ({ ...c, has_api_key: true }));
    if (!opts?.silent) toast.success(lang === "ar" ? "تم تحديث مفتاح الـ API" : "API key updated");
    return { ok: true };
  };

  const handleUpdateKey = async () => {
    if (!keyEdited) return;
    setUpdatingKey(true);
    await saveApiKey(apiKeyInput.trim());
    setUpdatingKey(false);
  };

  const handleRemoveKey = async () => {
    setRemovingKey(true);
    const { data, error } = await supabase.functions.invoke("ai-admin-settings", {
      body: { action: "remove_api_key" },
    });
    if (error || (data as any)?.error) {
      const msg = await extractErrorMessage(data, error, lang === "ar" ? "فشل حذف مفتاح الـ API" : "Failed to remove the API key");
      toast.error(msg);
      setRemovingKey(false);
      return;
    }
    setConfig((c) => ({ ...c, has_api_key: false }));
    setApiKeyInput("");
    toast.success(lang === "ar" ? "تم حذف مفتاح الـ API" : "API key removed");
    setRemovingKey(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("ai-admin-settings", {
      body: { action: "test_connection" },
    });
    if (error || (data as any)?.error) {
      const msg = await extractErrorMessage(data, error, lang === "ar" ? "فشل اختبار الاتصال" : "Connection test failed");
      toast.error(msg);
      setTesting(false);
      await fetchConfig();
      return;
    }
    const result = data as { success: boolean; provider: string; model: string; latency_ms: number; error?: string };
    if (result.success) {
      toast.success(
        lang === "ar"
          ? `تم الاتصال بنجاح (${result.latency_ms} مللي ثانية)`
          : `Connected successfully (${result.latency_ms}ms)`
      );
    } else {
      toast.error(result.error || (lang === "ar" ? "فشل الاتصال" : "Connection failed"));
    }
    setTesting(false);
    // Re-fetch so the status badge / last_tested_at reflect what the
    // server actually persisted, rather than a locally-guessed value.
    await fetchConfig();
  };

  const formatTestedAt = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString(lang === "ar" ? "ar-EG" : "en-EG");
  };

  if (authzLoading) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </SettingsLayout>
    );
  }

  // Client-side gate. Defense in depth only — the real boundary is the
  // ai-admin-settings edge function itself (403 for non system_owner) and
  // the systemOwnerOnly PermissionRoute wrapping this page in App.tsx.
  if (!isSystemOwner) {
    return (
      <SettingsLayout>
        <div className="min-h-[40vh] flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="mx-auto size-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <ShieldAlert className="size-7" />
            </div>
            <h2 className="text-xl font-bold">{lang === "ar" ? "غير مصرح" : "Not authorized"}</h2>
            <p className="text-sm text-muted-foreground">
              {lang === "ar"
                ? "إعدادات الذكاء الاصطناعي متاحة فقط لمالك النظام."
                : "AI settings are only available to the system owner."}
            </p>
          </div>
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3 bg-background border-b border-border/60 py-3 -mx-1 px-1">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              {lang === "ar" ? "إعدادات المساعد الذكي" : "AI Assistant Settings"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "ar"
                ? "تحكّم في مزود الذكاء الاصطناعي والنموذج ومفتاح الـ API المستخدم في ميزات المساعد الذكي."
                : "Control the AI provider, model, and API key used by the assistant's AI-powered features."}
            </p>
          </div>
          <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
            {lang === "ar" ? "حفظ" : "Save"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "الحالة" : "Status"}</CardTitle>
            <CardDescription>
              {lang === "ar" ? "تفعيل المساعد الذكي ونتيجة آخر اختبار اتصال" : "Whether the assistant is enabled, and the result of the last connection test"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>{lang === "ar" ? "تفعيل المساعد الذكي" : "AI Assistant enabled"}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === "ar" ? "عند الإيقاف، لن تعمل ميزات الذكاء الاصطناعي في النظام." : "When disabled, AI-powered features are unavailable across the app."}
                </p>
              </div>
              <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} disabled={loading} />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {config.last_test_status === "success" ? (
                <Badge className="bg-success/15 text-success border-success/30" variant="outline">
                  {lang === "ar" ? "متصل" : "Connected"}
                </Badge>
              ) : config.last_test_status === "failed" ? (
                <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline">
                  {lang === "ar" ? "فشل الاتصال" : "Connection failed"}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  {lang === "ar" ? "لم يتم الاختبار بعد" : "Not tested yet"}
                </Badge>
              )}
              {config.last_tested_at ? (
                <span className="text-xs text-muted-foreground">
                  {lang === "ar" ? "آخر اختبار: " : "Last tested at: "}
                  {formatTestedAt(config.last_tested_at)}
                </span>
              ) : null}
            </div>

            {config.last_test_status === "failed" && config.last_test_error ? (
              <p className="text-xs text-destructive break-words">{config.last_test_error}</p>
            ) : null}

            <Button variant="outline" onClick={handleTestConnection} disabled={testing || loading}>
              {testing ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              {lang === "ar" ? "اختبار الاتصال" : "Test Connection"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "المزود والنموذج" : "Provider & Model"}</CardTitle>
            <CardDescription>
              {lang === "ar" ? "اختر مزود الذكاء الاصطناعي والنموذج ودرجة العشوائية" : "Choose the AI provider, model, and response temperature"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>{lang === "ar" ? "المزود" : "Provider"}</Label>
                <Select value={provider} onValueChange={setProvider} disabled={loading}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{lang === "ar" ? "النموذج" : "Model"}</Label>
                <Select value={modelPreset} onValueChange={setModelPreset} disabled={loading}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODEL_PRESETS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                    <SelectItem value="custom">{lang === "ar" ? "مخصص…" : "Custom…"}</SelectItem>
                  </SelectContent>
                </Select>
                {modelPreset === "custom" ? (
                  <Input
                    className="mt-2"
                    placeholder={lang === "ar" ? "اسم النموذج" : "Model name"}
                    value={modelCustom}
                    onChange={(e) => setModelCustom(e.target.value)}
                    disabled={loading}
                  />
                ) : null}
              </div>
              <div>
                <Label>{lang === "ar" ? "درجة العشوائية (Temperature)" : "Temperature"}</Label>
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(Math.max(0, Math.min(2, +e.target.value)))}
                  disabled={loading}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="size-4" />{lang === "ar" ? "مفتاح الـ API" : "API Key"}</CardTitle>
            <CardDescription>
              {lang === "ar" ? "المفتاح الحالي لا يُعرض أبدًا. أدخل مفتاحًا جديدًا فقط لتحديثه." : "The current key is never displayed. Enter a new value only to replace it."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              {config.has_api_key ? (
                <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                  {lang === "ar" ? "مُهيّأ •••••••• " : "Configured ••••••••"}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  {lang === "ar" ? "غير مُهيّأ" : "Not configured"}
                </Badge>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1">
                <Label>{lang === "ar" ? "مفتاح جديد" : "New API key"}</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={config.has_api_key
                    ? (lang === "ar" ? "اتركه فارغًا للاحتفاظ بالمفتاح الحالي" : "Leave blank to keep the current key")
                    : (lang === "ar" ? "أدخل مفتاح الـ API" : "Enter API key")}
                  disabled={loading}
                />
              </div>
              <Button variant="outline" onClick={handleUpdateKey} disabled={!keyEdited || updatingKey || loading}>
                {updatingKey ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                {lang === "ar" ? "تحديث المفتاح" : "Update key"}
              </Button>
              {config.has_api_key ? (
                <Button variant="ghost" className="text-destructive" onClick={handleRemoveKey} disabled={removingKey || loading}>
                  {removingKey ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  {lang === "ar" ? "حذف المفتاح" : "Remove key"}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          {lang === "ar"
            ? "مفتاح الـ API مشفّر ومخزّن بأمان. لن يظهر مرة أخرى بعد الحفظ ولا يغادر السيرفر أبدًا."
            : "Your API key is encrypted and stored securely. It is never shown again after saving, and never leaves the server."}
        </p>
      </div>
    </SettingsLayout>
  );
}
