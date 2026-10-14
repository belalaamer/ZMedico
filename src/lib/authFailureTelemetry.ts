import { reportClientError } from "@/lib/observability/reportError";

const safeCodes = new Set([
  "weak_password", "same_password", "session_not_found", "session_expired",
  "reauthentication_needed", "reauthentication_not_valid", "over_request_rate_limit",
  "over_email_send_rate_limit", "otp_expired", "request_timeout", "user_banned",
]);

/** Never forward Auth messages, tokens, response bodies, passwords or email addresses. */
export function reportAuthFailure(
  operation: "verify-recovery" | "update-password" | "signout-after-password" | "send-recovery-link" | "patient-portal-login" | "patient-portal-password" | "patient-portal-activation",
  outcome: "rejected" | "transport" | "identity-mismatch",
  error?: unknown,
) {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const safeCode = typeof code === "string" && safeCodes.has(code) ? code : "unknown";
  void reportClientError({ kind: "error", component: "AuthRecovery", message: `auth.${operation}.${outcome}:${safeCode}` });
}
