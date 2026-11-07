import { describe, expect, it } from "vitest";
import {
  PLATFORM_COPY_KEYS,
  PLATFORM_COPY_ROWS,
  branchCountLabel,
  daysLeftLabel,
  daysUntil,
  platformDate,
  platformText,
  rowCountLabel,
  subscriptionLabel,
  type PlatformCopyKey,
} from "./platformCopy";

// `platformCopy.ts` is the one bilingual table for the console, and its header promises
// that a row cannot lose a language. Nothing enforced that promise until this file: a key
// added with only an English string would render an English sentence in the Arabic
// console, which is the exact failure the table exists to prevent.

const ARABIC = /[\u0600-\u06FF]/;
const LATIN_WORD = /[A-Za-z]{2,}/;

// The craft standard's text tells. The class scanner reads JSX text and class lists, so a
// copy table written in a `.ts` file is invisible to it — these three are the rules that
// would otherwise slip through.
const TEXT_TELLS: Array<{ id: string; re: RegExp }> = [
  { id: "arrow-in-label", re: /[→←⟶⟵]/ },
  { id: "middle-dot-meta", re: /(?:^|\s)·(?:\s|$)/ },
  { id: "emoji-icon", re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?/u },
];

describe("the console's bilingual table", () => {
  it("has a table worth policing", () => {
    expect(PLATFORM_COPY_KEYS.length).toBeGreaterThan(100);
    expect(PLATFORM_COPY_KEYS.length).toBe(Object.keys(PLATFORM_COPY_ROWS).length);
  });

  it("carries exactly two languages on every row", () => {
    for (const key of PLATFORM_COPY_KEYS) {
      const row = PLATFORM_COPY_ROWS[key];
      expect(Array.isArray(row), `${key} is not a [ar, en] tuple`).toBe(true);
      expect(row, `${key} must be [ar, en]`).toHaveLength(2);
      expect(typeof row[0], `${key}[0] must be Arabic`).toBe("string");
      expect(typeof row[1], `${key}[1] must be English`).toBe("string");
      expect(row[0].trim().length, `${key} has no Arabic string`).toBeGreaterThan(0);
      expect(row[1].trim().length, `${key} has no English string`).toBeGreaterThan(0);
    }
  });

  it("never lets an Arabic row fall back to English", () => {
    for (const key of PLATFORM_COPY_KEYS) {
      expect(ARABIC.test(PLATFORM_COPY_ROWS[key][0]), `${key} Arabic string has no Arabic letter`).toBe(true);
    }
  });

  it("keeps Latin identifiers out of the translated sentence", () => {
    // Slugs, table names and codes are rendered in their own `Ident` element. A Latin word
    // inside the Arabic sentence would render in the wrong face with the wrong advance width.
    for (const key of PLATFORM_COPY_KEYS) {
      expect(LATIN_WORD.test(PLATFORM_COPY_ROWS[key][0]), `${key} Arabic string contains a Latin word`).toBe(false);
    }
  });

  it("carries no arrows, middle-dot joins or emoji in either language", () => {
    for (const key of PLATFORM_COPY_KEYS) {
      for (const [index, value] of PLATFORM_COPY_ROWS[key].entries()) {
        for (const tell of TEXT_TELLS) {
          expect(tell.re.test(value), `${key}[${index}] carries [${tell.id}]: ${value}`).toBe(false);
        }
      }
    }
  });

  it("picks the row by language, not by position at the call site", () => {
    for (const key of PLATFORM_COPY_KEYS) {
      expect(platformText(key, true)).toBe(PLATFORM_COPY_ROWS[key][0]);
      expect(platformText(key, false)).toBe(PLATFORM_COPY_ROWS[key][1]);
    }
  });
});

describe("counted nouns follow Arabic grammar, not a number suffix", () => {
  it("counts branches at zero, one, two, three-to-ten and above", () => {
    expect([0, 1, 2, 3, 10, 11, 25].map((n) => branchCountLabel(n, true))).toEqual([
      "لا فروع", "فرع واحد", "فرعان", "3 فروع", "10 فروع", "11 فرعًا", "25 فرعًا",
    ]);
  });

  it("counts rows the same way", () => {
    expect([0, 1, 2, 3, 10, 11].map((n) => rowCountLabel(n, true))).toEqual([
      "لا صفوف", "صف واحد", "صفّان", "3 صفوف", "10 صفوف", "11 صفًا",
    ]);
  });

  it("keeps the English forms simple and countable", () => {
    expect([0, 1, 2, 9].map((n) => branchCountLabel(n, false))).toEqual(["0 branches", "1 branch", "2 branches", "9 branches"]);
    expect([0, 1, 2].map((n) => rowCountLabel(n, false))).toEqual(["0 rows", "1 row", "2 rows"]);
  });
});

describe("statuses are words, never raw enum values", () => {
  it("translates every subscription status", () => {
    expect(subscriptionLabel("trial", true)).toBe("تجربة");
    expect(subscriptionLabel("active", true)).toBe("نشط");
    expect(subscriptionLabel("past_due", true)).toBe("متأخر السداد");
    expect(subscriptionLabel("cancelled", true)).toBe("ملغى");
    expect(subscriptionLabel("expired", true)).toBe("منتهٍ");
    expect(subscriptionLabel("past_due", false)).toBe("Past due");
  });

  it("passes an unknown status through rather than inventing a word for it", () => {
    expect(subscriptionLabel("suspended", false)).toBe("suspended");
    expect(subscriptionLabel("", false)).toBe("");
  });
});

describe("dates and terms read the same in both directions", () => {
  it("renders a dash instead of an invalid date", () => {
    expect(platformDate(null, false)).toBe("—");
    expect(platformDate(undefined, true)).toBe("—");
    expect(platformDate("", false)).toBe("—");
    expect(platformDate("not a date", false)).toBe("—");
  });

  it("keeps one numeral system on a platform surface", () => {
    // Western digits in both languages, so a figure never mixes numeral systems in one column.
    const ar = platformDate("2026-11-06T00:00:00.000Z", true);
    const en = platformDate("2026-11-06T00:00:00.000Z", false);
    expect(ar).toMatch(/2026/);
    expect(en).toMatch(/2026/);
    expect(ar).not.toMatch(/[\u0660-\u0669]/);
    expect(en).not.toMatch(/[\u0660-\u0669]/);
  });

  it("counts whole days to the end of a term", () => {
    const now = Date.parse("2026-11-06T00:00:00.000Z");
    expect(daysUntil("2026-11-06T00:00:00.000Z", now)).toBe(0);
    expect(daysUntil("2026-11-07T00:00:00.000Z", now)).toBe(1);
    expect(daysUntil("2026-11-05T00:00:00.000Z", now)).toBe(-1);
    // Any part of a remaining day rounds up, so a term is never shown as ending sooner
    // than it does — the console must not push an operator to renew a day early.
    expect(daysUntil("2026-11-07T06:00:00.000Z", now)).toBe(2);
  });

  it("says 'ends today' rather than '0 days left'", () => {
    expect([0, 1, 2, 9, 11].map((n) => daysLeftLabel(n, false))).toEqual([
      "ends today", "1 day left", "2 days left", "9 days left", "11 days left",
    ]);
    expect([0, 1, 2, 9, 11].map((n) => daysLeftLabel(n, true))).toEqual([
      "ينتهي اليوم", "يوم واحد متبقٍ", "يومان متبقيان", "9 أيام متبقية", "11 يومًا متبقيًا",
    ]);
  });
});

describe("the exported key list", () => {
  it("names every key that is actually rendered", () => {
    const rendered: PlatformCopyKey[] = ["eyebrow", "title", "archiveTitle", "deleteReceiptTitle", "restoreTitle"];
    for (const key of rendered) expect(PLATFORM_COPY_KEYS).toContain(key);
  });
});
