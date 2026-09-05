import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KeyRound, Loader2, PlugZap, ShieldCheck, Trash2 } from "lucide-react";
import SettingsLayout from "./SettingsLayout";

type AIConfig = {
  configured: boolean;
  provider: string;
  model: string | null;
  temperature: number | null;
  is_active: boolean;
  has_api_key: boolean;
  last_tested_at: string | null;
  last_test_status: "success" | "failed" | null;
  last_test_error: string | null;
};

// Settings > AI (system_owner only). Manages the AI receptionist's provider
// configuration (provider/model/temperature/enabled) and lets the operator
// set or rotate the API key. The raw key is write-only from this UI's point
// of view -- it is sent once to ai-admin-settings and never redisplayed or
// echoed back; every read of config state (get_config) reports only
// has_api_key: boolean, never the key value itself.
export default function AISettings() {
  const { authz, loading: roleLoading } = useAuthorization();
  const isSystemOwner = authz.holdsAnyRole("system_owner");

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [model, setModel] = useState("gemini-3.6-flash");
  const [temperature, setTemperature] = useState<string>("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("ai-admin-settings", {
      body: { action: "get_config" },
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed to load AI configuration");
      return;
    }
    const cfg = data as AIConfig;
    setConfig(cfg);
    setModel(cfg.model || "gemini-3.6-flash");
    setTemperature(cfg.temperature != null ? String(cfg.temperature) : "");
    setAiEnabled(cfg.is_active);
  };

  useEffect(() => {
    if (!roleLoading && isSystemOwner) void loadConfig();
  }, [roleLoading, isSystemOwner]);

  if (roleLoading) return null;
  if (!isSystemOwner) return <Navigate to="/settings/general" replace />;

  const saveConfig = async () => {
    setSavingConfig(true);
    const temp = temperature.trim() === "" ? null : Number(temperature);
    const { data, error } = await supabase.functions.invoke("ai-admin-settings", {
      body: {
        action: "save_config",
        provider: "gemini",
        model,
        temperature: temp,
        ai_enabled: aiEnabled,
      },
    });
    setSavingConfig(false);
    if (error || (data as any)?.error || (data as any)?.success === false) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed to save configuration");
      return;
    }
    toast.success("AI configuration saved");
    await loadConfig();
  };

  const saveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      toast.error("Enter an API key first");
      return;
    }
    setSavingKey(true);
    const { data, error } = await supabase.functions.invoke("ai-admin-settings", {
      body: { action: "save_api_key", api_key: apiKeyInput.trim() },
    });
    setSavingKey(false);
    if (error || (data as any)?.error || (data as any)?.success === false) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed to save API key");
      return;
    }
    setApiKeyInput("");
    toast.success("API key saved securely");
    await loadConfig();
  };

  const removeApiKey = async () => {
    if (!confirm("Remove the stored API key? The AI receptionist will stop responding until a new key is set.")) return;
    setRemovingKey(true);
    const { data, error } = await supabase.functions.invoke("ai-admin-settings", {
      body: { action: "remove_api_key" },
    });
    setRemovingKey(false);
    if (error || (data as any)?.error || (data as any)?.success === false) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed to remove API key");
      return;
    }
    toast.success("API key removed");
    await loadConfig();
  };

  const testConnection = async () => {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("ai-admin-settings", {
      body: { action: "test_connection" },
    });
    setTesting(false);
    if (error) {
      toast.error(error.message ?? "Test failed");
      return;
    }
    const result = data as { success: boolean; latency_ms?: number; error?: string };
    if (result.success) {
      toast.success(`Connected -- latency ${result.latency_ms}ms`);
    } else {
      toast.error(result.error ?? "Connection test failed");
    }
    await loadConfig();
  };

  return (
    <SettingsLayout>
      <div className="space-y-4 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">AI Receptionist</h1>
          <p className="text-sm text-muted-foreground">
            Configure the AI provider used to answer patients on WhatsApp. The API key is stored encrypted
            in Supabase Vault -- it is never shown in this UI once saved, never stored in plaintext, and never
            committed to source control.
          </p>
        </div>

        {loading || !config ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading configuration…
          </div>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="size-4" /> Provider &amp; Model
                </CardTitle>
                <CardDescription>Applies to the whole platform (single active configuration).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">AI receptionist enabled</Label>
                    <p className="text-xs text-muted-foreground">Turn off to stop the AI from replying to any conversation.</p>
                  </div>
                  <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Provider</Label>
                  <Select value="gemini" disabled>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Model</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gemini-3.6-flash" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Temperature (optional)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder="Provider default"
                  />
                </div>

                <Button onClick={saveConfig} disabled={savingConfig}>
                  {savingConfig ? <Loader2 className="size-4 me-1 animate-spin" /> : null}
                  Save configuration
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyRound className="size-4" /> API Key
                </CardTitle>
                <CardDescription>
                  {config.has_api_key
                    ? "A key is currently stored. Enter a new value below to rotate it, or remove it entirely."
                    : "No key is stored yet."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant={config.has_api_key ? "default" : "secondary"}>
                    {config.has_api_key ? "Key configured" : "Not configured"}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{config.has_api_key ? "New API key" : "API key"}</Label>
                  <Input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Paste the Gemini API key"
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={saveApiKey} disabled={savingKey || !apiKeyInput.trim()}>
                    {savingKey ? <Loader2 className="size-4 me-1 animate-spin" /> : null}
                    {config.has_api_key ? "Rotate key" : "Save key"}
                  </Button>
                  {config.has_api_key && (
                    <Button variant="destructive" onClick={removeApiKey} disabled={removingKey}>
                      <Trash2 className="size-4 me-1" /> Remove key
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PlugZap className="size-4" /> Connection test
                </CardTitle>
                <CardDescription>Sends a minimal request to Gemini to confirm the stored key works.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={testConnection} disabled={testing || !config.has_api_key}>
                  {testing ? <Loader2 className="size-4 me-1 animate-spin" /> : null}
                  Test connection
                </Button>
                {config.last_tested_at && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Last tested: {new Date(config.last_tested_at).toLocaleString()}</div>
                    <div>
                      Status:{" "}
                      <span className={config.last_test_status === "success" ? "text-emerald-600" : "text-destructive"}>
                        {config.last_test_status ?? "unknown"}
                      </span>
                    </div>
                    {config.last_test_error && <div>Error: {config.last_test_error}</div>}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </SettingsLayout>
  );
}
