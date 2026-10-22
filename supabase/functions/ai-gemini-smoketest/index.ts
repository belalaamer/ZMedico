// This diagnostic-only smoketest function has been decommissioned.
// It previously exercised the ai_provider_config bootstrap/test_connection
// flow for verification purposes. It is intentionally neutered here (rather
// than fully deleted, since no delete/remove action was available for this
// deployment) and now only ever returns 410 Gone.
//
// A full removal from the Supabase project should be performed via the
// Supabase dashboard (Edge Functions > ai-gemini-smoketest > Delete).

Deno.serve(async () => {
  return new Response(
    JSON.stringify({ error: "Gone", message: "This diagnostic function has been decommissioned." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
});
