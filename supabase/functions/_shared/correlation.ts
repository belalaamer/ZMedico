/**
 * Correlation-ID helpers for Edge Functions.
 *
 * Pattern:
 *   const cid = correlationIdFrom(req);
 *   const log = withCorrelation(cid);
 *   log.info("started", { path });
 *   return jsonResponse(body, 200, cid);
 *
 * Zero side effects unless a function chooses to use it. Introduced in
 * Sprint 2 alongside the frontend `withCorrelationHeaders` helper; call
 * sites will be wired in follow-up sprints per feature.
 */

export const CORRELATION_HEADER = "x-correlation-id";
export const REQUEST_HEADER = "x-request-id";

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newCorrelationId(): string {
  return randomHex(8);
}

export function correlationIdFrom(req: Request): string {
  return (
    req.headers.get(CORRELATION_HEADER) ??
    req.headers.get(REQUEST_HEADER) ??
    newCorrelationId()
  );
}

export function withCorrelationResponseHeaders(
  headers: HeadersInit,
  correlationId: string,
): HeadersInit {
  const merged = new Headers(headers);
  merged.set(CORRELATION_HEADER, correlationId);
  return merged;
}

export interface CorrelatedLogger {
  info: (msg: string, extra?: Record<string, unknown>) => void;
  warn: (msg: string, extra?: Record<string, unknown>) => void;
  error: (msg: string, extra?: Record<string, unknown>) => void;
}

export function withCorrelation(correlationId: string): CorrelatedLogger {
  const emit = (level: string) =>
    (msg: string, extra?: Record<string, unknown>) => {
      const payload = {
        level,
        msg,
        correlation_id: correlationId,
        ts: new Date().toISOString(),
        ...(extra ?? {}),
      };
      // Structured single-line JSON so log aggregators can parse it.
      console.log(JSON.stringify(payload));
    };
  return { info: emit("info"), warn: emit("warn"), error: emit("error") };
}