// `public_create_booking_for_tenant` validates its whole envelope before it looks
// at anything else, and answers anything over these limits with one code,
// `invalid_booking_input`. Each number is a boundary measured on Production on
// 2026-10-28 — the last length accepted and the first refused — rather than a
// guess taken from a column definition, because every column the booking writes
// into (`patients.first_name_en`, `phone`, `email`, `notes`, `appointments.notes`)
// is unbounded `text`. Nothing but this guard caps them.
export const BOOKING_INPUT_LIMITS = {
  fullName: 160,
  phone: 40,
  email: 254,
  complaint: 2000,
  source: 100,
  metadataOctets: 8192,
  urlValue: 200,
} as const;

/**
 * URL-supplied text is clamped, never rejected: a patient cannot see or edit a
 * marketing parameter, so a long `utm_campaign` in a link somebody else built
 * used to fail their booking with a sentence they could not act on. `slice` is
 * the identity for anything already inside the limit, so no booking that
 * succeeded before this helper existed now sends a different value.
 */
export function clampUrlValue(value: string | null, max: number): string | null {
  return value === null ? null : value.slice(0, max);
}

/**
 * The RPC size-checks `p_metadata` as serialized octets, so every string that
 * rides in it is bounded here — including the stored attribution, whose values
 * `adAttribution.ts` already caps at 200 characters each except for
 * `landing_page`, which carried the whole pathname.
 */
export function buildGuestBookingMetadata(parts: {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingPath: string;
  attribution?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const limit = BOOKING_INPUT_LIMITS.urlValue;
  const metadata: Record<string, unknown> = {
    utm_source: clampUrlValue(parts.utmSource, limit),
    utm_medium: clampUrlValue(parts.utmMedium, limit),
    utm_campaign: clampUrlValue(parts.utmCampaign, limit),
    landing_path: parts.landingPath.slice(0, limit),
  };
  if (parts.attribution) {
    const attribution: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parts.attribution)) {
      attribution[key] = typeof value === "string" ? value.slice(0, limit) : value;
    }
    metadata.attribution = attribution;
  }
  return metadata;
}
