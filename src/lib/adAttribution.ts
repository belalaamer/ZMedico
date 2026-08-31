// Captures ad/campaign attribution from the landing URL and keeps it for the
// session, so a booking made after navigating the multi-step flow still knows
// which campaign brought the visitor. First touch wins for the session.
// Nothing here is ever sent to Meta or any third party — it only rides along
// with the booking into our own database.
const STORAGE_KEY = "zmedico.ad_attribution";

const CAPTURED_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "campaign_id",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "fbclid",
  "gclid",
] as const;

export type AdAttribution = Partial<Record<(typeof CAPTURED_PARAMS)[number], string>> & {
  landing_page?: string;
  first_seen_at?: string;
};

export function getStoredAdAttribution(): AdAttribution | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as AdAttribution) : null;
  } catch {
    return null;
  }
}

export function captureAdAttribution(): AdAttribution | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const found: AdAttribution = {};
    let any = false;
    for (const key of CAPTURED_PARAMS) {
      const value = params.get(key);
      if (value) {
        found[key] = value.slice(0, 200);
        any = true;
      }
    }
    if (any && !getStoredAdAttribution()) {
      found.landing_page = window.location.pathname;
      found.first_seen_at = new Date().toISOString();
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(found));
    }
    return getStoredAdAttribution();
  } catch {
    return null;
  }
}
