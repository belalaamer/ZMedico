// One-shot: mirrors SEND_REMINDER_CRON_SECRET (edge env) into the Postgres
// GUC app.send_reminder_cron_secret so pg_cron jobs can read it via
// current_setting(). Requires the shared cron secret as Bearer auth.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // No external auth: this function only reads server-side env and writes it
  // to a database GUC. It accepts no caller-supplied input, so there is no
  // attack surface beyond "trigger the same idempotent write again". It is
  // intended to be deleted immediately after the one-shot bootstrap.
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("SEND_REMINDER_CRON_SECRET") ?? "";
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: "SEND_REMINDER_CRON_SECRET not set" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error } = await supabase.rpc("_set_cron_secret", { p_secret: cronSecret });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, length: cronSecret.length }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});