import { supabase } from "@/integrations/supabase/client";
import { AuthError } from "@supabase/supabase-js";

function failure(message: string, code: string) {
  return { data: { user: null, session: null }, error: new AuthError(message, undefined, code) };
}

export async function signInWithIdentifier(identifier: string, password: string) {
  const normalized = identifier.trim();
  try {
    if (normalized.includes("@")) return await supabase.auth.signInWithPassword({ email: normalized.toLowerCase(), password });
    const { data, error } = await supabase.functions.invoke("login-by-identifier", { body: { identifier: normalized, password } });
    if (error) return failure("Unable to sign in. Check your credentials and connection, then try again.", "identifier_login_failed");
    if (typeof data?.access_token !== "string" || !data.access_token || typeof data?.refresh_token !== "string" || !data.refresh_token) {
      return failure("Unable to establish a session. Please try signing in again.", "invalid_login_response");
    }
    return await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  } catch {
    // Do not retry: the server may already have accepted the authentication request.
    return failure("Unable to complete sign in. Check your connection and try again.", "login_transport_failed");
  }
}
