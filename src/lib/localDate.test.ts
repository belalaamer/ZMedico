import { describe, expect, it } from "vitest";
import { localDateOnly } from "@/lib/localDate";

describe("localDateOnly", () => {
  it("formats the local calendar components as YYYY-MM-DD", () => {
    const date = new Date(2026, 7, 23, 23, 59, 0);
    expect(localDateOnly(date)).toBe("2026-08-23");
  });

  it("pads month and day values", () => {
    expect(localDateOnly(new Date(2026, 0, 2))).toBe("2026-01-02");
  });
});
