import { describe, expect, it } from "vitest";
import { BOOKING_INPUT_LIMITS, buildGuestBookingMetadata, clampUrlValue } from "./bookingInputLimits";

/**
 * These numbers are the server's, not the form's: `public_create_booking_for_tenant`
 * refuses anything over them with `invalid_booking_input`. What is checked here is
 * that the helpers do exactly what their names claim — clamp without dropping, and
 * keep a value that already fits byte-identical — because the whole point of P6 is
 * that a patient used to be told to retry something that could never succeed.
 */

describe("clampUrlValue", () => {
  it("passes a missing parameter through as null rather than as an empty string", () => {
    expect(clampUrlValue(null, 200)).toBeNull();
  });

  it("is the identity for anything already inside the limit", () => {
    expect(clampUrlValue("meta", 200)).toBe("meta");
    expect(clampUrlValue("x".repeat(200), 200)).toBe("x".repeat(200));
  });

  it("truncates at exactly the limit", () => {
    expect(clampUrlValue("x".repeat(500), 200)).toHaveLength(200);
  });
});

describe("BOOKING_INPUT_LIMITS", () => {
  it("registers a cap for every field the RPC's envelope guard measures", () => {
    expect(Object.keys(BOOKING_INPUT_LIMITS).sort()).toEqual([
      "complaint", "email", "fullName", "metadataOctets", "phone", "source", "urlValue",
    ]);
  });

  it("holds the boundaries measured on Production on 2026-10-28", () => {
    expect(BOOKING_INPUT_LIMITS).toMatchObject({ fullName: 160, phone: 40, email: 254, complaint: 2000, source: 100, metadataOctets: 8192 });
  });
});

describe("buildGuestBookingMetadata", () => {
  const base = { utmSource: null, utmMedium: null, utmCampaign: null, landingPath: "/book" };

  it("keeps the attribution key out of the envelope when there is none", () => {
    expect(buildGuestBookingMetadata({ ...base, attribution: null })).toEqual({
      utm_source: null, utm_medium: null, utm_campaign: null, landing_path: "/book",
    });
  });

  it("keeps an empty attribution object rather than dropping it, as the page did before", () => {
    expect(buildGuestBookingMetadata({ ...base, attribution: {} })).toEqual({
      utm_source: null, utm_medium: null, utm_campaign: null, landing_path: "/book", attribution: {},
    });
  });

  it("clamps every string, including the stored attribution's own landing page", () => {
    const metadata = buildGuestBookingMetadata({
      utmSource: "s".repeat(500),
      utmMedium: "m".repeat(500),
      utmCampaign: "c".repeat(500),
      landingPath: "/book/" + "p".repeat(500),
      attribution: { fbclid: "f".repeat(5000), landing_page: "/book/" + "q".repeat(5000), first_seen_at: "2026-10-28T00:00:00.000Z", matched: true },
    }) as Record<string, unknown>;
    expect(metadata.utm_source).toHaveLength(200);
    expect(metadata.landing_path).toHaveLength(200);
    const attribution = metadata.attribution as Record<string, unknown>;
    expect(attribution.fbclid).toHaveLength(200);
    expect(attribution.landing_page).toHaveLength(200);
    expect(attribution.first_seen_at).toBe("2026-10-28T00:00:00.000Z");
    // A non-string is left alone rather than quietly turned into null.
    expect(attribution.matched).toBe(true);
  });

  it("leaves a booking that was already inside the envelope untouched, key for key", () => {
    expect(buildGuestBookingMetadata({
      utmSource: "meta", utmMedium: "social", utmCampaign: "clinic-opening",
      landingPath: "/book", attribution: { gclid: "g", landing_page: "/book" },
    })).toEqual({
      utm_source: "meta",
      utm_medium: "social",
      utm_campaign: "clinic-opening",
      landing_path: "/book",
      attribution: { gclid: "g", landing_page: "/book" },
    });
  });

  it("cannot exceed the RPC's octet budget even with the largest key set it can carry", () => {
    // adAttribution.ts captures thirteen parameters and adds landing_page and
    // first_seen_at; this page adds four of its own. Every value is capped at
    // urlValue, so the worst case is arithmetic rather than hope.
    const attribution = Object.fromEntries(
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "campaign_id", "adset_id",
        "adset_name", "ad_id", "ad_name", "fbclid", "gclid", "landing_page", "first_seen_at"]
        .map((key) => [key, "x".repeat(BOOKING_INPUT_LIMITS.urlValue)]),
    );
    const serialized = JSON.stringify(buildGuestBookingMetadata({
      utmSource: "u".repeat(4000), utmMedium: "u".repeat(4000), utmCampaign: "u".repeat(4000),
      landingPath: "/".padEnd(4000, "p"), attribution,
    }));
    expect(new TextEncoder().encode(serialized).length).toBeLessThan(BOOKING_INPUT_LIMITS.metadataOctets);
  });
});
