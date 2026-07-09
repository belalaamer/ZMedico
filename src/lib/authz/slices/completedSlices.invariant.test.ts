import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  COMPLETED_SLICES,
  activeCompletedSlices,
  type CompletedSlice,
} from "./completedSlices";

/**
 * PERMANENT CI INVARIANT — Completed Vertical Slices.
 *
 * For every slice in `COMPLETED_SLICES` with `status: "complete"`, this
 * suite fails CI if any file inside `ownedPaths` matches a
 * `forbiddenLegacyPatterns` regex. This guarantees that a completed
 * slice can never drift back into dual authorization via a future PR.
 *
 * When no slice is `complete` yet, we still validate the registry shape
 * so a misconfiguration is caught the moment a slice is flipped.
 */

const REPO_ROOT = process.cwd();
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const IGNORED_DIRS = new Set([
  "node_modules", "dist", "build", ".next", ".turbo", ".git", "coverage",
]);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (IGNORED_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (CODE_EXTS.has(full.slice(full.lastIndexOf(".")))) {
      // Skip tests — invariants target production code only.
      if (/\.(test|spec)\.[tj]sx?$/.test(full)) continue;
      out.push(full);
    }
  }
  return out;
}

function collectViolations(slice: CompletedSlice) {
  const violations: {
    slice: string;
    rule: string;
    file: string;
    line: number;
    excerpt: string;
  }[] = [];

  for (const owned of slice.ownedPaths) {
    const abs = join(REPO_ROOT, owned);
    for (const file of walk(abs)) {
      const src = readFileSync(file, "utf8");
      const lines = src.split(/\r?\n/);
      for (const rule of slice.forbiddenLegacyPatterns) {
        const re = new RegExp(rule.pattern, rule.flags ?? "g");
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            violations.push({
              slice: slice.slice,
              rule: rule.name,
              file: relative(REPO_ROOT, file).split(sep).join("/"),
              line: i + 1,
              excerpt: lines[i].trim().slice(0, 200),
            });
          }
          re.lastIndex = 0;
        }
      }
    }
  }
  return violations;
}

describe("Completed vertical slices — permanent authorization invariant", () => {
  it("registry entries are structurally valid", () => {
    for (const s of COMPLETED_SLICES) {
      expect(s.slice, "slice id required").toBeTruthy();
      expect(["shadow", "complete"]).toContain(s.status);
      expect(s.ownedPaths.length, `${s.slice}: ownedPaths must not be empty`).toBeGreaterThan(0);
      expect(s.canonicalKeys.length, `${s.slice}: canonicalKeys must not be empty`).toBeGreaterThan(0);
      expect(s.forbiddenLegacyPatterns.length,
        `${s.slice}: forbiddenLegacyPatterns must not be empty`).toBeGreaterThan(0);
      for (const rule of s.forbiddenLegacyPatterns) {
        expect(() => new RegExp(rule.pattern, rule.flags ?? "g"),
          `${s.slice}/${rule.name}: pattern must compile`).not.toThrow();
      }
    }
  });

  const active = activeCompletedSlices();

  if (active.length === 0) {
    it.skip("no completed slices yet — invariant is dormant until first Migration 2 lands", () => {});
  }

  for (const slice of active) {
    it(`slice "${slice.slice}" contains zero legacy authorization paths`, () => {
      const violations = collectViolations(slice);
      if (violations.length > 0) {
        const report = violations
          .map((v) => `  ✗ [${v.rule}]\n    ${v.file}:${v.line}\n    ${v.excerpt}`)
          .join("\n");
        throw new Error(
          `Completed slice "${slice.slice}" has ${violations.length} legacy ` +
          `authorization path(s). Completed slices MUST route every write ` +
          `through the canonical server-side path.\n${report}\n\n` +
          `Slice notes: ${slice.notes ?? "(none)"}`
        );
      }
      expect(violations).toEqual([]);
    });
  }
});