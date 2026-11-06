#!/usr/bin/env node
// Design lint — the machine half of the ZMedico craft standard.
//
// Ratchet, not threshold: every finding is keyed by (file, rule) and compared against
// scripts/design-lint-baseline.json. A new (file, rule) pair or a count that rises fails
// the run; a count that falls must be retired from the baseline with `--write`, so the
// debt ledger only ever shrinks. `.qoder/skills/zmedico-craft-ui/SKILL.md` states the rule;
// this file only proves it.
//
//   node scripts/design-lint.mjs            # exit 1 on new violations
//   node scripts/design-lint.mjs --json     # machine-readable report
//   node scripts/design-lint.mjs --write    # re-pin the baseline (shrinking only)
//   node scripts/design-lint.mjs --verbose  # list every finding, not just the new ones

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const BASELINE_PATH = join(ROOT, "scripts/design-lint-baseline.json");
const SCAN_ROOTS = ["src"];
const TEST_FILE = /\.test\.(ts|tsx)$/;

/**
 * Surfaces that already met the standard, or are being rebuilt to meet it: zero tolerance,
 * every rule. The baseline cannot pin a finding inside this scope, so debt from the legacy
 * app can never be borrowed by new platform work.
 */
export const STRICT_SCOPES = ["src/components/platform/"];
const isStrict = (file) => STRICT_SCOPES.some((s) => file === s || file.startsWith(s));

/** Rules whose presence anywhere is a defect, listed separately so the report can rank them. */
export const ABSOLUTE = new Set(["purple-gradient", "transition-all", "animate-layout", "emoji-icon"]);

const CLASS_RULES = [
  {
    id: "literal-color",
    where: "class",
    re: /(?<![\w-])(?:bg|text|border|from|to|via|ring|fill|stroke|shadow|decoration|outline|accent|caret|divide)-\s*\(?\s*(?:#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/g,
    hint: "Take the colour from a --z-* token instead of writing it into the class list.",
  },
  {
    id: "tailwind-palette",
    where: "class",
    re: /(?<![\w-])(?:bg|text|border|ring|from|to|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\/\d+)?(?![\w-])/g,
    hint: "Raw Tailwind palette is a literal. Map it once in the token block, then use the token.",
  },
  {
    id: "purple-gradient",
    where: "class",
    re: /(?<![\w-])(?:gradient-primary|gradient-card)(?![\w-])/g,
    hint: "The purple wash is the template tell this standard exists to remove.",
  },
  {
    id: "transition-all",
    where: "class",
    re: /(?<![\w-])transition-all(?![\w-])/g,
    hint: "Name the properties you mean: transition-[color,box-shadow], or transition-transform.",
  },
  {
    id: "animate-layout",
    where: "class",
    re: /(?<![\w-])transition[^"'`\s]*(?:height|width|top|left|right|bottom|margin|padding)|(?<![\w-])animate-\[(?:expand|collapse|grow|shrink)/g,
    hint: "Animating box properties reflows on every frame. Transform and opacity only.",
  },
  {
    id: "physical-inset",
    where: "class",
    re: /(?<![\w])(?:-?(?:pl|pr|ml|mr)-(?:auto|\d+(?:\.\d+)?|\[[^\]]+\])|space-x-(?:reverse|\d+(?:\.\d+)?|\[[^\]]+\])|(?:left|right)-(?:auto|\d+(?:\.\d+)?|\[[^\]]+\]|full|screen)|border-[lr]-(?:\d|input|solid))/g,
    hint: "Logical utilities mirror in RTL for free: ps-/pe-, ms-/me-, start-/end-, border-s-/e-.",
  },
  {
    id: "physical-text-align",
    where: "class",
    re: /(?<![\w-])text-(?:left|right)(?![\w-])/g,
    hint: "text-start / text-end. text-left is a defect in Arabic at any viewport.",
  },
  {
    id: "tracked-caps",
    where: "class",
    re: /(?<![\w-])(?:tracking-(?:wide|wider|widest))(?![\w-])|(?<![\w-])uppercase(?![\w-])/g,
    hint: "Eyebrow labels and ALL-CAPS are the strongest generated-template tell; Arabic loses its letter joins under tracking.",
  },
  {
    id: "kit-radius-uniform",
    where: "class",
    re: /(?<![\w-])rounded-(?:xl|2xl|3xl)(?![\w-])|(?<![\w-])rounded-(?![\w-]|none|full)/g,
    hint: "Radius is by nesting depth: z-r1 inline, z-r2 control, z-r3 panel.",
  },
  {
    id: "bare-outline-none",
    where: "class",
    re: /(?<![\w-])outline-none(?![\w-])(?![^"'`]*focus-visible:(?:ring|outline))/g,
    hint: "Killing the outline needs a visible :focus-visible replacement in the same class list.",
  },
];

const TEXT_RULES = [
  {
    id: "arrow-in-label",
    re: /[→←⟶⟵]/g,
    hint: "An arrow glued to link text is decoration. The affordance is the link itself.",
  },
  {
    id: "middle-dot-meta",
    re: /(?:^|\s)·(?:\s|$)/g,
    hint: "Meta strings belong in their own elements with real spacing, not a middle-dot join.",
  },
  {
    id: "emoji-icon",
    re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu,
    hint: "Use a lucide glyph. Emoji renders differently on every platform and cannot be coloured.",
  },
];

const CODE_RULES = [
  {
    id: "literal-color-code",
    re: /(?<![\w.#])(?:#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|#[0-9a-fA-F]{3})\b/g,
    hint: "Colours live in the token block in src/index.css. Components reference tokens.",
    allowInComment: false,
  },
  {
    id: "raw-hsl-code",
    re: /hsla?\(\s*-?\d+(?:\.\d+)?/g,
    hint: "Same. Declare the value once as a --z-* custom property.",
  },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry) && !TEST_FILE.test(entry)) out.push(full);
  }
  return out;
}

/** Strip line and block comments so commented-out code and prose do not raise findings. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => `${p1}${" ".repeat(m.length - p1.length)}`);
}

function classStrings(body) {
  const hits = [];
  // className="…" / class="…" and every string or template chunk passed to cn()/cva().
  const classAttr = /(?:className|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([\s\S]*?)`\}|\{"([^"]*)"\})/g;
  for (const m of body.matchAll(classAttr)) hits.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? "");
  const helper = /\b(?:cn|cva)\s*\(([\s\S]{0,4000}?)\)(?:\s*[;,)\n])/g;
  for (const m of body.matchAll(helper)) {
    for (const s of m[1].matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) hits.push(s[1] ?? s[2] ?? s[3] ?? "");
  }
  return hits;
}

function jsxText(body) {
  const out = [];
  for (const m of body.matchAll(/>([^<>{}]+)</g)) if (m[1].trim()) out.push(m[1]);
  for (const m of body.matchAll(/"[^"]*"\s*\n?\s*>\s*([^<>{}\n]{2,})\s*</g)) out.push(m[1]);
  return out;
}

function lineOf(body, index) {
  let line = 1;
  for (let i = 0; i < index && i < body.length; i += 1) if (body[i] === "\n") line += 1;
  return line;
}

export function analyze() {
  const findings = [];
  const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r))).sort();

  for (const abs of files) {
    const rel = posix.join(...relative(ROOT, abs).split(/[\\/]+/));
    const raw = readFileSync(abs, "utf8");
    const body = stripComments(raw);
    const isCss = rel.endsWith(".css");

    // The token block is the one place a literal colour is correct.
    const tokenBlock = rel === "src/index.css";
    const inTokenBlock = (index) => {
      if (!tokenBlock) return false;
      const upto = body.slice(0, index);
      return upto.lastIndexOf(":root") > upto.lastIndexOf("}");
    };

    const classHits = isCss ? [] : classStrings(body);
    const textHits = isCss ? [] : jsxText(body);

    for (const rule of CLASS_RULES) {
      for (const chunk of classHits) {
        const offset = body.indexOf(chunk);
        for (const m of chunk.matchAll(rule.re)) {
          findings.push({ file: rel, rule: rule.id, line: lineOf(body, Math.max(offset, 0) + m.index), detail: m[0], hint: rule.hint });
        }
      }
    }
    for (const rule of TEXT_RULES) {
      for (const chunk of textHits) {
        const offset = body.indexOf(chunk);
        for (const m of chunk.matchAll(rule.re)) {
          findings.push({ file: rel, rule: rule.id, line: lineOf(body, Math.max(offset, 0) + m.index), detail: JSON.stringify(m[0]), hint: rule.hint });
        }
      }
    }
    if (!isCss) {
      for (const rule of [...CODE_RULES]) {
        for (const m of body.matchAll(rule.re)) {
          if (inTokenBlock(m.index)) continue;
          findings.push({ file: rel, rule: rule.id, line: lineOf(body, m.index), detail: m[0], hint: rule.hint });
        }
      }
    }
  }
  return findings;
}

export function tally(findings) {
  const counts = new Map();
  for (const f of findings) {
    const key = `${f.file}::${f.rule}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const report = run(args);

  if (report.json) {
    process.stdout.write(`${report.json}\n`);
  } else {
    for (const line of report.stdout) process.stdout.write(`${line}\n`);
    for (const line of report.stderr) process.stderr.write(`${line}\n`);
  }
  // exitCode, not exit(): process.exit truncates a large pending stdout write to a pipe.
  process.exitCode = report.fail ? 1 : 0;
}

export function run(args) {
  const findings = analyze();
  const legacy = findings.filter((f) => !isStrict(f.file));
  const hardZero = findings.filter((f) => isStrict(f.file));
  const now = tally(legacy);
  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")).allowance ?? {} : {};

  const regressions = [];
  const improvements = [];
  for (const [key, count] of now) {
    const allowed = baseline[key] ?? 0;
    if (count > allowed) regressions.push({ key, count, allowed, added: count - allowed });
  }
  for (const [key, allowed] of Object.entries(baseline)) {
    const count = now.get(key) ?? 0;
    if (count < allowed) improvements.push({ key, count, allowed });
  }
  const absoluteLegacy = legacy.filter((f) => ABSOLUTE.has(f.rule));
  let repinned = null;

  if (args.has("--write")) {
    if (hardZero.length) {
      console.error(
        `design-lint: refusing to pin ${hardZero.length} finding(s) inside the zero-tolerance scope (${STRICT_SCOPES.join(", ")}). Fix them instead.`,
      );
      return { fail: true, stdout: [], stderr: [] };
    }
    const sorted = Object.fromEntries([...now.entries()].sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(
        {
          $comment:
            "Debt ledger for scripts/design-lint.mjs. Shrink it, never grow it: a new file::rule key or a raised count fails the run. Files inside STRICT_SCOPES are never listed here — they must be clean. Re-pin with `node scripts/design-lint.mjs --write` only after removing violations.",
          generatedAt: new Date().toISOString().slice(0, 10),
          strictScopes: STRICT_SCOPES,
          nonWaivableRules: [...ABSOLUTE],
          nonWaivableLegacyCount: absoluteLegacy.length,
          allowance: sorted,
        },
        null,
        2,
      )}\n`,
    );
    // The ledger was just rewritten to match reality: this run neither regressed nor improved.
    repinned = { keys: Object.keys(sorted).length, findings: legacy.length };
    regressions.length = 0;
    improvements.length = 0;
  }

  const stdout = [];
  const stderr = [];
  if (args.has("--verbose")) {
    for (const f of findings) stdout.push(`${f.file}:${f.line}  [${f.rule}]  ${f.detail}${isStrict(f.file) ? "  (zero-tolerance scope)" : ""}`);
  }
  if (hardZero.length) {
    stderr.push(``, `design-lint: ${hardZero.length} finding(s) in the zero-tolerance scope:`);
    for (const f of hardZero.slice(0, 25)) stderr.push(`  ${f.file}:${f.line}  [${f.rule}]  ${f.detail} — ${f.hint}`);
    if (hardZero.length > 25) stderr.push(`  … and ${hardZero.length - 25} more`);
  }
  if (regressions.length) {
    stderr.push(``, `design-lint: ${regressions.length} regressed key(s) against scripts/design-lint-baseline.json:`);
    for (const r of regressions) {
      stderr.push(`  ${r.key}  ${r.allowed} → ${r.count} (+${r.added})`);
      const first = legacy.find((f) => `${f.file}::${f.rule}` === r.key);
      if (first) stderr.push(`      ↳ ${first.hint}`);
    }
    stderr.push(``, `Fix the new usage. A pre-existing finding is debt, not permission.`);
  }
  if (repinned) stdout.push(`design-lint: baseline re-pinned at ${repinned.keys} keys / ${repinned.findings} legacy findings.`);
  if (!regressions.length && !hardZero.length && !args.has("--json") && !args.has("--write")) {
    stdout.push(
      improvements.length
        ? `design-lint: clean, and ${improvements.length} key(s) now sit below their allowance — run \`node scripts/design-lint.mjs --write\` to retire the debt.`
        : `design-lint: clean — ${legacy.length} baselined legacy finding(s), zero in the strict scope, no new ones.`,
    );
  }

  return {
    fail: hardZero.length > 0 || regressions.length > 0,
    stdout,
    stderr,
    json: args.has("--json") ? JSON.stringify({ findings, hardZero, regressions, improvements, absoluteLegacy }, null, 2) : null,
  };
}


// Direct invocation only: importing this module for the vitest contract must not run the gate.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
