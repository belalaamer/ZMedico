import { supabase } from "@/integrations/supabase/client";
import { AuthError } from "@supabase/supabase-js";
import { describeEdgeFailure } from "./edgeFailure";

function failure(message: string, code: string) {
  return { data: { user: null, session: null }, error: new AuthError(message, undefined, code) };
}

const DEFAULT_FAILURE = "Unable to sign in. Check your credentials and connection, then try again.";

export async function signInWithIdentifier(identifier: string, password: string) {
  const normalized = identifier.trim();
  try {
    if (normalized.includes("@")) return await supabase.auth.signInWithPassword({ email: normalized.toLowerCase(), password });
    const { data, error } = await supabase.functions.invoke("login-by-identifier", { body: { identifier: normalized, password } });
    if (error) {
      // A locked-out user who reads "check your credentials" keeps retrying and
      // extends the lockout, so 429 and 503 must reach the screen as themselves.
      const f = await describeEdgeFailure(error, DEFAULT_FAILURE);
      const code = f.status === 429 ? "identifier_login_rate_limited"
        : f.status === 503 ? "identifier_login_unavailable"
        : "identifier_login_failed";
      return failure(f.message, code);
    }
    if (typeof data?.access_token !== "string" || !data.access_token || typeof data?.refresh_token !== "string" || !data.refresh_token) {
      return failure("Unable to establish a session. Please try signing in again.", "invalid_login_response");
    }
    return await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  } catch {
    // Do not retry: the server may already have accepted the authentication request.
    return failure("Unable to complete sign in. Check your connection and try again.", "login_transport_failed");
  }
}

const COPY: Record<string, { en: string; ar: string }> = {
  identifier_login_rate_limited: {
    en: "Too many sign-in attempts. Wait a few minutes, then try again.",
    ar: "محاولات دخول كثيرة. انتظر بضع دقائق ثم حاول مرة أخرى.",
  },
  identifier_login_unavailable: {
    en: "The sign-in service is temporarily unavailable. Please try again shortly.",
    ar: "خدمة تسجيل الدخول غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل.",
  },
};

/** Names the real failure instead of blaming the credentials. Codes that carry
 *  their own copy win; anything else keeps the caller's existing wording. */
export function identifierLoginErrorText(error: unknown, lang: "ar" | "en", fallback?: string): string {
  const code = (error as { code?: string } | null)?.code;
  const copy = code ? COPY[code] : undefined;
  if (copy) return lang === "ar" ? copy.ar : copy.en;
  if (fallback) return fallback;
  const message = (error as { message?: string } | null)?.message;
  return message || (lang === "ar" ? "تعذر تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى." : DEFAULT_FAILURE);
}
