import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS, moduleForPath } from "./rolePermissions";
import { REPORT_NAVIGATION } from "./reportNavigation";

/**
 * P4: the sidebar is the shift's work list, not the system's sitemap.
 *
 * Which links a person sees is decided by the gates written in Sidebar.tsx, so
 * this scanner reads those gates and evaluates them against the role matrix the
 * app already ships (DEFAULT_PERMISSIONS — the same catalog
 * src/lib/authz/navigation.parity.test.ts compares against). What comes out is
 * the nav each role actually gets, which is the only way "short list for the
 * desk, no catalogs, no audit clutter" can be tested. The pinned sets below are
 * derived from the source, so a new screen cannot smuggle itself into a working
 * role's nav unnoticed.
 */
const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sidebarSource = readFileSync(path.join(SRC_ROOT, "components/layout/Sidebar.tsx"), "utf8");
const appSource = readFileSync(path.join(SRC_ROOT, "App.tsx"), "utf8");

const DAY_START = "const dayItems";
const DAY_END = "as NavItem[];";
const GROUPS_START = "const groups";
const GROUPS_END = ".filter(g => g.items.length > 0)";

/** The platform console is a separate surface, not a line in a role's nav. */
const PLATFORM_PATH = "/platform";
/** The reports group builds its list from REPORT_NAVIGATION, not from literals. */
const REPORTS_PLACEHOLDER = "@reports";

type Entry = { to: string; gate: string; group: string };

function region(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, `Sidebar.tsx no longer contains ${JSON.stringify(start)}`).toBeGreaterThan(-1);
  const to = source.indexOf(end, from);
  expect(to, `${JSON.stringify(start)} has no ${JSON.stringify(end)} terminator`).toBeGreaterThan(from);
  return source.slice(from, to);
}

/**
 * Every nav literal in a region, with the conditions that guard it: its own line
 * plus its group's `items:` line, because a group gate is AND-ed with the item
 * gate (`items: <cond> ? [] : [ … ]`).
 */
function entries(regionText: string): Entry[] {
  const found: Entry[] = [];
  let group = "";
  let groupGate = "";
  for (const line of regionText.split("\n")) {
    const key = /^\s*key: "([a-z_]+)"/.exec(line);
    if (key) {
      group = key[1];
      groupGate = "";
      continue;
    }
    const items = /items:\s*(.*)$/.exec(line);
    if (items) {
      groupGate = items[1];
      if (groupGate.trim() === "reportItems,") found.push({ to: REPORTS_PLACEHOLDER, gate: "", group });
      continue;
    }
    const to = /to: "([^"]+)"/.exec(line);
    if (to) found.push({ to: to[1], gate: `${groupGate} ${line}`, group });
  }
  return found;
}

const scan = (source: string) => [
  ...entries(region(source, DAY_START, DAY_END)),
  ...entries(region(source, GROUPS_START, GROUPS_END)),
];

/**
 * The three shapes a gate in this file may take, plus the two identity flags.
 * `isModuleEnabled(…)` is treated as true throughout: this is about audiences,
 * not entitlements — a tenant with physio switched off loses links, and no role
 * gains one. `isPlatformSurface` is false because it swaps the whole clinic nav
 * for the platform console, where `/platform` is reached from the dashboard.
 */
function opensFor(gate: string, role: string): boolean {
  const isAdmin = role === "admin";
  // Same first-dot split AuthorizationService.can() uses.
  const can = (permission: string): boolean => {
    if (isAdmin) return true;
    const dot = permission.indexOf(".");
    return (DEFAULT_PERMISSIONS[role]?.[permission.slice(0, dot)] ?? []).includes(permission.slice(dot + 1));
  };
  if (gate.includes("isPlatformSurface")) return false;
  if (/authz\.isSuperAdmin\(\)/.test(gate) && !isAdmin) return false;
  if (/\bisSystemOwner\b/.test(gate) && !isAdmin) return false;
  if (/\bisMaintainer\b/.test(gate) && !(can("settings.view") || can("settings.catalog.update"))) return false;
  for (const match of gate.matchAll(/authz\.can\("([^"]+)"\)/g)) {
    if (!can(match[1])) return false;
  }
  return true;
}

/** The paths a role can reach through the sidebar, reports expanded. */
function navFor(source: string, role: string): string[] {
  const paths: string[] = [];
  for (const entry of scan(source)) {
    if (entry.to === REPORTS_PLACEHOLDER) {
      for (const report of REPORT_NAVIGATION) {
        if (opensFor(`authz.can("${report.permission}")`, role)) paths.push(report.to);
      }
      continue;
    }
    if (opensFor(entry.gate, role)) paths.push(entry.to);
  }
  return paths.sort();
}

/** Every screen the file offers to someone, reports included. */
const allPaths = [...scan(sidebarSource).map((e) => e.to).filter((to) => to !== REPORTS_PLACEHOLDER && to !== PLATFORM_PATH), ...REPORT_NAVIGATION.map((r) => r.to)].sort();

const dayPaths = entries(region(sidebarSource, DAY_START, DAY_END)).map((e) => e.to);

/** Master data and supervisory diagnostics: not things a shift needs in reach. */
const MAINTENANCE_PATHS = [
  "/medical/specialties",
  "/medical/diagnoses",
  "/medical/medications",
  "/medical/procedures",
  "/queue/audit",
  "/queue/self-audit",
  "/expenses/self-audit",
  "/system/self-audit",
];

/**
 * The permission the route mounted at `to` actually demands. PermissionRoute
 * falls back to `<module>.view` (moduleForPath), but a route may declare a
 * narrower duty with `permission=` — /treasury/shift does, because the desk
 * holds treasury.shift.use and never treasury.view. Reading the truth from
 * App.tsx is what keeps this scanner honest after that prop existed: the
 * alternative was demanding `<module>.view` on every link, which is the exact
 * mistake that made a nav item lead to an Access Denied card.
 */
function routePermission(to: string): string | null {
  const line = appSource
    .split("\n")
    .find((l) => l.includes(`<Route path="${to}" element={<PermissionRoute`));
  if (!line) return null;
  const explicit = /<PermissionRoute permission="([^"]+)"/.exec(line);
  if (explicit) return explicit[1];
  const mod = moduleForPath(to);
  return mod ? `${mod}.view` : null;
}

describe("role-tuned sidebar (P4)", () => {
  it("keeps the flat day list to the working screens it was scoped to", () => {
    expect(dayPaths).toEqual([
      "/calendar",
      "/appointments/pending",
      "/queue",
      "/patients",
      "/leads",
      "/medical/quick-consult",
      "/invoices",
      "/payments",
      "/treasury/shift",
    ]);
    for (const path of MAINTENANCE_PATHS) expect(dayPaths, `${path} is back in the day list`).not.toContain(path);
  });

  it("gives the desk a short list with no catalog and no audit screen", () => {
    expect(navFor(sidebarSource, "receptionist")).toEqual([
      "/appointments/pending",
      "/calendar",
      "/coupons",
      "/invoices",
      "/leads",
      "/patients",
      "/payments",
      "/queue",
      "/reminders",
    ]);
  });

  it("gives the doctor clinical work without money, catalogs or oversight", () => {
    expect(navFor(sidebarSource, "doctor")).toEqual([
      "/appointments/pending",
      "/calendar",
      "/leads",
      "/medical/documents",
      "/medical/prescriptions",
      "/medical/quick-consult",
      "/medical/records",
      "/patients",
      "/physio",
      "/physio/dashboard",
      "/physio/followups",
      "/physio/reports",
      "/queue",
      "/reminders",
      "/reports/commissions",
      "/reports/doctor-performance",
      "/reports/medical",
      "/reports/operational",
      "/reports/scheduled",
    ]);
  });

  it("takes nothing away from the owner", () => {
    // Admin short-circuits authz.can() and satisfies isMaintainer, so every
    // screen the file defines stays reachable for the person who owns them.
    expect(navFor(sidebarSource, "admin")).toEqual(allPaths);
  });

  it("never offers a link its own route would refuse", () => {
    // A day link that is open to someone its route shuts out is unavoidable in
    // the flat, always-visible list, so the gate must name the permission the
    // mounted PermissionRoute demands — the module default or an explicit
    // narrower duty.
    for (const entry of entries(region(sidebarSource, DAY_START, DAY_END))) {
      const required = routePermission(entry.to);
      expect(required, `${entry.to} is not mounted behind a PermissionRoute in App.tsx`).not.toBeNull();
      expect(entry.gate, `${entry.to} is not gated by ${required}`).toContain(`authz.can("${required}")`);
    }
  });

  it("draws the maintainer line with permissions, not role names", () => {
    // The nav has to follow a matrix an owner edits in Settings → Roles, so it
    // must not start asking "is this a receptionist".
    expect(sidebarSource).toMatch(/const isMaintainer = authz\.canAny\("settings\.view", "settings\.catalog\.update"\)/);
    expect(sidebarSource).not.toMatch(/authz\.hasRole/);
    for (const role of ["receptionist", "manager", "nurse", "accountant", "doctor"]) {
      expect(sidebarSource, `${role} named in a nav gate`).not.toContain(`"${role}"`);
    }
  });

  it("leaves exactly one door per screen", () => {
    // A path in both the flat day list and a collapsible group is how a
    // re-sorted nav ends up with two live links for one screen — one of them
    // invisible while its group is collapsed.
    const doors = scan(sidebarSource).map((e) => e.to).filter((to) => to !== REPORTS_PLACEHOLDER);
    expect(doors.length).toBeGreaterThan(30);
    const duplicates = doors.filter((to, i) => doors.indexOf(to) !== i);
    expect(duplicates, `two doors for one screen: ${duplicates.join(", ")}`).toHaveLength(0);
  });

  it("catches a catalog smuggled back into the day list", () => {
    // Non-vacuity: the censuses above must be able to fail on the exact
    // regression P4 exists to prevent, rather than resting on a comment that
    // says catalogs stay out.
    const diagnosesLine = sidebarSource.split("\n").find((line) => line.includes('to: "/medical/diagnoses"'));
    expect(diagnosesLine, "the scanner lost the diagnoses line").toBeDefined();
    const paymentsLine = 'authz.can("invoices.view") && { to: "/payments", icon: CreditCard, label: t("payments") },';
    expect(sidebarSource).toContain(paymentsLine);
    const stripped = sidebarSource.replace(diagnosesLine as string, "");
    const smuggled = stripped.replace(paymentsLine, `${paymentsLine}\n${diagnosesLine}`);
    expect(entries(region(smuggled, DAY_START, DAY_END)).map((e) => e.to)).toContain("/medical/diagnoses");
    expect(navFor(smuggled, "doctor")).toContain("/medical/diagnoses");
  });
});
