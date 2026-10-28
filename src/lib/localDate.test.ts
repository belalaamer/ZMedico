import { afterEach, describe, expect, it } from "vitest";
import { localDateOnly, localDateTimeInput } from "@/lib/localDate";

// A timezone flip only changes Date's output if Node recomputes its locale
// cache, which it does (verified on this host for 2026-07-15T14:30: Africa/Cairo
// reads -180 and America/Los_Angeles +420 for that same instant). Egypt switches
// seasons — UTC+2 in winter, UTC+3 from 24 Apr to 29 Oct 2026 — so every offset
// pinned below names the date it was measured on. The original TZ is always
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

  // A22: 52 sites in 28 non-test files built a <input type="date"> value, a
  // `.lte("date", …)` filter or a `date`-column write out of
  // `toISOString().slice(0, 10)`, which is UTC's calendar day. Cairo is UTC+2 in winter and UTC+3 in summer, so the two
  // disagree for the first two hours of a winter morning and the first three of a
  // summer one; a local-midnight Date such as a month floor disagrees for all
  // twenty-four on either side of the switch, which is how hr/Payroll.tsx cut the
  // first day of every month out of its own attendance window.
  it("names the local calendar day whatever the host offset is", () => {
    for (const tz of ["Africa/Cairo", "America/Los_Angeles", "UTC", "Asia/Kolkata"]) {
      withTimezone(tz, () => {
        expect(localDateOnly(new Date(2026, 7, 23, 1, 30))).toBe("2026-08-23");
      });
    }
  });

  it("does not slide a month floor back a day the way the UTC read did", () => {
    withTimezone("Africa/Cairo", () => {
      // Winter floor: UTC+2, so local midnight is still yesterday in UTC.
      const january = new Date(2026, 0, 1);
      expect(january.getTimezoneOffset()).toBe(-120);
      expect(localDateOnly(january)).toBe("2026-01-01");
      // What the replaced idiom did instead, measured rather than asserted in prose.
      expect(january.toISOString().slice(0, 10)).toBe("2025-12-31");
      // Summer floor: the DST hour widens the mistake, it does not cause it.
      const august = new Date(2026, 7, 1);
      expect(august.getTimezoneOffset()).toBe(-180);
      expect(localDateOnly(august)).toBe("2026-08-01");
      expect(august.toISOString().slice(0, 10)).toBe("2026-07-31");
      // The morning window, both seasons: 01:30 is a day early either way, while
      // 02:30 has recovered in winter and is still wrong in summer.
      expect(new Date(2026, 0, 23, 1, 30).toISOString().slice(0, 10)).toBe("2026-01-22");
      expect(new Date(2026, 7, 23, 1, 30).toISOString().slice(0, 10)).toBe("2026-08-22");
      expect(new Date(2026, 0, 23, 2, 30).toISOString().slice(0, 10)).toBe("2026-01-23");
      expect(new Date(2026, 7, 23, 2, 30).toISOString().slice(0, 10)).toBe("2026-08-22");
    });
  });

  it("follows the host offset instead of assuming one", () => {
    withTimezone("America/Los_Angeles", () => {
      expect(localDateOnly(new Date(2026, 7, 23, 1, 30))).toBe("2026-08-23");
      // Spring-forward day: both walls are still the same calendar day.
      expect(localDateOnly(new Date(2026, 2, 8, 1, 30))).toBe("2026-03-08");
      expect(localDateOnly(new Date(2026, 2, 8, 23, 30))).toBe("2026-03-08");
    });
  });

  // The mirror image of the A22 mistake, which this batch hit while rewriting:
  // a `date` column value or an <input type="date"> value is a bare "YYYY-MM-DD",
  // and `new Date(string)` of that is UTC midnight per the spec, so localDateOnly
  // names the *previous* day in any zone west of Greenwich. Feeding that through a
  // day walk put the wrong `scheduled_date` / `followup_due_date` on a row. Parsing
  // at local noon — the idiom PublicBooking's date picker already uses — is what
  // keeps a date-only string on its own calendar day everywhere.
  it("keeps a date-only string on its own day in every zone when parsed at noon", () => {
    for (const tz of ["Africa/Cairo", "America/Los_Angeles", "UTC", "Asia/Kolkata"]) {
      withTimezone(tz, () => {
        expect(localDateOnly(new Date("2026-08-23T12:00:00"))).toBe("2026-08-23");
      });
    }
    withTimezone("America/Los_Angeles", () => {
      // What the two call sites this batch corrected did instead, measured.
      expect(localDateOnly(new Date("2026-08-23"))).toBe("2026-08-22");
    });
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
  // moment it was saved. (Cairo is UTC+2 in winter, where the same code was one
  // hour early instead of two; the shift never depended on the season being on.)
  // The helper is the fix; this test is the drift guard.
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
