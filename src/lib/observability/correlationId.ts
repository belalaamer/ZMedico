/**
 * Correlation / request IDs for the frontend.
 *
 * Zero runtime dependency and zero side effects unless a caller opts in.
 * A correlation ID is a short opaque string attached to browser-initiated
 * requests and structured console/telemetry lines so they can be joined
 * across the frontend, Edge Functions, and audit logs.
 *
 * NOTE: Sprint 2 introduces the helpers only. Existing call sites are
 * NOT rewired — teams opt in per feature to keep diffs reversible.
 */

export const CORRELATION_HEADER = "x-correlation-id";
export const REQUEST_HEADER = "x-request-id";

function randomHex(bytes: number): string {
  try {
    const arr = new Uint8Array(bytes);
    (globalThis.crypto ?? (globalThis as any).msCrypto).getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Fallback: Math.random is acceptable for correlation-only IDs.
    let out = "";
    for (let i = 0; i < bytes; i++) {
      out += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
    }
    return out;
  }
}

/** Fresh correlation ID (16 hex chars, ~64 bits of entropy). */
export function newCorrelationId(): string {
  return randomHex(8);
}

/**
 * Session-scoped correlation ID: stable for the duration of the SPA
 * session so log lines from the same browser tab can be grouped.
 */
let SESSION_ID: string | null = null;
export function getSessionCorrelationId(): string {
  if (SESSION_ID) return SESSION_ID;
  SESSION_ID = newCorrelationId();
  return SESSION_ID;
}

/** Merge correlation headers onto an existing HeadersInit without clobbering. */
export function withCorrelationHeaders(
  init: HeadersInit | undefined,
  correlationId: string = getSessionCorrelationId(),
): Headers {
  const headers = new Headers(init ?? {});
  if (!headers.has(CORRELATION_HEADER)) headers.set(CORRELATION_HEADER, correlationId);
  if (!headers.has(REQUEST_HEADER)) headers.set(REQUEST_HEADER, newCorrelationId());
  return headers;
}

/** Test-only: reset the session id. */
export function __resetCorrelationIdForTests() {
  SESSION_ID = null;
}