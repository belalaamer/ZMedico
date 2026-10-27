import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// C14 freeze: every browser-authored delete must ask before it destroys a row.
//
// A `.delete()` site is legal only when it falls into one of these buckets:
//   SAVE      the handler deletes and then re-inserts/upserts the same table, so
//             the delete is a save-path rewrite and a dialog would be noise,
//   NATIVE    the handler still uses a native confirm() guard,
//   DIALOG    every place the handler is fired sits inside an <AlertDialogAction>,
//   WAIVED    listed in WAIVERS below, keyed by file + handler name.
// Anything else — including a site whose handler or table cannot be resolved —
// fails. Line numbers are deliberately never asserted: they move on every merge.

type Bucket = "SAVE" | "NATIVE" | "DIALOG" | "WAIVED" | "NONE";

type Site = {
  file: string;
  line: number;
  table: string;
  handler: string;
  bucket: Bucket;
  detail: string;
};

type Waiver = { file: string; handler: string; reason: string; premise?: RegExp };

const WAIVERS: Waiver[] = [
  {
    file: "src/pages/queue/QueueAudit.tsx",
    handler: "deletePreset",
    reason:
      "audit_export_presets rows are the user's own saved filter view: recreating one costs a filter change and an asterisk click, and no clinical, financial or identity data is lost.",
  },
  {
    file: "src/components/ConsumablesEditor.tsx",
    handler: "removeRow",
    reason:
      "The trash button calls removeRow directly only for a row that was never persisted; the delete statement itself sits behind `if (row.id)`, so a row that exists in the database is reachable only through the dialog.",
    // The window covers batch 16's two-line note about sc_admin_delete, which now
    // sits between the guard and the call.
    premise: /if\s*\(row\.id\)\s*\{[\s\S]{0,240}from\("service_consumables"\)\.delete\(\)/,
  },
];

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out.sort();
};

type Span = { name: string; indent: number; start: number; end: number };

// Function-valued declarations found by brace-matching from the declaration line.
// The body has to open on that line and the line has to look like a function,
// otherwise a brace-less `const x = rows.filter(...)` swallows the braces that
// follow and outranks the real handler.
const handlerSpans = (lines: string[]): Span[] => {
  const spans: Span[] = [];
  lines.forEach((line, i) => {
    const m = /^( {0,6})(?:export default |export |async )?(?:function |const )([A-Za-z_]\w*)/.exec(line);
    if (!m || !line.includes("{") || !/(=>|function|async )/.test(line)) return;
    let depth = 0;
    let seen = false;
    let end = lines.length;
    for (let k = i; k < lines.length; k++) {
      for (const ch of lines[k]) {
        if (ch === "{") { depth++; seen = true; } else if (ch === "}") depth--;
      }
      if (seen && depth <= 0) { end = k; break; }
    }
    if (seen) spans.push({ name: m[2], indent: m[1].length, start: i, end });
  });
  return spans;
};

// <AlertDialogAction> blocks never nest, so a non-greedy match is exact — but a
// self-closing tag would swallow the rest of the file, so an unbalanced count is
// reported instead of trusted.
const actionRanges = (src: string): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (const m of src.matchAll(/<AlertDialogAction[\s\S]*?<\/AlertDialogAction>/g)) {
    out.push([m.index, m.index + m[0].length]);
  }
  const opens = (src.match(/<AlertDialogAction/g) || []).length;
  const closes = (src.match(/<\/AlertDialogAction>/g) || []).length;
  expect(opens, `<AlertDialogAction> x${opens} against ${closes} closing tags`).toBe(closes);
  return out;
};

// The builder verb that follows each `.from("<table>")` in a handler body, so a
// handler that deletes a row set and writes it back is recognised as a rewrite.
const tableOps = (body: string, table: string): string[] => {
  const quoted = `"${table}"`;
  const ops: string[] = [];
  let idx = body.indexOf(quoted);
  while (idx >= 0) {
    const next = body.indexOf(quoted, idx + quoted.length);
    const region = body.slice(idx + quoted.length, next < 0 ? body.length : next);
    const op = /\.([a-z_]+)\s*\(/.exec(region);
    ops.push(op ? op[1] : "");
    idx = next;
  }
  return ops;
};

const sitesFor = (file: string): Site[] => {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  const offsets: number[] = [];
  let acc = 0;
  for (const line of lines) { offsets.push(acc); acc += line.length + 1; }
  const spans = handlerSpans(lines);
  const ranges = actionRanges(src);
  const lineAt = (pos: number) => offsets.findIndex((o) => o > pos) - 1;
  const inRange = (pos: number) => ranges.some(([a, b]) => pos >= a && pos < b);

  const enclosing = (i: number) => {
    let best: Span | null = null;
    for (const s of spans) {
      if (s.indent === 0 || s.start > i || s.end < i) continue;
      if (!best || s.start > best.start || (s.start === best.start && s.end < best.end)) best = s;
    }
    return best;
  };
  // The component (indent-0 declaration) owning a handler, so that a `remove`
  // declared in one tab is never credited for a call made in another.
  const componentOf = (h: Span): Span => {
    let best: Span | null = null;
    for (const s of spans) {
      if (s.indent !== 0 || s.start > h.start || s.end < h.start) continue;
      if (!best || s.start > best.start) best = s;
    }
    return best ?? { name: file, indent: 0, start: 0, end: lines.length - 1 };
  };

  const callSites = (h: Span) => {
    const comp = componentOf(h);
    const out: Array<{ line: number; text: string; guarded: boolean }> = [];
    const patterns = [
      new RegExp(`(?:^|[^.\\w$])${h.name}\\s*\\(`, "g"), // remove(id)
      new RegExp(`[{(,]\\s*(?:async\\s+)?${h.name}\\s*[,)}]`, "g"), // onClick={remove}
    ];
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        const pos = m.index + m[0].indexOf(h.name);
        const k = lineAt(pos);
        if (k <= h.end || k < comp.start || k > comp.end || k === h.start) continue;
        out.push({ line: k + 1, text: lines[k].trim().slice(0, 120), guarded: inRange(pos) });
      }
    }
    return out;
  };

  const sites: Site[] = [];
  // A `.delete()` that exists only inside a comment is not a call site. The per-line prefix test
  // below cannot see a wrapped block comment's continuation lines, which carry no `/*` or `*`; that
  // is how batch 15's A14 prose in RowActions.tsx came to read as an unguarded delete.
  const commentSpans = [...src.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index, m.index + m[0].length] as const);
  for (const m of src.matchAll(/\.delete\(\s*\)/g)) {
    const line = lineAt(m.index);
    if (commentSpans.some(([s, e]) => m.index >= s && m.index < e)) continue;
    if (/^\s*(\/\/|\*|\/\*)/.test(lines[line])) continue;
    const before = src.slice(Math.max(0, m.index - 400), m.index);
    const froms = [...before.matchAll(/\.from\(\s*"([a-z_]+)"/g)];
    const table = froms.length ? froms[froms.length - 1][1] : "?";
    const h = enclosing(line);
    if (!h) {
      sites.push({ file, line: line + 1, table, handler: "?", bucket: "NONE", detail: "no enclosing handler" });
      continue;
    }
    const body = lines.slice(h.start, h.end + 1).join("\n");
    const ops = table === "?" ? [] : tableOps(body, table);
    if (ops.includes("insert") || ops.includes("upsert")) {
      sites.push({ file, line: line + 1, table, handler: h.name, bucket: "SAVE", detail: "delete then re-write the same table" });
      continue;
    }
    if (/\b(?:window\.)?confirm\(/.test(body)) {
      sites.push({ file, line: line + 1, table, handler: h.name, bucket: "NATIVE", detail: "native confirm() guard" });
      continue;
    }
    const calls = callSites(h);
    if (!calls.length) {
      sites.push({ file, line: line + 1, table, handler: h.name, bucket: "NONE", detail: "no call site found in this file" });
    } else if (calls.every((c) => c.guarded)) {
      sites.push({ file, line: line + 1, table, handler: h.name, bucket: "DIALOG", detail: `${calls.length} call site(s) inside <AlertDialogAction>` });
    } else {
      const waiver = WAIVERS.find((w) => w.file === file && w.handler === h.name);
      if (waiver) {
        sites.push({ file, line: line + 1, table, handler: h.name, bucket: "WAIVED", detail: waiver.reason });
      } else {
        const bad = calls.filter((c) => !c.guarded);
        sites.push({
          file, line: line + 1, table, handler: h.name, bucket: "NONE",
          detail: bad.map((c) => `button :${c.line} ${c.text}`).join(" | "),
        });
      }
    }
  }
  return sites;
};

describe("every destructive delete asks before it destroys (C14)", () => {
  const sites = sourceFiles("src").flatMap(sitesFor);

  it("scans the screens it is supposed to guard", () => {
    expect(sites.length, "no .delete() site scanned — the census is broken").toBeGreaterThan(20);
    expect(new Set(sites.map((s) => s.file)).size).toBeGreaterThan(15);
  });

  it("leaves nothing but a dialog, a native confirm, a save path or a written waiver between a click and a row", () => {
    const unguarded = sites.filter((s) => s.bucket === "NONE");
    expect(
      unguarded.map((s) => `${s.file}:${s.line} ${s.table} via ${s.handler}() — ${s.detail}`),
      "one-click deletes with no confirmation"
    ).toEqual([]);
  });

  it("keeps the waiver list exactly as reviewed", () => {
    const claimed = new Set(sites.filter((s) => s.bucket === "WAIVED").map((s) => `${s.file}::${s.handler}`));
    expect([...claimed].sort()).toEqual(WAIVERS.map((w) => `${w.file}::${w.handler}`).sort());
    for (const w of WAIVERS) {
      expect([...claimed], `${w.file}::${w.handler} is now guarded — delete the waiver`).toContain(`${w.file}::${w.handler}`);
      if (w.premise) expect(readFileSync(w.file, "utf8"), `${w.file}::${w.handler} waiver premise no longer holds`).toMatch(w.premise);
    }
  });

  it("only promises irrecoverability for tables that really are hard-deleted", () => {
    const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
    const softDeletable = [...new Set(sites.map((s) => s.table))]
      .filter((table) => table !== "?")
      .filter((table) => {
        const start = types.indexOf(`\n      ${table}: {`);
        if (start < 0) return false;
        const rest = types.slice(start + 1);
        const next = rest.search(/\n {6}[a-z_]+: \{/);
        const row = /^ {8}Row: \{([\s\S]*?)\n {8}\}/m.exec(rest.slice(0, next < 0 ? 20000 : next));
        return row ? /deleted_at/.test(row[1]) : false;
      });
    // Every table these screens delete from is hard-deleted, which is what makes
    // "cannot be recovered" in the dialog copy true. If one grows a deleted_at,
    // that wording has to be re-read before the assumption is reused.
    expect(softDeletable.sort()).toEqual([]);
  });
});
