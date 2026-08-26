import { supabase } from "@/integrations/supabase/client";

export async function signInWithIdentifier(identifier: string, password: string) {
  const normalized = identifier.trim();
  if (normalized.includes("@")) return supabase.auth.signInWithPassword({ email: normalized.toLowerCase(), password });
  const { data, error } = await supabase.functions.invoke("login-by-identifier", { body: { identifier: normalized, password } });
  if (error || !data?.access_token || !data?.refresh_token) return { data: { user: null, session: null }, error: error ?? { message: "Invalid credentials" } } as any;
  return supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
}
