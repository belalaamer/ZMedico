/**
 * Self-hosted browser error capture.
 *
 * Inserts one row into public.client_errors via Supabase.
 * Designed to be called from global window error handlers and
 * ErrorBoundary.componentDidCatch.
 *
 * Safety contract:
 *   - Never throws, never rejects (all paths wrapped in try/catch).
 *   - Never recurses (module-level boolean guard).
 *   - Throttles repeated fingerprints within 60 s.
 *   - Caps total inserts per page load at MAX_ERRORS_PER_SESSION.
 *   - Skips silently when no authenticated session exists.
 *   - Truncates message / stack to stay within DB CHECK constraints.
 *   - Never logs the URL query string (patient IDs may appear there).
 */

import { supabase } from "@/integrations/supabase/client";
import { getSessionCorrelationId } from "./correlationId";

type ErrorKind = "error" | "unhandledrejection" | "boundary";

export interface ReportClientErrorInput {
  kind: ErrorKind;
  message: string;
  stack?: string;
  component?: string;
  branch_id?: string;
}

// ── Safety limits ────────────────────────────────────────────────────────────
const MAX_MESSAGE_LEN = 2000;
const MAX_STACK_LEN = 8000;
const MAX_ERRORS_PER_SESSION = 25;
const THROTTLE_WINDOW_MS = 60_000;

// ── Module-level state ───────────────────────────────────────────────────────
/** Recursion guard: set to true while an insert is in-flight. */
let _reporting = false;

/** Running count of rows inserted this page load. */
let _errorCount = 0;

/** Throttle map: fingerprint → timestamp of last report. */
const _throttleMap = new Map<string, number>();

// ── Public API ───────────────────────────────────────────────────────────────
export async function reportClientError(
  input: ReportClientErrorInput
): Promise<void> {
  // 1. Recursion guard.
  if (_reporting) return;

  // 2. Volume cap.
  if (_errorCount >= MAX_ERRORS_PER_SESSION) return;

  // Wrap everything so a bug here never propagates to the caller.
  try {
    _reporting = true;

    // 3. Throttle: drop identical (kind + first 200 chars of message) within
    //    the window.
    const fingerprint =
      input.kind + "|" + input.message.slice(0, 200).replace(/\s+/g, " ");
    const now = Date.now();
    const lastSeen = _throttleMap.get(fingerprint);
    if (lastSeen !== undefined && now - lastSeen < THROTTLE_WINDOW_MS) {
      return;
    }
    _throttleMap.set(fingerprint, now);

    // 4. Session check — skip if no authenticated user (RLS rejects anonymous).
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const userId = session.user.id;

    // 5. Truncate to satisfy CHECK constraints.
    const message = input.message.slice(0, MAX_MESSAGE_LEN);
    const stack = input.stack ? input.stack.slice(0, MAX_STACK_LEN) : undefined;

    // 6. Build the row.  URL: path only — never include query string.
    const row = {
      user_id: userId,
      branch_id: input.branch_id ?? null,
      kind: input.kind,
      message,
      stack: stack ?? null,
      url: window.location.pathname,
      component: input.component ?? null,
      user_agent: navigator.userAgent,
      app_version:
        (import.meta as any)?.env?.VITE_APP_VERSION ?? null,
      correlation_id: getSessionCorrelationId(),
    };

    // 7. Insert — ignore any DB error (constraint violation, network issue…).
    await supabase.from("client_errors").insert(row);

    // 8. Increment only on successful path through (throttle already passed).
    _errorCount++;
  } catch {
    // Intentionally swallowed — telemetry must never surface to the user.
  } finally {
    _reporting = false;
  }
}
