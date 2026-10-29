import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { moduleKeyForPath } from "./clinicModules";

/**
 * S9: three `/self-audit` routes were mounted in App.tsx behind
 * `PermissionRoute adminOnly` and nothing in the app linked any of them, while
 * the system self-audit told the operator to open two of them by a name the
 * sidebar did not use. These scanners read the same three sources a reader
 * would, and the contract is derived from them rather than restated as a list
 * of strings, so a fourth route or a renamed screen cannot slip past.
 */
const sourceAt = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), "utf8");
const appSource = sourceAt("src/App.tsx");
const sidebarSource = sourceAt("src/components/layout/Sidebar.tsx");
const systemAuditSource = sourceAt("src/lib/systemSelfAudit.ts");

/** Every `<Route path="…self-audit" element={<PermissionRoute …><Comp /></PermissionRoute>`. */
function selfAuditRoutes(source: string) {
  return [...source.matchAll(
    /<Route\s+path="(\/[^"]*self-audit)"\s+element=\{<PermissionRoute([^>]*)><([A-Za-z][\w]*)\s*\/><\/PermissionRoute>\}\s*\/>/g,
  )].map(([, to, gate, component]) => ({ to, adminOnly: /\badminOnly\b/.test(gate), component }));
}

/** The lazy module a component in App.tsx resolves to, as a repo-relative path. */
function lazyFileFor(source: string, component: string) {
  const match = new RegExp(`const ${component} = lazy\\(\\(\\) => import\\("(@/[^"]+)"\\)\\)`).exec(source);
  return match ? `src/${match[1].slice(2) + ".tsx"}` : null;
}

/** Nav lines this file adds: `{ to: "/x", … label: lang === "ar" ? "AR" : "EN" }`. */
function navEntries(source: string) {
  return [...source.matchAll(/to:\s*"([^"]+)"[^\n]*?label:\s*lang === "ar" \? "([^"]+)" : "([^"]+)"/g)]
    .map(([, to, arabic, english]) => ({ to, arabic, english, line: to }));
}

/** The un-tagged text of the first `<h1>` on a page. */
function pageHeading(source: string) {
  const open = source.indexOf("<h1");
  if (open < 0) return null;
  const close = source.indexOf("</h1>", open);
  return source
    .slice(open, close < 0 ? source.length : close)
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const routes = selfAuditRoutes(appSource);
const entries = navEntries(sidebarSource);

describe("self-audit screens are reachable (S9)", () => {
  it("the census is the three routes the finding counted, all adminOnly", () => {
    expect(routes.map((r) => r.to).sort()).toEqual(
      ["/expenses/self-audit", "/queue/self-audit", "/system/self-audit"].sort(),
    );
    for (const route of routes) expect(route.adminOnly).toBe(true);
  });

  it("every one of them has exactly one nav entry", () => {
    // Non-vacuity for the scanner itself: the sidebar holds far more inline
    // bilingual labels than the three added here, so a regex that matched
    // nothing would also "find" every self-audit route unlinked.
    expect(entries.length, "the nav scanner matched nothing").toBeGreaterThan(10);
    for (const route of routes) {
      const linked = entries.filter((entry) => entry.to === route.to);
      expect(linked, `${route.to} has no sidebar entry at all`).toHaveLength(1);
    }
  });

  it("each nav entry carries the gate its route is mounted behind", () => {
    for (const route of routes) {
      const line = sidebarSource.split("\n").find((l) => l.includes(`to: "${route.to}"`)) ?? "";
      expect(line, `${route.to} nav line lost the admin gate`).toContain("authz.isSuperAdmin()");
      // PermissionRoute also blocks on the tenant module the path maps to, so a
      // nav item without that condition would open an Access Denied card.
      const module = moduleKeyForPath(route.to);
      if (module) {
        expect(line, `${route.to} should require module "${module}"`).toContain(`isModuleEnabled("${module}")`);
      } else {
        expect(line, `${route.to} maps to no module and must not claim one`).not.toContain("isModuleEnabled");
      }
    }
  });

  it("each nav label is the words the screen itself uses", () => {
    for (const route of routes) {
      const file = lazyFileFor(appSource, route.component);
      expect(file, `${route.component} is not lazy-imported the way this test reads it`).not.toBeNull();
      const heading = pageHeading(sourceAt(file!));
      const entry = entries.find((e) => e.to === route.to)!;
      expect(entry.english, `"${entry.english}" is not what ${file} titles itself`)
        .toBe(heading);
    }
  });

  it("the two sentences the audit prints name a nav entry that exists", () => {
    const pointers = [...systemAuditSource.matchAll(/Open "([^"]+)" in the sidebar/g)].map((m) => m[1]);
    expect(pointers.length, "the audit stopped telling the operator where to go").toBeGreaterThan(0);
    const labels = new Set(entries.map((entry) => entry.english));
    for (const pointer of pointers) {
      expect(labels, `"${pointer}" is not a sidebar entry`).toContain(pointer);
    }
    expect(systemAuditSource).not.toMatch(/Open [^"]*→ Self Audit/);
  });

  it("the scanners themselves can see a route nobody linked", () => {
    // Non-vacuity: a fourth adminOnly route must arrive in `selfAuditRoutes`
    // and must be reported by the reachability check, or this whole file is
    // asserting against an empty set.
    const synthetic = `${appSource}\n              <Route path="/intake/self-audit" element={<PermissionRoute adminOnly><IntakeSelfAudit /></PermissionRoute>} />\n`;
    const found = selfAuditRoutes(synthetic);
    expect(found.map((r) => r.to)).toContain("/intake/self-audit");
    const unlinked = found.filter((r) => !entries.some((e) => e.to === r.to)).map((r) => r.to);
    expect(unlinked).toEqual(["/intake/self-audit"]);
  });

  it("the scanners themselves can see a label that drifted", () => {
    const syntheticSidebar = sidebarSource.replace(
      'label: lang === "ar" ? "التدقيق الذاتي للطابور" : "Queue Self-Audit"',
      'label: lang === "ar" ? "التدقيق الذاتي للطابور" : "Queue Audit Two"',
    );
    expect(syntheticSidebar).not.toBe(sidebarSource);
    const drifted = navEntries(syntheticSidebar).find((e) => e.to === "/queue/self-audit")!;
    const heading = pageHeading(sourceAt("src/pages/queue/QueueSelfAudit.tsx"));
    expect(drifted.english).not.toBe(heading);
  });
});
