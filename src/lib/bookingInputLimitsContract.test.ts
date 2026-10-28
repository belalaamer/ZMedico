import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOOKING_INPUT_LIMITS, buildGuestBookingMetadata } from "./bookingInputLimits";

/**
 * P6 is a pair of numbers that have to agree across two languages: the booking RPC's
 * envelope guard and the length the form is willing to type. Nothing in the build
 * links them, so this file does — it reads the guard out of the migrations rather
 * than out of its own memory of what 160 was, and it fails if the page ever stops
 * routing a cap through `BOOKING_INPUT_LIMITS`.
 *
 * The four numbers Production enforces and no migration versions yet (email 254,
 * complaint 2000, source 100, metadata 8192 octets) are bound to the literals
 * measured from `pg_get_functiondef` on Production on 2026-10-28, and each is
 * re-bound to the SQL automatically the day a migration starts carrying it.
 */

const sourceAt = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), "utf8");
const booking = sourceAt("src/pages/booking/PublicBooking.tsx");
const limits = sourceAt("src/lib/bookingInputLimits.ts");
const copy = sourceAt("src/lib/bookingFailureCopy.ts");

const GUARD_FIELDS: Record<string, { ui: keyof typeof BOOKING_INPUT_LIMITS; production: number }> = {
  p_full_name: { ui: "fullName", production: 160 },
  p_phone: { ui: "phone", production: 40 },
  p_email: { ui: "email", production: 254 },
  p_complaint: { ui: "complaint", production: 2000 },
  p_source: { ui: "source", production: 100 },
  p_metadata: { ui: "metadataOctets", production: 8192 },
};

const migrations = (): string[] => {
  const dir = path.resolve(process.cwd(), "supabase/migrations");
  return readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
};

/** The newest migration that redefines the guest booking RPC, plus every code it raises. */
const guestDefinition = (() => {
  const file = [...migrations()].reverse().find((name) =>
    sourceAt(`supabase/migrations/${name}`).includes("FUNCTION public.public_create_booking_for_tenant("),
  );
  expect(file, "no migration defines public_create_booking_for_tenant").toBeTruthy();
  const body = sourceAt(`supabase/migrations/${file}`);
  const guard = body.indexOf("RAISE EXCEPTION 'invalid_booking_input'");
  expect(guard, `${file} no longer raises invalid_booking_input`).toBeGreaterThan(-1);
  const start = body.lastIndexOf("IF ", guard);
  const end = body.indexOf("END IF;", guard);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(guard);
  return { file, body, statement: body.slice(start, end) };
})();

describe("the form's caps are the RPC's caps", () => {
  it.each(Object.entries(GUARD_FIELDS))("%s is capped in the UI at the number the guard enforces", (param, bound) => {
    const fromSql = bound.production === -1 ? null : (() => {
      const match = new RegExp(`\\b${param}\\b[^;]*?>\\s*(\\d+)`).exec(guestDefinition.statement);
      return match ? Number(match[1]) : null;
    })();
    expect(fromSql === null ? bound.production : fromSql, `${param} is stated twice and the two differ`).toBe(
      BOOKING_INPUT_LIMITS[bound.ui],
    );
  });

  it("names the two guard numbers that are still in the repo, and the four that are Production-only", () => {
    const inRepo = Object.entries(GUARD_FIELDS)
      .filter(([param]) => new RegExp(`\\b${param}\\b[^;]*?>\\s*\\d+`).test(guestDefinition.statement))
      .map(([param]) => param);
    // Reading this out loud rather than assuming it: at the base the repo versions
    // only name/phone. Production's live function also caps email, complaint,
    // source and the serialized metadata — an unversioned object (register §2aa).
    expect(inRepo).toEqual(["p_full_name", "p_phone"]);
  });

  it("caps every field the guard measures, and only those plus the URL clamp", () => {
    expect(Object.keys(BOOKING_INPUT_LIMITS).sort()).toEqual(
      [...Object.values(GUARD_FIELDS).map((bound) => bound.ui), "urlValue"].sort(),
    );
  });

  it("keeps the guard's own token as the one the screen explains", () => {
    expect(copy).toContain('message.includes("invalid_booking_input")');
    expect(guestDefinition.statement).toContain("RAISE EXCEPTION 'invalid_booking_input'");
  });
});

describe("the page routes every cap through the shared table", () => {
  const caps = () => [...booking.matchAll(/maxLength=\{([^}]*)\}/g)].map((match) => match[1]);

  it("has exactly four caps, and not one of them is a number typed into a field", () => {
    expect(caps()).toHaveLength(4);
    for (const cap of caps()) expect(cap).not.toMatch(/\d/);
    // Self-probe: the count is a count, not a regex that found nothing.
    expect(caps().every((cap) => cap.includes("BOOKING_INPUT_LIMITS"))).toBe(true);
  });

  /** One JSX element's own text, from its `id` to its closing `/>`. */
  const tagOf = (id: string) => {
    const start = booking.indexOf(`id="${id}"`);
    expect(start, `the page no longer renders #${id}`).toBeGreaterThan(-1);
    const end = booking.indexOf("/>", start);
    expect(end, `#${id} is not a self-closing element`).toBeGreaterThan(start);
    return booking.slice(start, end);
  };

  it("binds each input to the field it belongs to", () => {
    // Matching inside the element rather than across the file: a `maxLength` that
    // belongs to a neighbouring field would satisfy a whole-file `toContain`.
    expect(tagOf("booking-name")).toContain("maxLength={BOOKING_INPUT_LIMITS.fullName}");
    expect(tagOf("booking-phone")).toContain("maxLength={BOOKING_INPUT_LIMITS.phone}");
    expect(tagOf("booking-email")).toContain("maxLength={BOOKING_INPUT_LIMITS.email}");
    expect(tagOf("booking-complaint")).toContain("maxLength={isPortalPatient ? undefined : BOOKING_INPUT_LIMITS.complaint}");
  });

  it("leaves the portal patient's reason uncapped, because their RPC raises no length error", () => {
    expect(limits).toContain("complaint: 2000");
    // The portal RPC's own body decides this, so check the guard is absent there.
    const portal = [...migrations()].reverse().find((name) =>
      sourceAt(`supabase/migrations/${name}`).includes("FUNCTION public.patient_portal_create_booking("),
    );
    expect(portal).toBeTruthy();
    const portalBody = sourceAt(`supabase/migrations/${portal}`);
    const slice = portalBody.slice(portalBody.indexOf("CREATE OR REPLACE FUNCTION public.patient_portal_create_booking"));
    expect(slice.slice(0, slice.indexOf("$function$", 1))).not.toMatch(/invalid_booking_input|length\(trim\(p_complaint\)/);
  });

  it("builds the guest envelope through the helpers rather than inline", () => {
    expect(booking).toContain("p_metadata: buildGuestBookingMetadata({");
    // The one invariant that matters for a URL the patient cannot edit: `p_source`
    // is never handed a raw parameter. (`params.get("utm_source")` itself appears
    // three times in the file — here clamped, once as the helper's `utmSource`
    // argument, and once in the portal envelope, whose RPC sets no length guard.)
    expect(booking).not.toMatch(/p_source:\s*params\.get/);
    expect(booking).toMatch(/p_source:\s*clampUrlValue\(params\.get\("utm_source"\), BOOKING_INPUT_LIMITS\.source\)/);
  });
});

describe("the sentences the screen owns live in one place", () => {
  const baseSentences = [
    "هذا الموعد حُجز للتو. اختر وقتًا آخر.",
    "This time was just booked. Please choose another time.",
    "اكتب رقم هاتف صحيحًا.",
    "Enter a valid phone number.",
    "تعذر التحقق من حساب بوابة المريض. أعد تحميل الصفحة وحاول مرة أخرى.",
    "Could not verify your patient portal account. Reload the page and try again.",
    "تعذر إتمام الحجز. حاول مرة أخرى.",
    "We could not complete the booking. Please try again.",
  ];

  it("keeps the page free of inline failure copy", () => {
    for (const sentence of baseSentences) {
      expect(booking, `the page prints "${sentence}" inline again`).not.toContain(sentence);
      expect(copy).toContain(sentence);
    }
    expect(booking).toContain("toast.error(bookingFailureCopy(message, isArabic))");
  });

  it("keeps the four branches and the one default the screen has always had", () => {
    expect((copy.match(/message\.includes\(/g) ?? []).length).toBe(4);
    // Self-probe: a copy file with no branches at all would otherwise pass the
    // count above as zero-of-nothing.
    expect((copy.match(/return isArabic/g) ?? []).length).toBe(5);
  });

  it("keeps the slot side effect that only the page can do", () => {
    // The sentence moved into the copy module; the state it resets could not.
    expect(booking).toMatch(/if \(message\.includes\("slot_unavailable"\)\) \{\s*setStep\(2\);\s*setSelectedSlot\(null\);\s*\}/);
  });

  it("explains only codes the SQL actually raises", () => {
    const raised = new Set<string>();
    for (const name of migrations()) {
      for (const match of sourceAt(`supabase/migrations/${name}`).matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)) {
        raised.add(match[1]);
      }
    }
    // Non-vacuous: the scan has to find a real vocabulary before it can vouch for one.
    expect(raised.size).toBeGreaterThan(20);
    for (const match of copy.matchAll(/message\.includes\("([a-z_]+)"\)/g)) {
      expect([...raised].includes(match[1]), `${match[1]} is explained but nothing raises it`).toBe(true);
    }
  });
});

describe("the metadata budget is a function of the vocabulary it was measured against", () => {
  /**
   * `getStoredAdAttribution()` returns whatever `sessionStorage` holds, cast to
   * `AdAttribution` — it validates that the value is an object, not which keys it
   * has. So clamping every *value* at 200 bounds the serialized document only for
   * the key set the app actually produces. Rather than freeze a private list, this
   * derives it from the module that owns it: the day `CAPTURED_PARAMS` grows, the
   * arithmetic below re-runs against the longer list and either still fits or fails
   * with a stated reason.
   */
  const declaredAttributionKeys = () => {
    const ad = sourceAt("src/lib/adAttribution.ts");
    const start = ad.indexOf("const CAPTURED_PARAMS = [");
    expect(start, "adAttribution.ts no longer declares CAPTURED_PARAMS as a literal array").toBeGreaterThan(-1);
    const end = ad.indexOf("] as const", start);
    expect(end, "CAPTURED_PARAMS no longer ends with `] as const`").toBeGreaterThan(start);
    const region = ad.slice(start, end);
    const captured = [...region.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    // The scan has to be as wide as the region. A key it could not name would
    // shrink the vocabulary the budget case below vouches for while still
    // reporting success, which is the one way this guard could lie.
    expect((region.match(/["']/g) ?? []).length, "a string literal in CAPTURED_PARAMS was not picked up by the scan")
      .toBe(captured.length * 2);
    expect(captured.length, "the captured-parameter scan found nothing").toBeGreaterThan(10);
    // The two fields `captureAdAttribution()` writes itself, not read off the URL.
    expect(ad).toContain("found.landing_page = window.location.pathname;");
    expect(ad).toContain("found.first_seen_at = new Date().toISOString();");
    return [...captured, "landing_page", "first_seen_at"];
  };

  it("keeps every declared attribution key inside the RPC's octet budget when all are maximal", () => {
    const keys = declaredAttributionKeys();
    const attribution = Object.fromEntries(keys.map((key) => [key, "x".repeat(5000)]));
    const metadata = buildGuestBookingMetadata({
      utmSource: "s".repeat(5000),
      utmMedium: "m".repeat(5000),
      utmCampaign: "c".repeat(5000),
      landingPath: "/".padEnd(5000, "p"),
      attribution,
    });
    expect(Object.keys(metadata.attribution as object)).toEqual(keys);
    expect(new TextEncoder().encode(JSON.stringify(metadata)).length)
      .toBeLessThan(BOOKING_INPUT_LIMITS.metadataOctets);
  });

  it("counts the vocabulary it is vouching for, so a widened one is a decision", () => {
    // Measured at this base; `declaredAttributionKeys()` is what the budget case
    // above actually enumerates, and this is the difference between a checked
    // bound and a remembered one.
    expect(declaredAttributionKeys()).toEqual([
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "campaign_id",
      "adset_id", "adset_name", "ad_id", "ad_name", "fbclid", "gclid", "landing_page", "first_seen_at",
    ]);
  });
});
