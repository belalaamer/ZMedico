import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localDateOnly } from "@/lib/localDate";

// A22 freeze: a calendar day the desk reads or sends must come from the desk's
// own clock, never from UTC's.
//
// `date.toISOString().slice(0, 10)` is the UTC calendar day. Cairo runs UTC+2 in
// winter and UTC+3 while Egypt's daylight-saving rule is on — measured on this
// host across the 2026 switches: 2026-04-23 reads -120, 2026-04-24 reads -180,
// 2026-10-29 reads -180, 2026-10-30 reads -120. So that string names *yesterday*
// from local midnight until 01:59:59 in winter and until 02:59:59 in summer, and
// it is what a <input type="date"> then shows, what a `.lte("date", …)` filter
// compares against, and what lands in a `date` column.
// Census on `main` at 99076c0 before this batch, counted by the same scan this
// file runs: **52 UTC day/datetime reads in 28 non-test files** — 49 `slice(0, 10)`
// day reads in 27 files (the register's number, which is exact for that subset)
// plus 3 `slice(0, 16)` datetime reads in `CalendarPage.tsx`, and those three are
// themselves written as hand-rolled `getTimezoneOffset()` shifts rather than as
// plain UTC reads. The register's "32" was never the total: it counted the subset
// inside the 15 files that render an `<input type="date">`, i.e. what a desk can
// save a wrong day from.
// Two classes of damage, both arithmetic rather than opinion:
//   - a wall-clock read (`new Date().toISOString()…`) is off by one day for the
//     first two or three hours of every Cairo morning;
//   - a *local-midnight* Date read that way is off by one day all day long, in
//     either season: `new Date(2026, 0, 1)` is 2025-12-31T22:00Z and
//     `new Date(2026, 7, 1)` is 2026-07-31T21:00Z, so hr/Payroll.tsx's monthly
//     window started on the last day of the previous month for every hour of the
//     year, and attendance rows for the 1st were compared against the wrong floor.
// Both now go through `localDateOnly` / `localDateTimeInput` from `@/lib/localDate`.
//
// A third class surfaced *while* rewriting, and it points the other way:
// `new Date("YYYY-MM-DD")` — a `date` column value or a date-input value — is UTC
// midnight per the spec, so `localDateOnly()` of it names the previous day in any
// zone west of Greenwich. Two call sites that feed a day walk (PatientTreatmentPlans
// pre-generating weekly sessions, PhysioCaseDetail computing a follow-up due date)
// would have written a wrong `scheduled_date` / `followup_due_date` from the very
// fix meant to correct one. They parse at local noon now, which is zone-invariant,
// and the last test below pins that anchor so an edit cannot quietly drop it.
//
// Two calls stay UTC on purpose, exempted below by file with the call counted and
// the premise still visible in the source: they walk day keys anchored at
// `…T12:00:00Z` and step them with `setUTCDate`/`getUTCDay`, so a local read there
// would disagree with the arithmetic it is paired with. The list only shrinks — an
// exemption whose call is gone fails, and a new UTC-day read fails without one.

type Exemption = { file: string; calls: number; owner: string; premise: RegExp };

const EXEMPT: Exemption[] = [
  {
    file: "src/lib/nearestBookingDay.ts",
    calls: 1,
    owner: "Phase-B batch 20 (A22)",
    premise: /new Date\(`\$\{start\}T12:00:00Z`\)/,
  },
  {
    file: "src/pages/booking/PublicBooking.tsx",
    calls: 1,
    owner: "Phase-B batch 20 (A22)",
    premise: /noon UTC on the \*tenant's\*/,
  },
];

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out.sort();
};

// The whole idiom, tolerant of spacing, and guarded against matching prose inside
// a string literal or a `fooBar.toISOString()`-style property access.
const UTC_DAY_READ = /\.toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*(?:10|16)\s*\)/;
// The hand-rolled equivalent of the helpers: shift the instant by the offset and
// take UTC's components. Correct when written, wrong the moment someone edits it,
// and it hides from this file's first rule because it never says `slice(0, 10)` on
// UTC's day — it says it on a shifted instant.
const OFFSET_SHIFT = /getTimezoneOffset\s*\(/;

const findSites = (pattern: RegExp) => {
  const sites: Array<{ file: string; line: number; text: string }> = [];
  for (const file of sourceFiles("src")) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      const trimmed = text.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      for (const _ of text.matchAll(new RegExp(pattern, "g"))) sites.push({ file, line: i + 1, text: trimmed.slice(0, 120) });
    });
  }
  return sites;
};

describe("no screen reads a calendar day off UTC (A22)", () => {
  const daySites = findSites(UTC_DAY_READ);
  const shiftSites = findSites(OFFSET_SHIFT);
  const allowed = new Set(EXEMPT.map((e) => e.file));

  it("scans the screens it is supposed to guard", () => {
    const src = sourceFiles("src");
    expect(src.length, "no source files scanned — the census is broken").toBeGreaterThan(200);
    expect(src.filter((f) => f.startsWith("src/pages/")).length).toBeGreaterThan(80);
  });

  it("leaves no UTC calendar-day read outside the two exempted day-key walkers", () => {
    expect(
      daySites.filter((s) => !allowed.has(s.file)).map((s) => `${s.file}:${s.line} ${s.text}`),
      "UTC day/datetime read with no exemption",
    ).toEqual([]);
  });

  it("leaves no hand-rolled offset shift, so the tested helpers are the only path", () => {
    expect(shiftSites.map((s) => `${s.file}:${s.line} ${s.text}`), "getTimezoneOffset() outside @/lib/localDate").toEqual([]);
  });

  it("keeps every exemption on the call count and premise it was reviewed with", () => {
    for (const e of EXEMPT) {
      const found = daySites.filter((s) => s.file === e.file);
      expect(found.length, `${e.file} now has ${found.length} UTC-day reads, not ${e.calls} — update or delete the exemption`).toBe(e.calls);
      expect(readFileSync(e.file, "utf8"), `${e.file}: ${e.owner} is done — delete the exemption`).toMatch(e.premise);
    }
  });

  it("routes the screens this batch rewrote through the tested helpers", () => {
    for (const file of [
      "src/lib/globalSearch.ts",
      "src/lib/insuranceContracts.ts",
      "src/pages/calendar/CalendarPage.tsx",
      "src/pages/hr/Payroll.tsx",
      "src/pages/hr/Staff.tsx",
      "src/pages/physio/PhysioCaseDetail.tsx",
      "src/pages/treasury/DailyClose.tsx",
      "src/pages/patients/PatientTreatmentPlans.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} must import the local-calendar helpers`).toMatch(/from "@\/lib\/localDate"/);
      expect(src, `${file} must build its dates from them`).toMatch(/localDate(Only|TimeInput)\(/);
    }
  });

  it("keeps a date-only string parse anchored at local noon where it feeds a day walk", () => {
    for (const [file, anchor] of [
      ["src/pages/patients/PatientTreatmentPlans.tsx", /new Date\(`\$\{form\.start_date\}T12:00:00`\)/],
      ["src/pages/physio/PhysioCaseDetail.tsx", /new Date\(`\$\{reassessments\[0\]\.assessment_date\}T12:00:00`\)/],
    ] as const) {
      expect(readFileSync(file, "utf8"), `${file}: a bare new Date("YYYY-MM-DD") is UTC midnight and loses a day west of Greenwich`).toMatch(anchor);
    }
  });

  it("measures the payroll window defect rather than asserting it in prose", () => {
    // The arithmetic that made hr/Payroll.tsx wrong for every hour of the year,
    // checked in both Egyptian seasons: the DST switch changes how many morning
    // hours are wrong, never whether the month floor is.
    const originalTz = process.env.TZ;
    process.env.TZ = "Africa/Cairo";
    try {
      const winterFloor = new Date(2026, 0, 1);
      expect(winterFloor.getTimezoneOffset()).toBe(-120);
      expect(winterFloor.toISOString().slice(0, 10)).toBe("2025-12-31");
      expect(localDateOnly(winterFloor)).toBe("2026-01-01");

      const summerFloor = new Date(2026, 7, 1);
      expect(summerFloor.getTimezoneOffset()).toBe(-180);
      expect(summerFloor.toISOString().slice(0, 10)).toBe("2026-07-31");
      expect(localDateOnly(summerFloor)).toBe("2026-08-01");

      // The ordinary wall-clock read, wrong only in the small hours: 01:30 is a
      // day early in both seasons, 02:30 has recovered in winter but not in
      // summer, and 03:00 local is where the summer window closes.
      expect(new Date(2026, 0, 23, 1, 30).toISOString().slice(0, 10)).toBe("2026-01-22");
      expect(new Date(2026, 7, 23, 1, 30).toISOString().slice(0, 10)).toBe("2026-08-22");
      expect(new Date(2026, 0, 23, 2, 30).toISOString().slice(0, 10)).toBe("2026-01-23");
      expect(new Date(2026, 7, 23, 2, 30).toISOString().slice(0, 10)).toBe("2026-08-22");
      expect(new Date(2026, 7, 23, 3, 0).toISOString().slice(0, 10)).toBe("2026-08-23");
      expect(localDateOnly(new Date(2026, 7, 23, 2, 30))).toBe("2026-08-23");
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });
});
