import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";
import { hasPersistedAuthSession, persistAuthSessionForPreview } from "@/lib/authSessionPersistence";
import { reportAuthFailure } from "@/lib/authFailureTelemetry";

const AUTH_DEBUG_PREFIX = "[auth-debug]";

// How long the confirmation stays on screen before the portal handoff.
const CONFIRMATION_DWELL_MS = 1400;

/**
 * Which of two sentences the desk gets. P5: this screen used to render whatever
 * the provider or the URL handed it, so an Arabic patient read English
 * Postgres/GoTrue text they could not act on, and a link containing
 * `?error_description=…` printed the sender's words inside the clinic's own card.
 * The technical detail is not lost — it goes to `reportAuthFailure`, which
 * forwards a registered code and nothing else.
 */
type CallbackFailure = "link" | "connection";

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
  const { lang, t } = useI18n();
  const nav = useNavigate();
  const location = useLocation();
  const [failure, setFailure] = useState<CallbackFailure | null>(null);
  const [confirmed, setConfirmed] = useState<{ message: string; next: string } | null>(null);
  // Whichever desk a failed link goes back to is the one that can help: a patient bounced
  // to the staff sign-in form cannot ask for a new invitation from there.
  const [desk, setDesk] = useState("/auth");

  useEffect(() => {
    let cancelled = false;
    let handoff: ReturnType<typeof setTimeout> | undefined;

    const completeCallback = async () => {
      const params = new URLSearchParams(location.search);
      const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const tokenType = params.get("type") || "invite";
      const redirectType = params.get("type") || hashParams.get("type");
      const providerError = params.get("error_description") || hashParams.get("error_description") || params.get("error") || hashParams.get("error");
      const next = safeRedirectPath(params.get("next") || hashParams.get("next") || "/");
      setDesk(next.startsWith("/patient-portal") ? "/patient-portal/login" : "/auth");

      console.info(AUTH_DEBUG_PREFIX, "callback redirect received", {
        // The query is not logged: on the PKCE flow it carries the live single-use `?code=`.
        path: window.location.pathname,
        type: redirectType ?? null,
        hasCode: Boolean(code),
        hasHashTokens: Boolean(hashParams.get("access_token") || hashParams.get("refresh_token")),
        hasProviderError: Boolean(providerError),
        next,
      });

      if (providerError) {
        // The text is URL-supplied, so it is never rendered and never logged: `hasProviderError`
        // is already in the line above, which is the part an operator can act on.
        reportAuthFailure("callback-provider-error", "rejected");
        if (!cancelled) setFailure("link");
        return;
      }

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        persistAuthSessionForPreview(data.session, "callback-code-exchange");
        console.info(AUTH_DEBUG_PREFIX, "callback code exchange completed", {
          hasSession: Boolean(data.session),
          hasUser: Boolean(data.session?.user),
          code: error?.code ?? null,
        });
        if (error) {
          reportAuthFailure("callback-code-exchange", "rejected", error);
          if (!cancelled) setFailure("link");
          return;
        }
      }

      if (!code && tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tokenType as "invite" | "recovery" | "email" | "magiclink" });
        persistAuthSessionForPreview(data.session, "callback-token-hash-verification");
        console.info(AUTH_DEBUG_PREFIX, "callback invite token verification completed", {
          hasSession: Boolean(data.session),
          hasUser: Boolean(data.user),
          code: error?.code ?? null,
        });
        if (error) {
          reportAuthFailure("callback-token-verify", "rejected", error);
          if (!cancelled) setFailure("link");
          return;
        }
      }

      const hashAccessToken = hashParams.get("access_token");
      const hashRefreshToken = hashParams.get("refresh_token");
      if (!code && !tokenHash && hashAccessToken && hashRefreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: hashAccessToken,
          refresh_token: hashRefreshToken,
        });
        persistAuthSessionForPreview(data.session, "callback-hash-token-set-session");
        console.info(AUTH_DEBUG_PREFIX, "callback hash token session completed", {
          hasSession: Boolean(data.session),
          hasUser: Boolean(data.session?.user),
          code: error?.code ?? null,
        });
        if (error) {
          reportAuthFailure("callback-session-restore", "rejected", error);
          if (!cancelled) setFailure("link");
          return;
        }
      }

      const { data, error } = await supabase.auth.getSession();
      persistAuthSessionForPreview(data.session, "callback-get-session");
      console.info(AUTH_DEBUG_PREFIX, "callback redirect completion", {
        hasSession: Boolean(data.session),
        hasUser: Boolean(data.session?.user),
        code: error?.code ?? null,
        next,
        hasStoredToken: hasPersistedAuthSession(),
      });

      if (cancelled) return;
      // A rejected completion call is the provider refusing to answer, which a retry can fix;
      // an answered call with no session is the link having nothing left to give.
      if (error) {
        reportAuthFailure("callback-completion", "rejected", error);
        setFailure("connection");
        return;
      }
      if (!data.session) {
        reportAuthFailure("callback-completion", "identity-mismatch");
        setFailure("link");
        return;
      }

      // supabase-js clears the fragment before the second effect run, so `type` is often already
      // gone here. `next=/patient-portal` is only ever written by patient-portal-invite's redirectTo.
      const isInvite = redirectType === "invite" || (!redirectType && next.startsWith("/patient-portal"));
      const message =
        lang === "ar"
          ? isInvite
            ? "تم تأكيد دعوة البوابة. جارٍ فتح صفحة المريض…"
            : redirectType === "recovery"
              ? "تم تأكيد إعادة تعيين كلمة المرور. جارٍ المتابعة…"
              : "تم تسجيل الدخول بنجاح. جارٍ المتابعة…"
          : isInvite
            ? "Portal invitation confirmed. Opening the patient portal…"
            : redirectType === "recovery"
              ? "Password reset confirmed. Continuing…"
              : "Signed in successfully. Continuing…";

      console.info(AUTH_DEBUG_PREFIX, "callback confirmed, handing off", {
        next,
        redirectType: redirectType ?? null,
        userIdPrefix: data.session.user.id.slice(0, 8),
      });
      setConfirmed({ message, next });
      // Full-document handoff: a fresh load reads the session that just arrived from storage,
      // so no provider still mounted in this document can leave the previous identity in place.
      handoff = setTimeout(() => {
        if (!cancelled) window.location.replace(next);
      }, CONFIRMATION_DWELL_MS);
    };

    // A thrown provider call used to reject this promise silently: the card stayed on
    // "Completing sign-in" forever, which is the same no-forward-path state P5 is about.
    void completeCallback().catch(() => {
      reportAuthFailure("callback-transport", "transport");
      if (!cancelled) setFailure("connection");
    });

    return () => {
      cancelled = true;
      if (handoff) clearTimeout(handoff);
    };
  }, [lang, location.hash, location.search, nav]);

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-6 text-center shadow-elegant border-border/60">
        {failure ? (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">{lang === "ar" ? "تعذر إكمال تسجيل الدخول" : "Sign-in could not be completed"}</h1>
            <p className="text-sm text-muted-foreground">{failure === "link" ? t("callbackLinkFailed") : t("callbackTryAgain")}</p>
            <Button onClick={() => nav(desk, { replace: true })}>{t("backToSignIn")}</Button>
          </div>
        ) : confirmed ? (
          <div className="space-y-4">
            <CheckCircle2 className="mx-auto size-8 text-primary" aria-hidden="true" />
            <h1 className="text-xl font-bold">{confirmed.message}</h1>
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? "لو لم تفتح الصفحة تلقائياً اضغط هنا" : "If the page did not open automatically, continue here"}
            </p>
            <Button onClick={() => window.location.replace(confirmed.next)}>
              {lang === "ar" ? "المتابعة الآن" : "Continue now"}
            </Button>
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