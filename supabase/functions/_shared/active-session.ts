import { jsonResponse } from "./cors.ts";

export interface SessionRpcClient {
  rpc(name: "assert_active_session"): PromiseLike<{ error: unknown }>;
}

export type SessionVerdict = "active" | "unauthorized" | "unavailable";

// Must receive the caller's own JWT client, never the service-role client.
// Deployment requires the reviewed assert_active_session() database contract.
export async function activeSessionVerdict(client: SessionRpcClient): Promise<SessionVerdict> {
  try {
    const result = await client.rpc("assert_active_session");
    if (result.error === null) return "active";
    const error = result.error;
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "42501" || code === "PT401" || code === "PGRST301") return "unauthorized";
  } catch {
    // Transport/schema/configuration failures must never authorize service access.
  }
  return "unavailable";
}

export type SessionResponder = (body: { error: string }, status: 401 | 503) => Response;

// The caller builds the rejection with its own serializer, so the response keeps
// that function's CORS and cache headers instead of inheriting the shared ones.
export async function sessionGuardResponse(
  client: SessionRpcClient,
  respond: SessionResponder,
): Promise<Response | null> {
  const verdict = await activeSessionVerdict(client);
  if (verdict === "active") return null;
  return verdict === "unauthorized"
    ? respond({ error: "Unauthorized" }, 401)
    : respond({ error: "Unable to verify active session" }, 503);
}

export async function requireActiveSession(client: SessionRpcClient): Promise<Response | null> {
  return sessionGuardResponse(client, (body, status) => jsonResponse(body, status));
}

export class InactiveSessionError extends Error {
  readonly status: 401 | 503;

  constructor(verdict: Exclude<SessionVerdict, "active">) {
    super(verdict === "unauthorized" ? "Unauthorized" : "Unable to verify active session");
    this.name = "InactiveSessionError";
    this.status = verdict === "unauthorized" ? 401 : 503;
  }
}

// For functions whose authorization helpers signal failure by throwing.
export async function requireActiveSessionOrThrow(client: SessionRpcClient): Promise<void> {
  const verdict = await activeSessionVerdict(client);
  if (verdict === "active") return;
  throw new InactiveSessionError(verdict);
}
