import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

// Mirrors the header handling of the generated @/integrations/supabase/client
// (that file is machine-owned and must not be edited). An opaque publishable
// key is not a bearer JWT, so sending it as one makes PostgREST try to parse it
// as a token and reject the request.
function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

let guestClient: SupabaseClient | null = null;

// A client that carries no session, so its requests are evaluated as the
// `anon` role -- exactly what an anonymous visitor already sends.
//
// Production grants public_create_booking_for_tenant EXECUTE to anon and NOT to
// authenticated (measured 2026-10-25 on the live catalog). The shared app
// client attaches the JWT whenever anyone is signed in, so a staff member
// opening the clinic's own booking link was refused with 42501 on submit while
// the identical link worked for a guest. This RPC reads no auth.uid() -- it
// takes the patient's name and phone as parameters -- so which role calls it
// cannot change what row gets written; it only decides whether it is allowed.
//
// Created lazily and only for the guest booking path. Nothing else should use
// it: reads that both roles may call, and every portal RPC (which *does*
// resolve the patient from auth.uid()), must keep using the session client.
export function getGuestBookingClient(): SupabaseClient {
  if (!guestClient) {
    guestClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return guestClient;
}
