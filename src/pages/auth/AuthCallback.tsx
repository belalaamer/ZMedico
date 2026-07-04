import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";

const AUTH_DEBUG_PREFIX = "[auth-debug]";

function safeRedirectPath(value?: string | null) {
  if (!value) return "/";
  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const url = new URL(value);
      if (url.origin !== window.location.origin) return "/";
      return `${url.pathname}${url.search}${url.hash}` || "/";
    }
    if (!value.startsWith("/") || value.startsWith("//")) return "/";
    if (value.startsWith("/auth")) return "/";
    return value;
  } catch {
    return "/";
  }
}

export default function AuthCallback() {
  const { lang } = useI18n();
  const nav = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const completeCallback = async () => {
      const params = new URLSearchParams(location.search);
      const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
      const code = params.get("code");
      const providerError = params.get("error_description") || hashParams.get("error_description") || params.get("error") || hashParams.get("error");
      const next = safeRedirectPath(params.get("next") || hashParams.get("next") || "/");

      console.info(AUTH_DEBUG_PREFIX, "callback redirect received", {
        path: window.location.pathname + window.location.search,
        hasCode: Boolean(code),
        hasHashTokens: Boolean(hashParams.get("access_token") || hashParams.get("refresh_token")),
        hasProviderError: Boolean(providerError),
        next,
      });

      if (providerError) {
        if (!cancelled) setError(providerError);
        console.warn(AUTH_DEBUG_PREFIX, "callback provider error", { error: providerError });
        return;
      }

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        console.info(AUTH_DEBUG_PREFIX, "callback code exchange completed", {
          hasSession: Boolean(data.session),
          hasUser: Boolean(data.session?.user),
          error: error?.message ?? null,
        });
        if (error) {
          if (!cancelled) setError(error.message);
          return;
        }
      }

      const { data, error } = await supabase.auth.getSession();
      console.info(AUTH_DEBUG_PREFIX, "callback redirect completion", {
        hasSession: Boolean(data.session),
        hasUser: Boolean(data.session?.user),
        error: error?.message ?? null,
        next,
        hasStoredToken: Object.keys(window.localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
      });

      if (cancelled) return;
      if (error || !data.session) {
        setError(error?.message ?? (lang === "ar" ? "لم تكتمل جلسة تسجيل الدخول." : "Sign-in session was not completed."));
        return;
      }
      nav(next, { replace: true });
    };

    void completeCallback();

    return () => {
      cancelled = true;
    };
  }, [lang, location.hash, location.search, nav]);

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-6 text-center shadow-elegant border-border/60">
        {error ? (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">{lang === "ar" ? "تعذر إكمال تسجيل الدخول" : "Sign-in could not be completed"}</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => nav("/auth", { replace: true })}>{lang === "ar" ? "العودة لتسجيل الدخول" : "Back to sign in"}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <h1 className="text-xl font-bold">{lang === "ar" ? "جارٍ إكمال تسجيل الدخول" : "Completing sign-in"}</h1>
          </div>
        )}
      </Card>
    </main>
  );
}