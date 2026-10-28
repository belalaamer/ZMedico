import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enumLabel } from "@/lib/enumLabels";
import { DOCUMENT_TYPE_KEY, VISIT_TYPE_KEY, documentTypeLabel, visitTypeLabel } from "@/lib/enumKeys";
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
// are registered rather than rewritten. Registered sites are still worth
// freezing: their value space is read from the same places the app reads it —
// the generated enum unions and the local literal array — so the test proves the
// derivation lands on a real key for every value it can be handed, and fails the
// day a value is added that it does not.
//
// Sites are keyed by file and prefix, never by line number.

const enKeys = new Set(Object.keys(dict.en));
const arKeys = new Set(Object.keys(dict.ar));

type Transform = "upperFirst" | "upperFirstCamel";

const TRANSFORMS: Record<Transform, (v: string) => string> = {
  upperFirst: (v) => v.charAt(0).toUpperCase() + v.slice(1),
  // Dashboard's own chain: raise the first letter, then each letter after an
  // underscore, so `in_progress` derives statusInProgress, not statusIn_progress.
  upperFirstCamel: (v) =>
    v.charAt(0).toUpperCase() + v.slice(1).replace(/_(.)/g, (_, c: string) => c.toUpperCase()),
};

/** A derived site the sweep measured, the shape it derives, and every value it
 *  can be handed. `values()` is read from disk, not restated from memory. */
type Derived = {
  file: string;
  prefix: string;
  sites: number;
  shape: "concat" | "template";
  transform: Transform;
  values: () => string[];
  names: string;
};

const DERIVED: Derived[] = [
  {
    file: "src/pages/inventory/StockOverview.tsx",
    prefix: "reason",
    sites: 2,
    shape: "concat",
    transform: "upperFirst",
    values: () => constStringArray("src/pages/inventory/StockOverview.tsx", "REASONS"),
    names: "the REASONS array the adjustment dialog is built from",
  },
  {
    file: "src/pages/hr/Leaves.tsx",
    prefix: "status",
    sites: 1,
    shape: "template",
    transform: "upperFirst",
    values: () => enumValues("leave_request_status"),
    names: "the leave_request_status enum",
  },
  {
    file: "src/pages/hr/Payroll.tsx",
    prefix: "status",
    sites: 1,
    shape: "template",
    transform: "upperFirst",
    values: () => enumValues("payroll_status"),
    names: "the payroll_status enum",
  },
  {
    file: "src/pages/dashboard/Dashboard.tsx",
    prefix: "status",
    sites: 1,
    shape: "template",
    transform: "upperFirstCamel",
    values: () => enumValues("appointment_status"),
    names: "the appointment_status enum",
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

  it("keeps every derived site on the file, prefix and count it was reviewed with", () => {
    const known = new Set(DERIVED.map((d) => `${d.file} ${d.prefix}`));
    expect(
      sites.filter((s) => !known.has(`${s.file} ${s.prefix}`)).map((s) => `${s.file}:${s.line} derives its key from "${s.prefix}"`),
      "a new t() call builds its key from a string — name it in a typed map instead",
    ).toEqual([]);
    for (const d of DERIVED) {
      const found = sites.filter((s) => s.file === d.file && s.prefix === d.prefix);
      expect(found.length, `${d.file}: ${found.length} derived t("${d.prefix}…") sites, not ${d.sites}`).toBe(d.sites);
      expect(found.every((s) => s.shape === d.shape), `${d.file}: the derivation changed shape`).toBe(true);
    }
  });

  it("proves every registered derivation lands on a real key, for every value", () => {
    for (const d of DERIVED) {
      const values = d.values();
      expect(values.length, `${d.file}: ${d.names} came back empty`).toBeGreaterThan(0);
      for (const v of values) {
        const key = d.prefix + TRANSFORMS[d.transform](v);
        expect(enKeys.has(key), `${d.file}: ${d.names} can hold "${v}", which derives "${key}" — not in the English dictionary`).toBe(true);
        expect(arKeys.has(key), `${d.file}: "${key}" has no Arabic entry`).toBe(true);
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
      if (!/\b(visitTypeLabel|documentTypeLabel)\(/.test(src)) continue;
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
