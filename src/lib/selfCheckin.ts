export const SELF_CHECKIN_TOKEN_LENGTH = 64;
const SELF_CHECKIN_TOKEN_PATTERN = /^[0-9a-fA-F]{64}$/;

export type SelfCheckinDetailsState = "ready" | "closed" | "invalid";
export type SelfCheckinResultState = "success" | "closed" | "invalid" | "error";
export type SelfCheckinUnavailableReason = "invalid" | "closed" | "clinic_unavailable";

export interface PublicSelfCheckinDetails {
  valid: boolean;
  status: string | null;
  tenant_name_en: string | null;
  tenant_name_ar: string | null;
  branch_name_en: string | null;
  branch_name_ar: string | null;
  scheduled_at: string | null;
  procedure_name: string | null;
  expires_at: string | null;
  reason?: string | null;
}

export interface PublicSelfCheckinResult {
  success: boolean;
  state: string | null;
  checked_in_at: string | null;
}

/** Validate the opaque token before it is ever sent to Supabase. */
export function isValidSelfCheckinToken(token: unknown): token is string {
  return typeof token === "string" && SELF_CHECKIN_TOKEN_PATTERN.test(token);
}

/** Read and normalize a token from a query string or full URL. */
export function getSelfCheckinToken(input: string): string | null {
  try {
    const url = new URL(input, "https://zmedico.invalid");
    const token = url.searchParams.get("token")?.trim() ?? "";
    return isValidSelfCheckinToken(token) ? token.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function mapSelfCheckinDetailsState(details: Partial<PublicSelfCheckinDetails> | null | undefined): SelfCheckinDetailsState {
  if (!details?.valid) return "invalid";
  if (details.status === "scheduled" || details.status === "confirmed") return "ready";
  return "closed";
}

// An absent or unknown reason falls back to "invalid": that is what the
// pre-reason RPC could express, and every refusal looked like an expired link.
export function selfCheckinUnavailableReason(
  details: Partial<PublicSelfCheckinDetails> | null | undefined,
): SelfCheckinUnavailableReason | null {
  if (details?.valid) return null;
  if (details?.reason === "closed" || details?.reason === "clinic_unavailable") return details.reason;
  return "invalid";
}

export function mapSelfCheckinResultState(result: Partial<PublicSelfCheckinResult> | null | undefined, hasNetworkError = false): SelfCheckinResultState {
  if (hasNetworkError) return "error";
  if (result?.success) return "success";
  if (result?.state === "closed") return "closed";
  if (result?.state === "invalid") return "invalid";
  return "error";
}

export function localizedClinicName(details: Pick<PublicSelfCheckinDetails, "tenant_name_en" | "tenant_name_ar">, language: "ar" | "en") {
  return language === "ar"
    ? details.tenant_name_ar || details.tenant_name_en || "ZMedico"
    : details.tenant_name_en || details.tenant_name_ar || "ZMedico";
}

export function localizedBranchName(details: Pick<PublicSelfCheckinDetails, "branch_name_en" | "branch_name_ar">, language: "ar" | "en") {
  return language === "ar"
    ? details.branch_name_ar || details.branch_name_en || ""
    : details.branch_name_en || details.branch_name_ar || "";
}
