import { describe, expect, it } from "vitest";
import { formatClinicTimestamp } from "./clinicTime";

// 8:00 PM in Cairo (UTC+2 in November) is 18:00 UTC.
const EVENING_UTC = "2026-11-04T18:00:00.000Z";

describe("formatClinicTimestamp", () => {
  it("renders a UTC instant on the Cairo clock with a 12-hour time", () => {
    const en = formatClinicTimestamp(EVENING_UTC, "en");
    expect(en).toContain("8:00:00 PM");
    expect(en).not.toContain("18:");
  });

  it("uses the Arabic meridiem marker with Latin digits", () => {
    const ar = formatClinicTimestamp(EVENING_UTC, "ar");
    expect(ar).toContain("8:00:00");
    expect(ar).toContain("م");
    expect(ar).not.toContain("PM");
    expect(ar).not.toMatch(/[٠-٩]/);
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(formatClinicTimestamp(new Date(EVENING_UTC), "en")).toBe(
      formatClinicTimestamp(EVENING_UTC, "en"),
    );
  });

  it("returns an empty string for an invalid timestamp", () => {
    expect(formatClinicTimestamp("not-a-date", "en")).toBe("");
  });
});
