import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enumLabel } from "@/lib/enumLabels";
import {
  APPOINTMENT_STATUS_KEY,
  DOCUMENT_TYPE_KEY,
  EXPENSE_METHOD_KEY,
  GENDER_KEY,
  PAYMENT_METHOD_KEY,
  REASON_KEY_BY_STOCK_ADJUSTMENT,
  REMINDER_CHANNEL_KEY,
  REMINDER_STATUS_KEY,
  REPORT_FREQUENCY_KEY,
  STATUS_KEY_BY_APPOINTMENT_STATUS,
  STATUS_KEY_BY_LEAVE_REQUEST_STATUS,
  STATUS_KEY_BY_PAYROLL_STATUS,
  TOOTH_STATUS_KEY,
  TREASURY_TX_TYPE_KEY,
  VISIT_TYPE_KEY,
  WALLET_TX_TYPE_KEY,
  documentTypeLabel,
  enumCopy,
  visitTypeLabel,
} from "@/lib/enumKeys";
import { dict } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n";

// C18 freeze: a translation key built by arithmetic is a key nobody checked.
//
// `t()` is typed `(k: DictKey) => string` and answers a key the dictionary does
// not hold with the key itself (I18nContext.tsx:110), so every one of these
// calls ends in `as any` — the cast that removes the only guarantee the typing
// had. The sweep found eleven `t()` calls living outside that guarantee: nine
// that build their key (`"visit_" + r.visit_type`, `` `status${x}` ``) and two
// that cast a literal, which is only possible because the compiler had already
// refused the word. Five of the eleven printed a fabricated key:
//
//   t(("visit_" + r.visit_type) as any)      -> "visit_follow_up" on both desks
//   t(("doc" + camelize(d.document_type)))   -> "docLabresult", "docCtscan"
//   t("totals" as any) ?? "Total"            -> "totals", twice, on the chart's
//                                               procedures-and-invoice table
//
// The dictionaries never had a `visit_*` key: the words ship as `visitFollowUp`,
// `docLabResult`, `docCt`. `t` returned the fabricated key, `?? raw` never fired
// because a miss is a truthy string, and the screen printed `visit_consultation`
// to a Cairo receptionist and to the English desk alike.
//
// The other six derive a key that does exist, so they read correctly today and
// were registered rather than rewritten. Registered sites are still worth
// freezing: their value space is read from the same places the app reads it —
// the generated enum unions and the local literal array — so the test proves the
// derivation lands on a real key for every value it can be handed, and fails the
// day a value is added that it does not.
//
// Batch 23 (C21) rewrote them. The registry that held those five sites is gone:
// each derivation is now a `Record<domain, DictKey>` in lib/enumKeys read through
// `enumCopy()`, so no screen composes a key, no call needs a cast, and the
// totality proof the registry supplied by arithmetic is supplied by the compiler.
// The two shape detectors below stay, asserted against probes and required to
// find zero sites — the accounting was replaced by the fix, not relaxed.

const enKeys = new Set(Object.keys(dict.en));
const arKeys = new Set(Object.keys(dict.ar));

/** A derived site the sweep measured, the shape it derives, and every value it
 *  can be handed. `values()` is read from disk, not restated from memory.
 *
 *  Batch 23 retired the registry: the four domains it held are typed maps in
 *  lib/enumKeys now, described by `Prefixed` below, and the tree has no site
 *  that composes a key. `TRANSFORMS` survives because it is how the maps are
 *  proven to name the keys the derivations computed. */
type Transform = "upperFirst" | "upperFirstCamel";

const TRANSFORMS: Record<Transform, (v: string) => string> = {
  upperFirst: (v) => v.charAt(0).toUpperCase() + v.slice(1),
  // Dashboard's own chain: raise the first letter, then each letter after an
  // underscore, so `in_progress` derives statusInProgress, not statusIn_progress.
  upperFirstCamel: (v) =>
    v.charAt(0).toUpperCase() + v.slice(1).replace(/_(.)/g, (_, c: string) => c.toUpperCase()),
};

/** One of the four replaced derivations: the prefix it built, the transform it
 *  applied, the map that stands in for it, and where its value space lives. */
type Prefixed = {
  screen: string;
  prefix: "status" | "reason";
  transform: Transform;
  map: Record<string, DictKey>;
  /** The Postgres domain the column is typed with, when there is one — `domain`
   *  is what lets the C19 recount compare this route against `enumLabel()`. */
  domain?: "appointment_status" | "leave_request_status" | "payroll_status";
  values: () => string[];
  names: string;
};

const PREFIXED: Prefixed[] = [
  {
    screen: "src/pages/dashboard/Dashboard.tsx",
    prefix: "status",
    transform: "upperFirstCamel",
    domain: "appointment_status",
    map: STATUS_KEY_BY_APPOINTMENT_STATUS,
    values: () => enumValues("appointment_status"),
    names: "the appointment_status enum",
  },
  {
    screen: "src/pages/hr/Leaves.tsx",
    prefix: "status",
    transform: "upperFirst",
    domain: "leave_request_status",
    map: STATUS_KEY_BY_LEAVE_REQUEST_STATUS,
    values: () => enumValues("leave_request_status"),
    names: "the leave_request_status enum",
  },
  {
    screen: "src/pages/hr/Payroll.tsx",
    prefix: "status",
    transform: "upperFirst",
    domain: "payroll_status",
    map: STATUS_KEY_BY_PAYROLL_STATUS,
    values: () => enumValues("payroll_status"),
    names: "the payroll_status enum",
  },
  {
    screen: "src/pages/inventory/StockOverview.tsx",
    prefix: "reason",
    transform: "upperFirst",
    map: REASON_KEY_BY_STOCK_ADJUSTMENT,
    values: () => constStringArray("src/pages/inventory/StockOverview.tsx", "REASONS"),
    names: "the REASONS array the adjustment dialog is built from",
  },
];

// Three keys exist in the Arabic dictionary and not in the English one. They are
// unreachable, not a bug: `DictKey = keyof typeof dict["en"]` (i18n.ts:2305), so
// `t("create")` is a type error and no screen can name them without a cast. They
// stay because deleting a dictionary entry is a copy decision, not a safety one.
// The premise is that they stay unnameable — the day a screen casts one into
// `t()`, the exemption dies and the English dictionary has to gain the word.
const AR_ONLY: Array<{ key: string; owner: string }> = [
  { key: "create", owner: "no t() call site names it" },
  { key: "logo", owner: "no t() call site names it" },
  { key: "view", owner: "no t() call site names it" },
];

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(tsx|ts)$/.test(entry.name) && !/\.(test|spec)\.(tsx|ts)$/.test(entry.name)) out.push(path);
  }
  return out.sort();
};

const CONCAT_SHAPE = /\bt\(\s*\(\s*"([a-z][A-Za-z0-9_]*)"\s*\+/g;
const TEMPLATE_SHAPE = /\bt\(\s*`([a-z][A-Za-z0-9_]*)\$\{/g;
const LITERAL_CAST_SHAPE = /\bt\(\s*"([^"]+)"\s+as\s+[a-z][\w<>\[\]"'| ]*\s*\)/g;

const findDerivedSites = () => {
  const sites: Array<{ file: string; line: number; prefix: string; shape: "concat" | "template" }> = [];
  for (const file of sourceFiles("src")) {
    readFileSync(file, "utf8").split("\n").forEach((raw, i) => {
      const trimmed = raw.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      for (const m of raw.matchAll(CONCAT_SHAPE)) sites.push({ file, line: i + 1, prefix: m[1], shape: "concat" });
      for (const m of raw.matchAll(TEMPLATE_SHAPE)) sites.push({ file, line: i + 1, prefix: m[1], shape: "template" });
    });
  }
  return sites;
};

/** Every `t("literal" as …)` in the tree — the same escape hatch, used on a
 *  word instead of a computation. A literal only needs a cast when the type
 *  has already rejected it, which is how `totals` survived: `total` is the key,
 *  `totals` is a column header that read "totals" on both desks. */
const findLiteralCasts = () => {
  const sites: Array<{ file: string; line: number; key: string }> = [];
  for (const file of sourceFiles("src")) {
    readFileSync(file, "utf8").split("\n").forEach((raw, i) => {
      const trimmed = raw.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      for (const m of raw.matchAll(LITERAL_CAST_SHAPE)) sites.push({ file, line: i + 1, key: m[1] });
    });
  }
  return sites;
};

/** The union the generated Postgres client declares for an enum domain. */
function enumValues(name: string): string[] {
  const src = readFileSync("src/integrations/supabase/types.ts", "utf8");
  const block = new RegExp(`\\n {6}${name}:\\n((?: {8}\\| "[^"]+"\\n)+)`).exec(src);
  const oneLine = new RegExp(`\\n {6}${name}: ("[^\\n]+)\\n`).exec(src);
  const text = block?.[1] ?? oneLine?.[1];
  expect(text, `types.ts declares no enum named ${name}`).toBeTruthy();
  return [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function constStringArray(file: string, name: string): string[] {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(readFileSync(file, "utf8"));
  expect(m, `${file} no longer declares a const ${name} array`).not.toBeNull();
  return [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("no screen derives a translation key the dictionaries do not define (C18)", () => {
  const sites = findDerivedSites();

  it("reads the dictionaries it is asserting against", () => {
    // A parse that silently returns an empty set passes every membership check.
    expect(enKeys.size, "English dictionary parsed empty — the census is broken").toBeGreaterThan(1000);
    expect(arKeys.size).toBeGreaterThan(1000);
    expect(enKeys.has("visitFollowUp")).toBe(true);
    expect(arKeys.has("visitFollowUp")).toBe(true);
  });

  it("catches the derived shapes and the cast-literal shape", () => {
    // A detector that stops matching is worse than no detector: these are the
    // three strings the sweep found before the batch, on a scratch buffer.
    const probe = 't(("visit_" + r.visit_type) as any) and t(`status${x}` as any) and t("totals" as any) ?? "Total"';
    expect([...probe.matchAll(CONCAT_SHAPE)].map((m) => m[1])).toEqual(["visit_"]);
    expect([...probe.matchAll(TEMPLATE_SHAPE)].map((m) => m[1])).toEqual(["status"]);
    expect([...probe.matchAll(LITERAL_CAST_SHAPE)].map((m) => m[1])).toEqual(["totals"]);
  });

  it("keeps a cast off the literal keys t() is typed to check", () => {
    // Zero is the whole rule here: `t("x")` compiles exactly when the dictionary
    // holds "x" in English, so a cast on a literal means the author was told the
    // key does not exist and answered by muting the compiler. Two sites were
    // measured that way at c053066, both `t("totals" as any)`, both fixed to
    // t("total") in this batch — a ratchet, not a restatement of the fix.
    const casts = findLiteralCasts();
    expect(
      casts.map((s) => `${s.file}:${s.line} t("${s.key}" as …)`),
      `a literal translation key is being cast past DictKey: ${casts.map((s) => s.key).join(", ") || "none"}. Name a key the dictionaries hold instead`,
    ).toEqual([]);
    // The census must be able to see a real site, or "zero" means nothing.
    const probe = sourceFiles("src").length;
    expect(probe, "the sweep read no source files").toBeGreaterThan(150);
    expect([...'  {t("totals" as any) ?? "Total"}'.matchAll(LITERAL_CAST_SHAPE)].map((m) => m[1])).toEqual(["totals"]);
  });

  it("labels the procedures-and-invoice total with a word, not a key", () => {
    // The one visible symptom of the two cast sites, asserted where it was
    // fixed: this table printed its own column header as a dictionary key.
    const src = readFileSync("src/pages/medical/MedicalRecordEditor.tsx", "utf8");
    expect(src).not.toContain('t("totals"');
    expect(dict.en.total).toBe("Total");
    expect(dict.ar.total).toBe("الإجمالي");
  });

  it("keeps zero screens composing a translation key", () => {
    // Batch 22 registered five sites that derived a real key and froze them by
    // file and prefix; batch 23 replaced every one with a typed map, so the rule
    // is now the stronger one — nothing in the tree builds a key by arithmetic.
    // The shape detectors above are what make this zero a measurement rather
    // than a blind spot: they still match the concat and template forms.
    expect(
      sites.map((s) => `${s.file}:${s.line} derives its key from "${s.prefix}"`),
      "a t() call builds its key from a string — name it in a typed map instead"
    ).toEqual([]);
    expect(sourceFiles("src").length, "the derivation sweep read no source files").toBeGreaterThan(150);
  });

  it("names the key each replaced derivation computed, for every value it can hold", () => {
    // The copy-neutrality proof for the four rewritten derivations: the map has
    // to hold, for each value, exactly the string the old `` `status${…}` ``
    // expression produced, and that string has to be a real key in both
    // dictionaries. Both desks read the word they read before — the arithmetic
    // left the screen, the words did not change.
    for (const p of PREFIXED) {
      const values = p.values();
      expect(values.length, `${p.screen}: ${p.names} came back empty`).toBeGreaterThan(0);
      expect(
        Object.keys(p.map).sort(),
        `${p.screen}: the map and ${p.names} no longer hold the same values`
      ).toEqual([...values].sort());
      for (const v of values) {
        const derived = p.prefix + TRANSFORMS[p.transform](v);
        expect(p.map[v], `${p.screen}: "${v}" derived "${derived}"; the map names "${p.map[v]}"`).toBe(derived);
        expect(enKeys.has(derived), `${p.screen}: "${derived}" is not an English key`).toBe(true);
        expect(arKeys.has(derived), `${p.screen}: "${derived}" has no Arabic entry`).toBe(true);
      }
    }
  });

  it("resolves every key the typed enum maps name, in both dictionaries", () => {
    for (const [domain, map] of [["visit_type", VISIT_TYPE_KEY], ["document_type", DOCUMENT_TYPE_KEY]] as const) {
      for (const [value, key] of Object.entries(map)) {
        expect(enKeys.has(key), `${domain}.${value} -> "${key}" is not an English key`).toBe(true);
        expect(arKeys.has(key), `${domain}.${value} -> "${key}" is not an Arabic key`).toBe(true);
      }
    }
  });

  it("covers the whole enum the client types those columns with", () => {
    // tsc already proves the maps are total over the generated union; this
    // proves the union in the file on disk still has every stored label, so a
    // migration that adds one is caught here even before a screen renders it.
    expect(Object.keys(VISIT_TYPE_KEY).sort()).toEqual(enumValues("visit_type").sort());
    expect(Object.keys(DOCUMENT_TYPE_KEY).sort()).toEqual(enumValues("document_type").sort());
  });

  it("gives every stored value one Arabic word, not two", () => {
    // The badge and the form control under it are read by the same person. The
    // dictionaries own the word; enumLabel() may not invent a second one.
    for (const [domain, map] of [["visit_type", VISIT_TYPE_KEY], ["document_type", DOCUMENT_TYPE_KEY]] as const) {
      for (const [value, key] of Object.entries(map)) {
        expect(enumLabel(domain, value, "ar"), `${domain}="${value}": the badge says one word, the dropdown another`).toBe(dict.ar[key]);
      }
    }
    // payment_method reaches its word by a third route: the dictionary keys five
    // of them under their stored names (i18n.ts:185-190), so `t(p.payment_method
    // as any)` on the payments screen and enumLabel("payment_method", …) in the
    // search list are two ways of asking for the same entry. They must stay one
    // vocabulary — and this is the only place the coincidence is written down.
    const arabic = dict.ar as unknown as Record<string, string>;
    for (const value of enumValues("payment_method")) {
      expect(enumLabel("payment_method", value, "ar"), `payment_method="${value}": enumLabel and t(raw) must agree`).toBe(arabic[value]);
    }
  });

  it("keeps a label helper that needs the dictionary honest about what English shows", () => {
    // enumLabel() is deliberately Arabic-only, so the English desk still reads
    // the stored token there while visitTypeLabel() gives it a word. Asserted
    // rather than assumed: if that asymmetry is ever closed, this fails and the
    // trade gets re-reviewed instead of drifting silently.
    expect(visitTypeLabel("follow_up", (k) => dict.en[k])).toBe("Follow-up");
    expect(documentTypeLabel("ct_scan", (k) => dict.ar[k])).toBe("أشعة مقطعية");
    expect(enumLabel("visit_type", "follow_up", "en")).toBe("follow_up");
    expect(visitTypeLabel("follow_up", (k) => dict.en[k])).not.toBe(enumLabel("visit_type", "follow_up", "en"));
  });

  it("falls back to the stored token, never to a blank, for a value outside the enum", () => {
    // Every screen reads these columns through an `any` row, and the fixtures
    // already use walk_in, which the enum does not contain.
    const t = (k: DictKey) => dict.en[k];
    expect(visitTypeLabel("walk_in", t)).toBe("walk_in");
    expect(visitTypeLabel(null, t)).toBe("—");
    expect(documentTypeLabel("", t)).toBe("—");
    expect(documentTypeLabel("unknown_type", t)).toBe("unknown_type");
  });

  it("routes visit_type and document_type through the dictionary on both desks", () => {
    // Batch 21's enumLabel() answers in Arabic and returns the stored token for
    // English, so a screen that labels these two domains with it shows `follow_up`
    // to the English desk while its neighbour — labelled from the dictionary,
    // which has had the English word for both domains all along — shows
    // "Follow-up". C19 was the same shape (two Arabic words for one value) and
    // batch 22 would have shipped a second one on the other desk. These two
    // domains are the only ones the dictionaries name in both languages, so they
    // are the only ones taken off enumLabel; the other 21 domains have English
    // nothing to say, and that stays a copy decision, not a route.
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      readFileSync(file, "utf8").split("\n").forEach((raw, i) => {
        const trimmed = raw.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        if (/\benumLabel\(\s*"(visit_type|document_type)"/.test(raw)) offenders.push(`${file}:${i + 1} ${trimmed.slice(0, 80)}`);
      });
    }
    expect(offenders, "a screen labels one of these two domains past the dictionary").toEqual([]);
    // The detector must be able to see the call it forbids.
    expect(/\benumLabel\(\s*"(visit_type|document_type)"/.test('const x = enumLabel("visit_type", r.visit_type, lang)')).toBe(true);
    expect(dict.en.visitFollowUp).toBe("Follow-up");
    expect(dict.ar.visitFollowUp).toBe("متابعة");
  });

  it("keeps the three Arabic-only keys the ones they were measured as", () => {
    const onlyAr = [...arKeys].filter((k) => !enKeys.has(k)).sort();
    expect(onlyAr).toEqual(AR_ONLY.map((e) => e.key).sort());
    for (const e of AR_ONLY) {
      const named = sourceFiles("src").filter((f) =>
        readFileSync(f, "utf8").split("\n").some((line) => {
          const trimmed = line.trim();
          return !trimmed.startsWith("//") && new RegExp(`\\bt\\(\\s*"${e.key}"`).test(line);
        })
      );
      expect(named, `${e.owner} no longer holds — ${e.key} is now a t() argument; add it to the English dictionary`).toEqual([]);
    }
  });

  it("requires a file that calls a dict-backed label helper to import it", () => {
    for (const file of sourceFiles("src")) {
      if (file === "src/lib/enumKeys.ts") continue; // the helpers are declared here
      const src = readFileSync(file, "utf8");
      if (!/\b(visitTypeLabel|documentTypeLabel|enumCopy)\(/.test(src)) continue;
      expect(src, `${file} calls a helper from lib/enumKeys without importing it`).toContain('from "@/lib/enumKeys"');
    }
  });

  it("keeps the search palette from printing a stored value as copy", () => {
    // C17 walks `.tsx` and looks at JSX, so a module that assembles a display
    // string is outside it — which is how four enum values survived the batch 21
    // sweep in the ⌘K result line. The rule is per line: a line that builds a
    // `sub:` out of a guarded column must route that column through a helper.
    const path = "src/lib/globalSearch.ts";
    const lines = readFileSync(path, "utf8").split("\n");
    const guarded = /\b(status|payment_method|visit_type|document_type|gender|transaction_type|reminder_channel|attendance)\b/;
    const displayLines = lines.filter((l) => /^\s*sub:/.test(l) && guarded.test(l));
    expect(displayLines.length, `${path}: the four guarded display lines were measured, found ${displayLines.length}`).toBe(4);
    expect(
      displayLines.filter((l) => !/enumLabel\(/.test(l)).map((l) => l.trim().slice(0, 90)),
      `${path}: a stored enum value is going into search-result copy unlabeled`
    ).toEqual([]);

    // Self-probe: the detector must still see the shape it was written for.
    const probe = '      sub: [a.procedure, a.status].filter(Boolean).join(" · "),';
    expect(/^\s*sub:/.test(probe) && guarded.test(probe) && !/enumLabel\(/.test(probe)).toBe(true);
  });

  it("links a search hit to the day the desk sees, not the UTC day", () => {
    // The palette renders the appointment time with toLocaleString (local) and
    // used to build its ?date= deep link from toISOString().slice(0,10) (UTC).
    // CalendarPage:391 parses that param as local midnight, so a 01:30 Cairo
    // appointment opened the calendar on the day before the appointment.
    const src = readFileSync("src/lib/globalSearch.ts", "utf8");
    expect(src).not.toMatch(/toISOString\(\)\.slice\(0, ?10\)/);
    expect(src).toContain("const dayKey = localDateOnly(d);");
  });
});

// ─── Batch 23 (C21): the cast is the bug, even when the word is right ─────────
//
// `t(p.payment_method as any)` showed the receptionist "نقدي" and the English
// desk "Cash" — and was still a defect. The key it asked for was a string the
// type system had been told to ignore, `t()` answers a miss with the miss, and
// the only thing between the two and a raw token on screen was that the
// dictionaries happen to key most enum values under the token Postgres stores.
// Twenty-nine calls in seventeen files stood on that coincidence: Payments,
// InvoiceDetail, PatientProfile, Expenses, FinancialReports, Treasury,
// ScheduledReminders, ScheduledReports, PatientOverviewSnapshot,
// MedicalRecordEditor, PatientWalletTab, PatientDental, PatientMedicalTab,
// Products, Schedules, StaffDetail, Templates.
//
// Batch 23 put each of them in a `Record<enum, DictKey>` (or, where the value
// space is a local `as const` list rather than a Postgres enum, in a structure
// whose literal types `t()` can check by itself). The tests below prove, in
// order: the cast cannot come back; every map covers the enum the generated
// client declares; every key resolves in both dictionaries; the word each desk
// reads did not move; and the Arabic words a value has more than one of are
// counted rather than assumed.

const IDENTITY_MAPS: Array<{ domain: string; map: Record<string, DictKey> }> = [
  { domain: "payment_method", map: PAYMENT_METHOD_KEY },
  // `expenses.payment_method` is its own enum (types.ts:10291), not
  // `payment_method` — three values, all spelled the same in the dictionary.
  { domain: "expense_method", map: EXPENSE_METHOD_KEY },
  { domain: "gender", map: GENDER_KEY },
  { domain: "appointment_status", map: APPOINTMENT_STATUS_KEY },
  { domain: "reminder_channel", map: REMINDER_CHANNEL_KEY },
  { domain: "reminder_status", map: REMINDER_STATUS_KEY },
  { domain: "report_frequency", map: REPORT_FREQUENCY_KEY },
  { domain: "treasury_tx_type", map: TREASURY_TX_TYPE_KEY },
];

// The two domains whose dictionary key is not the stored value. Written out as
// the words the screens read before this batch, so "identity" cannot quietly
// become the rule and retitle `topup` to its own token: these two maps are the
// translations, not a formality.
const RENAMED_MAPS: Array<{ domain: string; map: Record<string, DictKey>; words: Record<string, string> }> = [
  {
    domain: "wallet_tx_type",
    map: WALLET_TX_TYPE_KEY,
    words: {
      topup: "txTopup",
      spend: "txSpend",
      refund: "txRefund",
      referral_reward: "txReferralReward",
      adjustment_credit: "txAdjustmentCredit",
      adjustment_debit: "txAdjustmentDebit",
    },
  },
  {
    domain: "tooth_status",
    map: TOOTH_STATUS_KEY,
    words: {
      healthy: "chartLegendHealthy",
      caries: "chartLegendCaries",
      filled: "chartLegendFilled",
      crown: "chartLegendCrown",
      implant: "chartLegendImplant",
      root_canal: "chartLegendRootCanal",
      extracted: "chartLegendExtracted",
      bridge: "chartLegendBridge",
    },
  },
];

const enWords = dict.en as unknown as Record<string, string>;
const arWords = dict.ar as unknown as Record<string, string>;

// A `t(` call whose argument was cast past DictKey, found by matching the call's
// own parentheses instead of a fixed nesting depth. The first version of this
// sweep allowed one level of parens inside the argument and read the file a line
// at a time, which is how it reported zero while three sites were still cast:
// Dashboard's `` t(`status${(a.status?.charAt(0)…replace(/_(.)/g, (…, c) => …())}`
// as any) `` nests four levels deep and spans further than a regex can count. So
// the argument is now located by walking the text to the call's closing paren and
// everything at a depth below that is blanked out, which leaves only a cast on
// the key itself — the nested `as any` inside `PAYMENT_TYPE_KEYS[m.type as keyof
// …]` at PaymentMethods.tsx:102 is a cast on the *index*, so the lookup stays
// checked and the site stays legal. Comments are skipped, as they were before.
const CAST_ON_KEY = /\bas\s+(?:any|unknown|never|DictKey)\b/;
const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*)/;

function castArgumentsIn(src: string): Array<{ index: number; call: string }> {
  const hits: Array<{ index: number; call: string }> = [];
  for (const m of src.matchAll(/\bt\(/g)) {
    const start = (m.index ?? 0) + m[0].length;
    let i = start;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    const arg = src.slice(start, depth === 0 ? i - 1 : src.length);
    let masked = "";
    let d = 0;
    for (const c of arg) {
      if (c === "(" || c === "[" || c === "{") { d++; masked += " "; }
      else if (c === ")" || c === "]" || c === "}") { d--; masked += " "; }
      else masked += d > 0 ? " " : c;
    }
    if (CAST_ON_KEY.test(masked)) hits.push({ index: m.index ?? 0, call: src.slice(m.index ?? 0, i) });
  }
  return hits;
}

const findCastArguments = () => {
  const sites: Array<{ file: string; line: number; text: string }> = [];
  for (const file of sourceFiles("src")) {
    const src = readFileSync(file, "utf8");
    for (const hit of castArgumentsIn(src)) {
      const line = src.slice(0, hit.index).split("\n");
      if (COMMENT_LINE.test(line[line.length - 1])) continue;
      sites.push({ file, line: line.length, text: line[line.length - 1].trim().slice(0, 90) });
    }
  }
  return sites;
};

describe("no screen hands t() a key it had to cast (C21)", () => {
  it("keeps the cast census at zero and the detector able to see one", () => {
    expect(
      findCastArguments().map((s) => `${s.file}:${s.line} ${s.text}`),
      "a t() call is asking for a translation the compiler could not check — route it through a Record<domain, DictKey> map"
    ).toEqual([]);
    // The detector must still see every shape that survived the sweep, or zero
    // means the rule was relaxed rather than the code fixed.
    for (const probe of [
      "{t(p.payment_method as any)}",
      "{t(r.reminder_type as any)}",
      'const m = (t(x.m as any) ?? x.m)',
      't(("visit_" + r.visit_type) as any)',
      "t(`status${x}` as any)",
      "t(typeKey[tx.tx_type] as any)",
      "t(maybeKey as DictKey)",
      // The shape the one-level regex was blind to, verbatim from Dashboard.tsx
      // before batch 23 rewrote it: a template literal whose interpolation
      // nests a replace() whose callback nests a call.
      't(`status${a.status?.charAt(0).toUpperCase() + a.status?.slice(1).replace(/_(.)/g, (_: any, c: string) => c.toUpperCase())}` as any) ?? a.status',
      't(("reason" + adj.reason.charAt(0).toUpperCase() + adj.reason.slice(1)) as any)',
    ]) {
      expect(castArgumentsIn(probe).length, `the C21 detector no longer matches ${probe}`).toBe(1);
    }
    // …and must not fire on the shapes that are already safe: a checked
    // literal, a map lookup whose values are DictKeys, and a cast on the
    // *index* used to pick the key rather than on the key handed to t()
    // (PaymentMethods.tsx:102 — still type-checked there).
    for (const probe of [
      '{t("wallet")}',
      "t(UNIT_KEY[u])",
      't(PAYMENT_TYPE_KEYS[m.type as keyof typeof PAYMENT_TYPE_KEYS] ?? "paymentTypeOther")',
      "enumCopy(PAYMENT_METHOD_KEY, p.payment_method, t)",
      "t(STATUS_KEY_BY_PAYROLL_STATUS[p.status])",
    ]) {
      expect(castArgumentsIn(probe).length, `the C21 detector fires on a checked call: ${probe}`).toBe(0);
    }
    expect(sourceFiles("src").length, "the C21 sweep read no source files").toBeGreaterThan(150);
  });

  it("keeps no stored column going straight into t(), cast or no cast", () => {
    // A cast at least marked the spot. `t(row.status)` on an `any` row is the
    // same defect unmarked: it compiles, and reads a word only for as long as the
    // dictionary happens to key that value under its stored name. Every bare
    // argument in the tree today is a lookup in a typed map, where the value is
    // `DictKey` before t() ever sees it — so the rule is a whole-property
    // argument, and map lookups stay legal.
    const BARE_COLUMN = /\bt\(\s*[A-Za-z_$][\w$]*\.[\w$?]+\s*\)/;
    const hits: string[] = [];
    for (const file of sourceFiles("src")) {
      readFileSync(file, "utf8").split("\n").forEach((raw, i) => {
        const trimmed = raw.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        if (BARE_COLUMN.test(raw)) hits.push(`${file}:${i + 1} ${trimmed.slice(0, 80)}`);
      });
    }
    expect(hits, "a screen hands t() a column it never checked against the dictionary").toEqual([]);
    expect(BARE_COLUMN.test("{t(p.payment_method)}")).toBe(true);
    expect(BARE_COLUMN.test("{t(a.status)}")).toBe(true);
    expect(BARE_COLUMN.test("t(STATUS_KEY_BY_PAYROLL_STATUS[p.status])")).toBe(false);
    expect(BARE_COLUMN.test("t(DAYS[i])")).toBe(false);
    expect(BARE_COLUMN.test("t(profName(l.staff_id))")).toBe(false);
  });

  it("covers the whole enum each batch-23 column is typed with", () => {
    for (const { domain, map } of [...IDENTITY_MAPS, ...RENAMED_MAPS]) {
      expect(
        Object.keys(map).sort(),
        `${domain}: the map and the enum in types.ts no longer hold the same values`
      ).toEqual(enumValues(domain).sort());
    }
  });

  it("resolves every mapped value in both dictionaries", () => {
    for (const { domain, map } of [...IDENTITY_MAPS, ...RENAMED_MAPS]) {
      for (const [value, key] of Object.entries(map)) {
        expect(enKeys.has(key), `${domain}.${value} -> "${key}" is not an English key`).toBe(true);
        expect(arKeys.has(key), `${domain}.${value} -> "${key}" has no Arabic entry`).toBe(true);
      }
    }
  });

  it("keeps an identity domain's key equal to the value Postgres stores", () => {
    // This is the coincidence batch 23 wrote down: the reason the cast rendered
    // a word was that the dictionary keys these values under their stored names.
    // If a migration renames a value, the identity breaks, the map has to be
    // renamed with it, and the desk keeps reading a word either way.
    for (const { domain, map } of IDENTITY_MAPS) {
      for (const [value, key] of Object.entries(map)) {
        expect(key, `${domain}: "${value}" is no longer keyed under its own name`).toBe(value);
      }
    }
  });

  it("gives the desk the word the cast gave it, for every stored value", () => {
    // The copy-neutrality proof, asserted rather than argued: `t(value as any)`
    // answered `dict[lang][value]`, so an identity map routed through enumCopy()
    // must answer the same string for every value the column can hold.
    for (const { domain, map } of IDENTITY_MAPS) {
      for (const value of enumValues(domain)) {
        expect(enumCopy(map, value, (k) => dict.en[k]), `${domain}.${value} on the English desk`).toBe(enWords[value]);
        expect(enumCopy(map, value, (k) => dict.ar[k]), `${domain}.${value} on the Arabic desk`).toBe(arWords[value]);
      }
    }
  });

  it("keeps the two renamed domains on the words their screens used", () => {
    for (const { domain, map, words } of RENAMED_MAPS) {
      expect(Object.keys(words).sort(), `${domain}: the frozen word list and the map disagree on values`).toEqual(
        Object.keys(map).sort()
      );
      for (const [value, key] of Object.entries(words)) {
        expect(map[value], `${domain}.${value}: the badge changed word`).toBe(key);
      }
    }
    // …and the fallbacks that replace a missing word behave: blank is an em
    // dash, a value outside the enum is the token it stored, never a key.
    const t = (k: DictKey) => dict.en[k];
    expect(enumCopy(PAYMENT_METHOD_KEY, null, t)).toBe("—");
    expect(enumCopy(PAYMENT_METHOD_KEY, "", t)).toBe("—");
    expect(enumCopy(WALLET_TX_TYPE_KEY, "walk_in", t)).toBe("walk_in");
    // A number in a string column is outside the domain too. `t(undefined)`
    // would render nothing, so the helper hands back what it was given — a cell
    // reading `0` is wrong but visible, an empty cell reads as "no status".
    expect(String(enumCopy(TOOTH_STATUS_KEY, 0 as unknown as string, t))).toBe("0");
  });

  it("counts the stored values that have more than one Arabic word (C19 recount)", () => {
    // Batch 22 froze visit_type/document_type/payment_method to one Arabic word
    // apiece. The same check on the domains batch 23 routed found six values with
    // two or three words live on different screens — an existing copy problem,
    // deliberately not changed by a batch whose promise is that no desk sees a
    // different word. The list is a ratchet: a seventh value fails here, and so
    // does silently unifying one of these without updating the register.
    //
    // A domain is counted where two *live* routes meet: the dictionary route this
    // batch wrote down, `enumLabel()`'s Arabic-only maps (enumLabels.ts), and
    // Dashboard's `status…` route. Six of the ten batch-23 domains have no
    // dictionary word beside the one map, so there is nothing to compare there.
    const enumLabelOwns = [
      "appointment_status",
      "gender",
      "payment_method",
      "reminder_channel",
      "leave_request_status",
      "payroll_status",
    ];
    const diverging = new Set<string>();
    const consider = (domain: string, value: string, words: Array<string | undefined>) => {
      if (new Set(words.filter((w): w is string => typeof w === "string" && w !== "")).size > 1) {
        diverging.add(`${domain}.${value}`);
      }
    };
    for (const { domain, map } of IDENTITY_MAPS) {
      for (const value of Object.keys(map)) {
        const routes: Array<string | undefined> = [arWords[value]];
        if (enumLabelOwns.includes(domain)) routes.push(enumLabel(domain as never, value, "ar"));
        if (domain === "appointment_status") routes.push(arWords["status" + TRANSFORMS.upperFirstCamel(value)]);
        consider(domain, value, routes);
      }
    }
    // The three rewritten derivations that share a column with a StaffDetail
    // badge: Leaves labels a request `statusPending` (قيد الانتظار) while
    // StaffDetail labels the same row through enumLabel() (قيد المراجعة), and
    // Payroll's statusPaid is مدفوعة against StaffDetail's مدفوع.
    for (const p of PREFIXED) {
      if (!p.domain || !enumLabelOwns.includes(p.domain)) continue;
      for (const value of enumValues(p.domain)) {
        const routes = [arWords[p.prefix + TRANSFORMS[p.transform](value)], enumLabel(p.domain as never, value, "ar")];
        if (p.domain === "appointment_status") routes.push(arWords[value]);
        consider(p.domain, value, routes);
      }
    }
    expect([...diverging].sort()).toEqual([
      "appointment_status.departed", // غادر (badge, palette) vs مغادرة (Dashboard)
      "appointment_status.in_progress", // قيد التنفيذ / جارٍ / قيد المعالجة
      "leave_request_status.pending", // قيد الانتظار (Leaves) vs قيد المراجعة (StaffDetail)
      "payroll_status.paid", // مدفوعة (Payroll) vs مدفوع (StaffDetail)
      "reminder_channel.email", // البريد الإلكتروني (badges) vs بريد إلكتروني (channel picker)
      "reminder_channel.push", // إشعار vs إشعار التطبيق
    ]);
  });

  it("keeps the local value lists on the domains and words they were measured with", () => {
    // Three screens hold their own closed list instead of a Postgres enum, so no
    // map can prove them — the file itself is the contract and is read here.
    const days = (file: string) => constStringArray(file, "DAYS");
    expect(days("src/pages/hr/Schedules.tsx"), "Schedules' working-week grid changed").toEqual(
      days("src/pages/hr/StaffDetail.tsx")
    );
    for (const d of days("src/pages/hr/Schedules.tsx")) {
      expect(enKeys.has(d), `${d} is not an English key — t(d) no longer compiles`).toBe(true);
      expect(arKeys.has(d)).toBe(true);
    }
    // The tooth chart lists the enum's eight values itself; if Postgres gains a
    // ninth, the map follows (the test above) and this fails until the chart
    // shows it, so the legend cannot silently drop a status.
    expect(
      [...constStringArray("src/pages/patients/PatientDental.tsx", "STATUS")].sort(),
      "PatientDental's tooth list and the tooth_status enum disagree"
    ).toEqual(enumValues("tooth_status").sort());
    // `piece` is the one unit the dictionary does not key under its value — the
    // reason the Products dropdown needed a ternary instead of `t(u)`.
    expect(enKeys.has("piece")).toBe(false);
    expect(enKeys.has("pieces")).toBe(true);
    const units = constStringArray("src/pages/inventory/Products.tsx", "UNITS");
    expect(units).toContain("piece");
    expect(
      readFileSync("src/pages/inventory/Products.tsx", "utf8"),
      "Products' UNIT_KEY no longer maps piece to the dictionary's word for it"
    ).toMatch(/piece:\s*"pieces"/);
    for (const u of units) {
      if (u === "piece") continue;
      expect(enKeys.has(u), `${u} is not an English key — t(UNIT_KEY[u]) no longer compiles`).toBe(true);
    }
  });
});
