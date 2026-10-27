import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// C16 freeze: a value the desk has to type must be typed into the app's own
// dialog, not into a browser-authored window.prompt().
//
// Why that is a defect class rather than a style preference, measured on the
// three screens this batch rewrote:
//   - a native prompt() is untranslatable — QueueAudit and PhysioCaseDetail
//     showed the employee an English string while the whole page around it was
//     Arabic, and ScheduledReminders asked for "YYYY-MM-DD HH:MM" in English;
//   - it takes free text where a format is required. `new Date("31/12/2026")`
//     is Invalid Date, so a Cairo-format entry for a reschedule was refused
//     with "Invalid date" and no hint of what was wanted;
//   - Leaves could not be cancelled at all: `prompt(...) || ""` fell through to
//     decide(..., "rejected") on dismiss, so closing the box rejected the leave.
//
// Sites still waiting for a dialog are exempted here by file, with the call
// counted, never by line number. The list only shrinks: an exemption whose
// call is gone fails, and a new native prompt fails without an exemption.

type Exemption = { file: string; calls: number; owner: string; premise: RegExp };

// Empty from this branch onward: the only exemption was PhysioCaseDetail's two
// completion/pause prompts, and batch 16 — the PR that exemption named — is in
// this branch, so both now take their answer from a <DialogContent>.
const EXEMPT: Exemption[] = [];

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

// A leading identifier character, a quote or a dot means this is `rewrite_prompt(`,
// `some.prompt(` or prose inside a string literal, not a call to the global.
const NATIVE_PROMPT = /(^|[^A-Za-z0-9_$.])((?:window|globalThis)\s*\.\s*)?prompt\s*\(/gm;

const findSites = () => {
  const sites: Array<{ file: string; line: number; text: string }> = [];
  for (const file of sourceFiles("src")) {
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    lines.forEach((text, i) => {
      const trimmed = text.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      for (const _ of text.matchAll(NATIVE_PROMPT)) sites.push({ file, line: i + 1, text: trimmed.slice(0, 120) });
    });
  }
  return sites;
};

describe("no screen asks the browser for a typed value (C16)", () => {
  const sites = findSites();

  it("scans the screens it is supposed to guard", () => {
    const src = sourceFiles("src");
    expect(src.length, "no source files scanned — the census is broken").toBeGreaterThan(200);
    expect(src.filter((f) => f.startsWith("src/pages/")).length).toBeGreaterThan(80);
  });

  it("leaves typed input to the app's own dialogs", () => {
    const allowed = new Set(EXEMPT.map((e) => e.file));
    expect(
      sites.filter((s) => !allowed.has(s.file)).map((s) => `${s.file}:${s.line} ${s.text}`),
      "native prompt() with no exemption",
    ).toEqual([]);
  });

  it("keeps every exemption on the call count and premise it was reviewed with", () => {
    for (const e of EXEMPT) {
      const found = sites.filter((s) => s.file === e.file);
      expect(found.length, `${e.file} now has ${found.length} native prompt(), not ${e.calls} — update or delete the exemption`).toBe(e.calls);
      expect(readFileSync(e.file, "utf8"), `${e.file}: ${e.owner} is done — delete the exemption`).toMatch(e.premise);
    }
    const knownFiles = new Set(sites.map((s) => s.file));
    for (const e of EXEMPT) expect([...knownFiles], `${e.file}: ${e.owner} — delete the exemption`).toContain(e.file);
  });

  it("keeps the three screens this batch rewrote free of the native dialog", () => {
    for (const file of ["src/pages/hr/Leaves.tsx", "src/pages/queue/QueueAudit.tsx", "src/pages/reminders/ScheduledReminders.tsx"]) {
      expect(sites.filter((s) => s.file === file)).toEqual([]);
      const src = readFileSync(file, "utf8");
      expect(src, `${file} must give the typed value somewhere to live`).toMatch(/<DialogContent/);
      expect(src, `${file} must be able to back out`).toMatch(/<DialogFooter>[\s\S]{0,400}t\("cancel"\)/);
    }
  });
});
