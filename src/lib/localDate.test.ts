import { afterEach, describe, expect, it } from "vitest";
import { localDateOnly, localDateTimeInput } from "@/lib/localDate";

// A timezone flip only changes Date's output if Node recomputes its locale
// cache, which it does (verified on this host: Africa/Cairo -180 against
// America/Los_Angeles 420 for the same instant). The original value is always
// restored, so nothing after this file inherits it.
const originalTz = process.env.TZ;
const withTimezone = (tz: string, body: () => void) => {
  process.env.TZ = tz;
  try {
    body();
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
};

describe("localDateOnly", () => {
  it("formats the local calendar components as YYYY-MM-DD", () => {
    const date = new Date(2026, 7, 23, 23, 59, 0);
    expect(localDateOnly(date)).toBe("2026-08-23");
  });

  it("pads month and day values", () => {
    expect(localDateOnly(new Date(2026, 0, 2))).toBe("2026-01-02");
  });
});

describe("localDateTimeInput", () => {
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("names the wall-clock components the Date was built from", () => {
    expect(localDateTimeInput(new Date(2026, 6, 15, 14, 30))).toBe("2026-07-15T14:30");
    expect(localDateTimeInput(new Date(2026, 0, 2, 9, 5))).toBe("2026-01-02T09:05");
  });

  it("survives a round trip through a datetime-local input", () => {
    for (const tz of ["Africa/Cairo", "America/Los_Angeles", "UTC", "Asia/Kolkata"]) {
      withTimezone(tz, () => {
        // 23:45 local, so a UTC-derived value would land on the next calendar day.
        const instant = new Date(2026, 6, 15, 23, 45, 12, 340);
        const value = localDateTimeInput(instant);
        expect(new Date(value).getTime()).toBe(new Date(instant.getFullYear(), instant.getMonth(), instant.getDate(), 23, 45).getTime());
        expect(value.endsWith("T23:45")).toBe(true);
      });
    }
  });

  // A21: the create form of ScheduledReminders prefilled "one hour from now"
  // with `toISOString().slice(0, 16)`. <input type="datetime-local"> reads that
  // string as *local* wall clock, so on a UTC+3 desk the reminder was filed
  // three hours early — two hours before it was even created, i.e. overdue the
  // moment it was saved. The helper is the fix; this test is the drift guard.
  it("does not shift the instant when the value is read back as local time", () => {
    withTimezone("Africa/Cairo", () => {
      const instant = new Date(2026, 6, 15, 14, 30);
      expect(instant.getTimezoneOffset()).toBe(-180);
      expect(localDateTimeInput(instant)).toBe("2026-07-15T14:30");
      expect(new Date(localDateTimeInput(instant)).getTime()).toBe(instant.getTime());
      // What the replaced idiom did instead, measured rather than asserted in prose.
      expect(instant.toISOString().slice(0, 16)).toBe("2026-07-15T11:30");
      expect(new Date(instant.toISOString().slice(0, 16)).getTime()).toBe(instant.getTime() - 3 * 60 * 60 * 1000);
    });
  });

  it("follows the host offset instead of assuming one", () => {
    withTimezone("America/Los_Angeles", () => {
      const instant = new Date(2026, 6, 15, 14, 30);
      expect(localDateTimeInput(instant)).toBe("2026-07-15T14:30");
      expect(new Date(localDateTimeInput(instant)).toISOString()).toBe(instant.toISOString());
      // Half an hour and a second still round down to the minute the input shows.
      expect(localDateTimeInput(new Date(2026, 6, 15, 14, 30, 59, 999))).toBe("2026-07-15T14:30");
    });
  });

  it("stays correct across a daylight-saving boundary", () => {
    withTimezone("America/Los_Angeles", () => {
      // 01:30 and 02:30 on the spring-forward day do not both exist at -07:00.
      const before = new Date(2026, 2, 8, 1, 30);
      const after = new Date(2026, 2, 8, 3, 30);
      expect(localDateTimeInput(before)).toBe("2026-03-08T01:30");
      expect(localDateTimeInput(after)).toBe("2026-03-08T03:30");
      // getTimezoneOffset() is UTC-minus-local, so Los Angeles reads +480 before
      // the spring-forward day and +420 after it.
      expect(new Date(localDateTimeInput(before)).getTimezoneOffset()).toBe(480);
      expect(new Date(localDateTimeInput(after)).getTimezoneOffset()).toBe(420);
    });
  });
});
