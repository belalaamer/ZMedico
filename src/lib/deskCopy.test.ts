import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

// The path must reach `new URL` through a variable: Vite statically rewrites
// `new URL("<literal ending in .png/.ico/…>", import.meta.url)` into a
// dev-server asset URL, which node:url then refuses. Passing the argument
// through a function keeps it a real file path.
const exists = (relative: string) =>
  existsSync(fileURLToPath(new URL(relative, import.meta.url)));

const shipped = {
  ogImage: exists("../../public/og-image.png"),
  favicon: exists("../../public/favicon.ico"),
};

const html = read("../../index.html");
const boundary = read("../components/ErrorBoundary.tsx");
const i18nCtx = read("../contexts/I18nContext.tsx");
const queue = read("../pages/queue/Queue.tsx");
const detail = read("../pages/appointments/AppointmentDetail.tsx");
const dict = read("./i18n.ts");
const coreRoutes = read("../../tests/playwright/core-routes.admin.spec.ts");

// i18n.ts is one object with an `en` half and an `ar` half; DictKey is derived
// from `en`, so a key that exists only in `ar` is a type error and a key that
// exists only in `en` silently renders English to an Arabic desk.
const EN_BLOCK = dict.slice(dict.indexOf("export const dict = {"), dict.indexOf("  ar: {"));
const AR_BLOCK = dict.slice(dict.indexOf("  ar: {"));
const defines = (block: string, key: string) =>
  new RegExp(`^    ${key}:`, "m").test(block);

const contentOf = (attr: string) =>
  [...html.matchAll(new RegExp(`<meta[^>]*${attr}="([^"]+)"[^>]*content="([^"]*)"`, "g"))].map(
    (m) => ({ key: m[1], content: m[2] }),
  );

describe("index.html safe-area viewport (S5)", () => {
  const viewports = html.match(/<meta[^>]*name="viewport"[^>]*>/g) ?? [];

  it("has exactly one viewport declaration", () => {
    expect(viewports).toHaveLength(1);
  });

  it("opts into viewport-fit=cover so env(safe-area-inset-*) resolves", () => {
    expect(viewports[0]).toContain("viewport-fit=cover");
  });

  it("keeps the geometry rules that depend on it", () => {
    // The meta is only worth having while something still reads the insets;
    // if the last rule is ever deleted it becomes decoration again.
    const css = read("../index.css");
    expect((css.match(/env\(safe-area-inset-/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(read("../components/MobileBottomNav.tsx")).toContain("safe-area-inset");
  });
});

describe("index.html share metadata (S14)", () => {
  const og = contentOf("property");
  const tw = contentOf("name");
  const all = [...og, ...tw];
  const value = (key: string) => all.find((m) => m.key === key)?.content;

  it("never references the old product name", () => {
    expect(html).not.toContain("ZMed Care Connect");
    for (const m of all) expect(m.content).not.toContain("ZMed Care Connect");
  });

  it("says who the product is", () => {
    expect(value("og:site_name")).toBe("ZMedico");
    expect(value("og:title")).toBe("ZMedico");
    expect(value("twitter:title")).toBe("ZMedico");
    expect(html).toContain("<title>ZMedico</title>");
    for (const key of ["description", "og:description", "twitter:description"]) {
      expect(value(key)).toContain("ZMedico");
    }
  });

  it("does not attribute the product to the tool that scaffolded it", () => {
    expect(html).not.toMatch(/content="Lovable"/);
    expect(html).not.toMatch(/content="@Lovable"/);
    expect(html).not.toContain('name="twitter:site"');
  });

  it("serves the share image from this origin, not a vendor dev bucket", () => {
    // The head comment still names the old host to explain why it is gone, so
    // the check belongs on the tag values, not on the whole file.
    for (const m of all) {
      expect(m.content).not.toContain("r2.dev");
      expect(m.content).not.toContain("lovable.app");
    }
    expect(value("og:image")).toBe("https://zmedico.com/og-image.png");
    expect(value("twitter:image")).toBe("https://zmedico.com/og-image.png");
    // summary_large_image without a large image renders an empty card, so the
    // two have to move together.
    expect(value("twitter:card")).toBe("summary_large_image");
  });

  it("ships the image the tags promise", () => {
    expect(shipped.ogImage).toBe(true);
  });

  it("declares the favicon it relies on", () => {
    expect(html).toMatch(/<link rel="icon"[^>]*href="\/favicon\.ico"/);
    expect(shipped.favicon).toBe(true);
  });

  it("has no scaffold TODO left in the shipped head", () => {
    expect(html.slice(0, html.indexOf("</head>"))).not.toContain("TODO");
  });
});

describe("ErrorBoundary copy (S6)", () => {
  // Every string the card can show has to stay inside the Playwright crash
  // detector, or an Arabic crash makes core-routes.admin.spec.ts report the
  // route as healthy. The card is one block of text and the detector only
  // needs a single alternative to hit it, so the contract is per language.
  const CARD = {
    en: {
      heading: "Something went wrong",
      body: "The app hit an unexpected error while rendering. You can try again or reload the page.",
    },
    ar: {
      heading: "حدث خطأ غير متوقع",
      body: "تعذّر عرض هذه الصفحة بسبب خطأ غير متوقع. يمكنك إعادة المحاولة أو تحديث الصفحة.",
    },
  };

  const fatal = coreRoutes.match(/const FATAL_TEXT =\s*\n?\s*\/(.+?)\/[a-z]*;/);
  const detector = new RegExp(fatal?.[1] ?? "", "i");

  it("reads the fatal-text regex from the E2E spec", () => {
    expect(fatal).not.toBeNull();
    // An empty capture would become a match-everything regex and make the two
    // tests below pass for the wrong reason.
    expect(detector.test("Dashboard loaded fine")).toBe(false);
  });

  it.each(["en", "ar"] as const)(
    "keeps the %s card copy in the source and detectable by the E2E",
    (lang) => {
      const { heading, body } = CARD[lang];
      expect(boundary).toContain(`"${heading}"`);
      expect(boundary).toContain(`"${body}"`);
      expect(detector.test(`${heading} ${body}`)).toBe(true);
    },
  );

  it("keeps the headline of each language a detector literal on its own", () => {
    // A headline is what a screenshot reviewer reads; if it stops matching, the
    // crash goes unreported even though the body still says something.
    expect(detector.test(CARD.en.heading)).toBe(true);
    expect(detector.test(CARD.ar.heading)).toBe(true);
  });

  it("mirrors the language switch in both directions", () => {
    expect(boundary).toContain('dir={ar ? "rtl" : "ltr"}');
    expect(boundary).toContain('role="alert"');
  });

  it("reads the same storage key I18nContext writes", () => {
    const written = i18nCtx.match(/localStorage\.setItem\("([^"]+)", lang\)/);
    const readKey = boundary.match(/localStorage\.getItem\("([^"]+)"\)/);
    expect(written).not.toBeNull();
    expect(readKey?.[1]).toBe(written?.[1]);
  });

  it("supports exactly the languages the provider can store, and defaults alike", () => {
    const supported = [...i18nCtx.matchAll(/value === "(\w+)"/g)].map((m) => m[1]);
    expect(supported).toEqual(["en", "ar"]);
    // Anything the provider would not accept must land on the provider's own
    // default, or the card disagrees with the app about which language is on.
    const providerDefault = i18nCtx.match(/supportedLanguage\(stored\) \? stored : "(\w+)"/);
    expect(providerDefault?.[1]).toBe("en");
    expect(boundary).toContain('=== "ar" ? "ar" : "en"');
  });

  it("collapses the raw message in production but not in dev", () => {
    expect(boundary).toContain("open={import.meta.env.DEV}");
    expect(boundary).toContain("<details");
    expect(boundary).toContain("<summary");
  });

  it("keeps the observability and stale-chunk hooks intact", () => {
    expect(boundary).toContain('kind: "boundary"');
    expect(boundary).toContain("recoverFromStaleChunk(error)");
    expect(boundary).toContain("reportClientError(");
  });
});

describe("queue desk copy (C11)", () => {
  it("labels the wait with the dictionary instead of a bare unit", () => {
    expect(queue).toContain('t("minutesShort")');
    expect(queue).not.toMatch(/\} min"/);
  });

  it("never prints On/Off for a queue setting", () => {
    expect(queue).not.toMatch(/"\s*On\s*"\s*:\s*"Off"/);
    expect(queue).toContain('t("enabled")');
    expect(queue).toContain('t("disabled")');
    // t("off") means "day off" in Arabic — a boolean setting must not borrow it.
    expect(queue).not.toMatch(/settings\.[A-Za-z]+ \? t\("on"\) : t\("off"\)/);
  });

  it("formats the self-check-in deadline through the locale helper", () => {
    expect(queue).toContain('import { formatDateTime } from "@/lib/format"');
    expect(queue).toMatch(/formatDateTime\(selfCheckinExpiresAt, lang\)/);
    expect(queue).not.toMatch(/new Date\(selfCheckinExpiresAt\)\.toLocaleString/);
  });
});

describe("appointment detail desk copy (C11)", () => {
  it("threads the active language into every timestamp", () => {
    expect(detail).toMatch(/function fmt\(iso: string \| null \| undefined, lang/);
    // Any fmt(...) call that forgets `lang` renders en-US on an Arabic screen.
    const oneArg = detail.match(/[^a-zA-Z]fmt\([^,()]*\)/g) ?? [];
    expect(oneArg).toEqual([]);
    expect(detail).toContain('import { formatDateTime } from "@/lib/format"');
    expect(detail).toContain("formatDateTime(iso, lang)");
  });

  it("maps every appointment status the badge can receive onto a dictionary key", () => {
    const table = detail.match(
      /const STATUS_KEYS: Record<string, DictKey> = \{([\s\S]*?)\};/,
    );
    expect(table).not.toBeNull();
    const pairs = [...table?.[1].matchAll(/(\w+): "(\w+)"/g)];
    expect(pairs.map((p) => p[1]).sort()).toEqual(
      ["cancelled", "completed", "confirmed", "departed", "in_progress", "no_show", "scheduled"].sort(),
    );
    for (const [, status, key] of pairs) {
      expect(defines(EN_BLOCK, key)).toBe(true);
      expect(defines(AR_BLOCK, key)).toBe(true);
      expect(key).toMatch(/^status[A-Z]/);
      expect(status.length).toBeGreaterThan(0);
    }
  });

  it("falls back to readable text for a status it has never seen", () => {
    expect(detail).toMatch(
      /STATUS_KEYS\[String\(appt\.status\)\] \? t\(STATUS_KEYS\[String\(appt\.status\)\]\)/,
    );
    expect(detail).toContain('String(appt.status).replace(/_/g, " ")');
  });
});

describe("dictionary keys used by this batch", () => {
  const used = [
    "minutesShort",
    "enabled",
    "disabled",
    "linkExpires",
    "statusScheduled",
    "statusConfirmed",
    "statusInProgress",
    "statusCompleted",
    "statusCancelled",
    "statusNoShow",
    "statusDeparted",
  ];

  it.each(used)("%s exists in both halves of the dictionary", (key) => {
    expect(defines(EN_BLOCK, key)).toBe(true);
    expect(defines(AR_BLOCK, key)).toBe(true);
  });

  it("adds no keys, so it cannot collide with another branch's i18n edit", () => {
    expect(used.every((key) => defines(EN_BLOCK, key))).toBe(true);
  });
});
