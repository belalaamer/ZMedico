// Shared CORS headers used by every Lovable-managed edge function.
// Keeping the origin/methods/headers in one place prevents drift and makes
// browser preflight behaviour identical across the deployment.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
} as const;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function corsPreflight(): Response {
  return new Response("ok", { headers: corsHeaders });
}