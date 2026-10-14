import { jsonResponse } from "./cors.ts";

export interface SessionRpcClient {
  rpc(name: "assert_active_session"): PromiseLike<{ error: unknown }>;
}

// Must receive the caller's own JWT client, never the service-role client.
// Deployment requires the reviewed assert_active_session() database contract.
export async function requireActiveSession(client: SessionRpcClient): Promise<Response | null> {
  try {
    const result = await client.rpc("assert_active_session");
    if (result.error === null) return null;
    const error = result.error;
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "42501" || code === "PT401" || code === "PGRST301") {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  } catch {
    // Transport/schema/configuration failures must never authorize service access.
  }
  return jsonResponse({ error: "Unable to verify active session" }, 503);
}
