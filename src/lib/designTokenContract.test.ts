import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The craft standard has two enforcement tiers and this file is the inner one.
// `scripts/design-lint.mjs` is the authoritative scanner (14 rules, whole-repo ratchet
// against scripts/design-lint-baseline.json) and runs as its own CI step. This test is the
// unit-tier copy: it cannot import the .mjs scanner — tsconfig.app has no allowJs, so a
// .mjs import would break the type gate — so it re-checks the handful of tells that hurt
// most, and only inside the zero-tolerance scope. Result: a component added under
// src/components/platform/ that carries a purple gradient or `transition-all` fails
// `npm run test`, which CI already runs, even if someone drops the lint step from the
// workflow. The wider repo stays baselined, not policed.
//
// Second job: the debt ledger is a contract. If the baseline regrows, or a strict-scope
// file sneaks into it, the ratchet has been disarmed and this fails.

const STRICT_SCOPES = [
  "src/components/platform/",
  "src/components/zds/",
  "src/pages/appointments/",
  "src/pages/calendar/",
  "src/pages/checkin/",
  "src/pages/queue/",
];

const ZERO_TOLERANCE = [
  { id: "purple-gradient", re: /(?<![\w-])(?:gradient-primary|gradient-card)(?![\w-])/g },
  { id: "transition-all", re: /(?<![\w-])transition-all(?![\w-])/g },
  { id: "animate-layout", re: /transition[^"'`\s]*(?:height|width|top|left|right|bottom|margin|padding)/g },
  { id: "tailwind-palette", re: /(?<![\w-])(?:bg|text|border|ring|from|to|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g },
  { id: "literal-color-class", re: /(?:bg|text|border)-\(\s*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/g },
  { id: "tracked-caps", re: /(?<![\w-])tracking-widest(?![\w-])/g },
  { id: "physical-text-align", re: /(?<![\w-])text-(?:left|right)(?![\w-])/g },
];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Same strip the scanner uses: commented-out code is not a violation. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => `${p1}${" ".repeat(m.length - p1.length)}`);
}

function classStrings(body: string): string[] {
  const hits: string[] = [];
  const attr = /(?:className|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([\s\S]*?)`\}|\{"([^"]*)"\})/g;
  for (const m of body.matchAll(attr)) hits.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? "");
  const helper = /\b(?:cn|cva)\s*\(([\s\S]{0,4000}?)\)(?:\s*[;,)\n])/g;
  for (const m of body.matchAll(helper)) {
    for (const s of m[1].matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) hits.push(s[1] ?? s[2] ?? s[3] ?? "");
  }
  return hits;
}

const baseline = JSON.parse(readFileSync("scripts/design-lint-baseline.json", "utf8")) as {
  strictScopes?: string[];
  nonWaivableRules?: string[];
  allowance?: Record<string, number>;
};

describe("design token contract", () => {
  it("keeps the debt ledger parseable and non-empty", () => {
    expect(baseline.allowance).toBeTypeOf("object");
    expect(Object.keys(baseline.allowance ?? {}).length).toBeGreaterThan(0);
  });

  it("totals 1024 baselined findings or fewer, so the ratchet cannot silently regrow", () => {
    const total = Object.values(baseline.allowance ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(1024);
  });

  it("declares the zero-tolerance scope it enforces", () => {
    expect(baseline.strictScopes).toEqual(STRICT_SCOPES);
    expect(baseline.nonWaivableRules).toEqual(
      expect.arrayContaining(["purple-gradient", "transition-all", "animate-layout", "emoji-icon"]),
    );
  });

  it("never pins a finding inside the zero-tolerance scope", () => {
    const pinned = Object.keys(baseline.allowance ?? {}).filter((key) =>
      STRICT_SCOPES.some((scope) => key.startsWith(`${scope}::`) || key.startsWith(scope)),
    );
    expect(pinned).toEqual([]);
  });

  it("requires the scanner to still name every scope this test polices", () => {
    const scanner = readFileSync("scripts/design-lint.mjs", "utf8");
    for (const scope of STRICT_SCOPES) expect(scanner).toContain(`"${scope}"`);
    expect(scanner).toContain("design-lint-baseline.json");
  });
});

describe("platform craft zero tolerance", () => {
  const files = STRICT_SCOPES.flatMap(sourceFiles);

  it("has platform components to police", () => {
    // Fails when src/components/platform/ is emptied out from under the standard, which
    // would silently disable this whole tier. Move the scope, do not delete the check.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} carries none of the named template tells`, () => {
      const body = stripComments(readFileSync(file, "utf8"));
      const classes = classStrings(body);
      for (const rule of ZERO_TOLERANCE) {
        const offenders = classes.filter((chunk) => {
          rule.re.lastIndex = 0;
          return rule.re.test(chunk);
        });
        expect(
          offenders,
          `${file}: [${rule.id}] ${offenders.join(" | ").slice(0, 200)} — see .qoder/skills/zmedico-design-tokens/SKILL.md`,
        ).toEqual([]);
      }
    });
  }
});
