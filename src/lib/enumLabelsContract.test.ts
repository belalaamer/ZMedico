import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// C17 freeze: a value Postgres stores must not reach the Arabic desk as the
// stored string. `{r.status}` renders `in_progress` to a Cairo receptionist,
// and the screen around it is Arabic, so the word reads like a database error.
//
// The guarded names are the columns the Production catalog says are typed by an
// enum — read from pg_attribute joined to pg_enum on 2026-10-28 — minus three
// names that collide with a free-text column on another table. Guarding them
// would force an exemption that argues with itself:
//   - `category` is report_category on report_templates, but the doctor's own
//     words on diagnoses (text, no CHECK), and Diagnoses.tsx prints those;
//   - `frequency` is report_frequency on report_schedules, but the dosing
//     regimen a prescriber types on prescription_items ("TID", "1-1-1");
//   - `type` is an enum on some tables and the author's own text on others.
// `patient_portal_accounts.status`, `treatment_plans.status`,
// `lead_followups.status` and `tenant_domains.status` are `text` with a CHECK
// rather than an enum; they stay under the `status` name because their value
// space is still a closed array, read from the live constraint.
//
// Sites are keyed by file and matched shape, never by line number, and the
// exemption list only shrinks: an exemption whose site is gone fails, and a new
// bare site fails until it goes through a label helper.

const GUARDED_COLUMNS = [
  "actor_role", "alert_type", "attendance", "billing_cycle", "check_in_method",
  "check_out_method", "claim_status", "contract_type", "document_type", "format",
  "gender", "item_type", "new_status", "payment_method", "payment_provider",
  "previous_status", "reminder_channel", "reminder_type", "role", "setting_type",
  "sms_provider", "status", "subscription_status", "transaction_type", "trend",
  "tx_type", "visit_type", "whatsapp_provider",
];

// A value interpolated into JSX text: `{row.status}` with a tag on the other
// side, and no `=` before it, which would make it a `value={form.status}`
// attribute instead of copy on screen. Any label call — enumLabel(),
// statusLabel(), formatDate() — is a different shape and does not match, which
// is exactly the point.
const BARE_INTERPOLATION = new RegExp(
  `(?<!=)\\{\\s*[A-Za-z_$][\\w$]*(?:\\??\\.[\\w$]+)*\\.(${GUARDED_COLUMNS.join("|")})\\s*\\}\\s*(?=<)`,
  "g",
);

type Exemption = { file: string; sites: number; owner: string; premise: RegExp };

const EXEMPT: Exemption[] = [
  {
    file: "src/pages/settings/QAIdentities.tsx",
    sites: 1,
    owner: "the role is a local QARoleKey fixture on a QA-only provisioning card, not an app_role value",
    premise: /const ACCOUNTS/,
  },
];

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name)) out.push(path);
  }
  return out.sort();
};

const findSites = () => {
  const sites: Array<{ file: string; line: number; text: string }> = [];
  for (const file of sourceFiles("src")) {
    readFileSync(file, "utf8").split("\n").forEach((raw, i) => {
      const trimmed = raw.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      for (const m of raw.matchAll(BARE_INTERPOLATION)) {
        sites.push({ file, line: i + 1, text: m[0].replace(/\s+/g, " ").trim() });
      }
    });
  }
  return sites;
};

describe("no screen renders a stored enum value to the Arabic desk (C17)", () => {
  const sites = findSites();

  it("scans the screens it is supposed to guard", () => {
    const src = sourceFiles("src");
    expect(src.length, "no source files scanned — the census is broken").toBeGreaterThan(150);
    expect(src.filter((f) => f.startsWith("src/pages/")).length).toBeGreaterThan(80);
  });

  it("catches the shape it was written for", () => {
    // A detector that silently stops matching is worse than no detector: this
    // is the string the sweep found before the batch, on a scratch buffer.
    const probe = `<TableCell>{row.status}</TableCell> · {c.trend}<Badge>`;
    expect([...probe.matchAll(BARE_INTERPOLATION)].map((m) => m[0].trim())).toEqual([
      "{row.status}",
      "{c.trend}",
    ]);
  });

  it("keeps every enum-typed column behind a label helper", () => {
    const allowed = new Set(EXEMPT.map((e) => e.file));
    expect(
      sites.filter((s) => !allowed.has(s.file)).map((s) => `${s.file}:${s.line} ${s.text}`),
      "raw enum value interpolated into JSX text",
    ).toEqual([]);
  });

  it("keeps every exemption on the site count and reason it was reviewed with", () => {
    for (const e of EXEMPT) {
      const found = sites.filter((s) => s.file === e.file);
      expect(found.length, `${e.file} now has ${found.length} bare sites, not ${e.sites} — fix it or re-review the exemption`).toBe(e.sites);
      expect(readFileSync(e.file, "utf8"), `${e.file}: ${e.owner} no longer holds — delete the exemption`).toMatch(e.premise);
    }
  });

  it("requires a file that calls a label helper to import it", () => {
    // Otherwise a page only passes because the regex stopped seeing the shape
    // it was written for, and the build breaks somewhere less obvious.
    for (const file of sourceFiles("src")) {
      const src = readFileSync(file, "utf8");
      if (!/enumLabel\(/.test(src)) continue;
      expect(src, `${file} calls enumLabel() without importing it`).toContain('from "@/lib/enumLabels"');
    }
  });
});
