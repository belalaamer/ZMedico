// supabase.functions.invoke collapses every non-2xx into one fixed sentence and
// hides the response body, which is where the function's actual reason lives
// ("Too many attempts. Try again later." vs. "Batch too large"). Unwrapping it
// blindly would surface raw provider/Postgres text, because several functions
// return `error.message` verbatim. So the reason is only shown when it reads as
// a short human sentence; anything else falls back to the caller's own copy.
export type EdgeFailure = {
  message: string;
  status: number | null;
  code: string | null;
  body: Record<string, unknown> | null;
};

const MAX_REASON_WORDS = 14;
const MAX_REASON_CHARS = 160;

// Quotes, brackets, parens, angle brackets, URLs, file:line positions, identifiers
// and SQL keywords are all signatures of an internals leak rather than operator copy.
const UNSAFE = /[{}[\]()<>|"`\\]|https?:\/\/|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\btable\b|\bcolumn\b|SQLSTATE|supabase|service_role|Bearer|\b\d+:\d+\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

const GENERIC = [
  "Edge Function returned a non-2xx status code",
  "Failed to send a request to the Edge Function",
  "Relay Error invoking the Edge Function",
];

function safeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_REASON_CHARS) return null;
  if (text.split(" ").length > MAX_REASON_WORDS) return null;
  if (UNSAFE.test(text)) return null;
  // A bare code ("patient_email_required") is for the caller to translate, not to show.
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(text)) return null;
  if (GENERIC.some((g) => text.toLowerCase() === g.toLowerCase())) return null;
  return text;
}

/** Machine code from a function body, for callers that have copy for it. */
export function edgeCode(body: Record<string, unknown> | null): string | null {
  const code = body?.code ?? body?.error;
  return typeof code === "string" && /^[a-z0-9]+(_[a-z0-9]+)+$/.test(code) ? code : null;
}

/** Filter an arbitrary per-item reason (a results array entry) the same way. */
export function safeEdgeReason(value: unknown, fallback: string): string {
  return safeReason(value) ?? fallback;
}

function statusOf(error: any, body: Record<string, unknown> | null): number | null {
  const candidates = [error?.context?.status, error?.response?.status, body?.status];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n >= 100 && n <= 599) return n;
  }
  const fromMessage = /status code (\d{3})/i.exec(String(error?.message ?? ""));
  return fromMessage ? Number(fromMessage[1]) : null;
}

/** Never throws: an unreadable body degrades to the generic transport message. */
export async function describeEdgeFailure(error: unknown, fallback: string): Promise<EdgeFailure> {
  if (!error) return { message: fallback, status: null, body: null };
  const err: any = error;
  let body: Record<string, unknown> | null = null;
  try {
    const ctx = err?.context;
    if (ctx && typeof ctx.json === "function") {
      const parsed = await ctx.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    }
  } catch {
    body = null;
  }
  if (!body && err?.data && typeof err.data === "object") body = err.data as Record<string, unknown>;

  const status = statusOf(err, body);
  const code = edgeCode(body);
  // Only the function's own response body is ever rendered: transport messages
  // ("Failed to send a request…") are useless to an operator and some callers
  // put raw provider diagnostics in them.
  const message =
    safeReason(body?.error) ??
    safeReason(body?.message) ??
    safeReason(body?.error_description) ??
    fallback;
  return { message, status, code, body };
}

/** One call site can fail two ways: a non-2xx, whose reason sits in the body
 *  invoke withheld, or an HTTP 200 carrying `{ error }`. Both are read here so
 *  callers get one answer, filtered the same way. */
export async function invokeFailureReason(error: unknown, bodyError: unknown, fallback: string): Promise<string> {
  const f = await describeEdgeFailure(error, "");
  return f.message || safeEdgeReason(bodyError, fallback);
}

/** Numeric counters from a function body, so a summary line can be built
 *  without ever pasting server prose into the UI. */
export function edgeCount(body: Record<string, unknown> | null, key: string): number | null {
  const n = Number(body?.[key]);
  return Number.isFinite(n) ? n : null;
}
