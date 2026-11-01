import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
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
//
// Batch 34 (C22) widened the same class past `.tsx` — see the display-composition
// section at the bottom. The rule there is shape-based, not file-based, because
// the leak batch 22 fixed lived in a `.ts` module that assembles its own copy.

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

// ─── C22: a display string assembled outside JSX is still a display string ───

const moduleFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...moduleFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out.sort();
};

type CompositionSite = { file: string; line: number; shape: "template" | "display-field"; value: string };

const MEDIATING_HELPERS = ["enumLabel", "enumCopy", "visitTypeLabel", "documentTypeLabel", "statusLabel"];

// Operators under which the column is tested rather than rendered. `??` and `||`
// are deliberately absent: both hand the stored token to the caller when it is
// there, which is exactly the leak this rule is about.
const TESTING_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.InKeyword, ts.SyntaxKind.InstanceOfKeyword,
]);

const rendersTheValue = (access: ts.PropertyAccessExpression): boolean => {
  const parent = access.parent;
  if (ts.isBinaryExpression(parent) && TESTING_OPERATORS.has(parent.operatorToken.kind)) return false;
  // `a.status && copy` is a guard: the token only decides whether copy shows.
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.left === access) return false;
  if (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) return false;
  if (ts.isTypeOfExpression(parent)) return false;
  if (ts.isConditionalExpression(parent) && parent.condition === access) return false;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === access) return false;
  return true;
};

// A row is a lowercase variable (`inv`, `deleteTarget`); a label bag is not
// (`L.status` keys the invoice PDF's word table, `LABELS.status` names a domain).
const rowReceiver = (access: ts.PropertyAccessExpression): boolean => {
  let expr: ts.Expression = access.expression;
  while (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) expr = expr.expression;
  return ts.isIdentifier(expr) && /^[a-z_$]/.test(expr.text);
};

const mediated = (access: ts.Node, stopAt: ts.Node): boolean => {
  for (let node: ts.Node | undefined = access.parent; node; node = node.parent) {
    if (ts.isCallExpression(node) && MEDIATING_HELPERS.includes(node.expression.getText())) return true;
    if (node === stopAt) return false;
  }
  return false;
};

// Two shapes build copy in module code:
//   template       `${inv.status}` — any template-literal interpolation,
//   display-field  `sub:` / `label:` on a search hit, which is what the ⌘K
//                  palette renders under the title; that line is often a join.
const composedSitesIn = (file: string, src: string): CompositionSite[] => {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineAt = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const sites: CompositionSite[] = [];

  // Nested templates are visited on their own, so a span scan stops at them and
  // a `sub:` that is itself a template is reported once, as a template.
  const accesses = (root: ts.Node, stopAt: ts.Node): ts.PropertyAccessExpression[] => {
    const found: ts.PropertyAccessExpression[] = [];
    const scan = (node: ts.Node) => {
      if (ts.isTemplateExpression(node)) return;
      if (
        ts.isPropertyAccessExpression(node) &&
        GUARDED_COLUMNS.includes(node.name.getText()) &&
        rowReceiver(node) &&
        rendersTheValue(node) &&
        !mediated(node, stopAt)
      ) found.push(node);
      ts.forEachChild(node, scan);
    };
    scan(root);
    return found;
  };

  const visit = (node: ts.Node) => {
    if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) {
        for (const access of accesses(span.expression, span.expression)) {
          sites.push({ file, line: lineAt(access.getStart()), shape: "template", value: access.getText() });
        }
      }
    }
    if (ts.isPropertyAssignment(node) && (node.name.getText() === "sub" || node.name.getText() === "label")) {
      for (const access of accesses(node.initializer, node)) {
        sites.push({ file, line: lineAt(access.getStart()), shape: "display-field", value: access.getText() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
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
    // it was written for, and the build breaks somewhere less obvious. Modules
    // are in scope since batch 34: the ⌘K palette labels its own copy.
    for (const file of moduleFiles("src")) {
      if (file === "src/lib/enumLabels.ts") continue; // the helper is declared here
      const src = readFileSync(file, "utf8");
      if (!/enumLabel\(/.test(src)) continue;
      expect(src, `${file} calls enumLabel() without importing it`).toContain('from "@/lib/enumLabels"');
    }
  });
});

// ─── Batch 34 (C22): the blind spot was the file type, not the value ─────────
//
// C17 walks `.tsx` and reads JSX text nodes, so a module that assembles its own
// display string is outside it. That is how four enum values survived the batch
// 21 sweep inside `src/lib/globalSearch.ts`: `sub: \`${inv.status}${…}\`` and
// three `[a.procedure, a.status].join(" · ")` lines were rendered by the ⌘K
// palette while the `.tsx` census had no way to see them. Batch 22 labelled them
// but left the detector blind; this batch measures the class the detector was
// blind to and keeps it closed.
//
// The rule is two shapes that build copy, found on the AST rather than by regex
// (a character scanner missed `invoicePdf.ts` entirely: its HTML is one template
// literal 100 lines long, with nested templates inside):
//   template       a `${…}` interpolation that renders a guarded column,
//   display-field  a `sub:` / `label:` on a search hit — the line the palette
//                  prints under the title, which is usually a join.
//
// A column that is only *tested* is not copy: `x.status === "paid"`,
// `x.status ? a : b`, `!x.status`, `typeof x.status`, `CLASSES[x.status]` and
// `x.status && copy` all decide what to render; the token never reaches the
// string. Those are excluded on the AST, not by an exemption.
//
// What the rule does not see, stated so it is not mistaken for coverage:
//   - `String(x.status)`, `x.status.toString()` and `[x.status]` outside a
//     template or a `sub:`/`label:` field;
//   - a URL or a query key built from a column (`?status=${x.status}`) is
//     flagged too — the rule cannot tell copy from a key, so that is where the
//     exemption list comes in: it records the judgement instead of hiding it;
//   - `.tsx` JSX attributes (the JSX-text half is the C17 rule above).
//
// The exemption list only shrinks, exactly like the one above. Two kinds of entry
// are written down, and they are deliberately separate lists:
//   - EXEMPT: a site reviewed and judged not to be copy;
//   - OPEN:   a shipped defect this batch must not fix (an invoice document is
//             the owner's red line), recorded as register C26. When it is fixed
//             its site disappears and this list fails until the entry is deleted.

type CompositionExemption = {
  file: string;
  shape: CompositionSite["shape"];
  sites: number;
  owner: string;
  premise: RegExp;
};

const keyOf = (site: { file: string; shape: string }) => `${site.file}::${site.shape}`;

const COMPOSE_EXEMPT: CompositionExemption[] = [
  {
    file: "src/lib/authz/sharedAuthzStore.ts",
    shape: "template",
    sites: 1,
    owner: "the interpolation is a Set key (`${row.role}:${row.module}`), never rendered — role and module are the lookup pair the fallback below tests membership against. Moved here from usePermissions.ts by the shared authz store (#252).",
    premise: /seen\.add\(`\$\{row\.role\}:\$\{row\.module\}`\)/,
  },
  {
    file: "src/lib/systemSelfAudit.ts",
    shape: "template",
    sites: 1,
    owner: "the self-audit report is an English-only operator diagnostic — every check title and sentence is English, so an Arabic role word inside it would be worse than the token, and enumLabels has no role domain to route to",
    premise: /Roles: \$\{rolesRes\.data\.map/,
  },
  {
    file: "src/pages/settings/QAIdentities.tsx",
    shape: "template",
    sites: 1,
    owner: "the role is a local QARoleKey fixture on a QA-only provisioning card, not an app_role value — the same fixture the JSX rule exempts above",
    premise: /const ACCOUNTS/,
  },
];

const COMPOSE_OPEN: CompositionExemption[] = [
  {
    file: "src/lib/invoicePdf.ts",
    shape: "template",
    sites: 2,
    owner: "OPEN DEFECT C26 — the customer PDF prints the stored invoice_status and payment_method tokens (esc(invoice.status) in the header, String(p.payment_method).replace(\"_\", \" \") in the payments table). An invoice/payment document is the owner's red line: reported in the audit register, not edited by this batch. Fixing it must delete this entry — the site counts make the list fail until then.",
    premise: /esc\(invoice\.status\)/,
  },
];

describe("no module composes a stored enum value into copy (C22)", () => {
  const files = moduleFiles("src");
  const sites = files.flatMap((file) => composedSitesIn(file, readFileSync(file, "utf8")));

  it("scans both module extensions", () => {
    expect(files.length, "no module files scanned — the census is broken").toBeGreaterThan(250);
    expect(files.filter((f) => f.endsWith(".tsx")).length).toBeGreaterThan(150);
    expect(files, "the module census must include the palette that shipped C22").toContain("src/lib/globalSearch.ts");
  });

  it("catches the shapes it was written for, and leaves tested values alone", () => {
    const probe = (src: string) => composedSitesIn("probe.tsx", src).map((s) => `${s.shape}:${s.value}`);

    // The two shapes batch 22 fixed, as they read before the fix. Both probes
    // sit in an object literal: a bare `sub:` statement is a JS label.
    expect(probe('({ sub: `${inv.status}${due > 0 ? "" : ""}` });'), "template copy").toEqual(["template:inv.status"]);
    expect(probe('({ sub: [a.procedure, a.status].filter(Boolean).join(" · ") });'), "joined copy").toEqual(["display-field:a.status"]);
    // The Set key is seen — that is why it needs a written-down exemption.
    expect(probe("seen.add(`${r.role}:${r.module}`)")).toEqual(["template:r.role"]);

    // Mediation, label bags, and values that are only tested are not copy.
    expect(probe('({ sub: `${enumLabel("invoice_status", inv.status, lang)}` });')).toEqual([]);
    expect(probe("`${L.status}`")).toEqual([]);
    expect(probe("`${CLASSES[inv.status]}`")).toEqual([]);
    expect(probe('`${inv.status === "paid" ? "a" : "b"}`')).toEqual([]);
    expect(probe('`${a.status && enumLabel("appointment_status", a.status, lang)}`')).toEqual([]);
    expect(probe("`${!inv.status}`")).toEqual([]);
    // JSX text belongs to the C17 rule above, not to this one.
    expect(probe("<TableCell>{row.status}</TableCell>")).toEqual([]);
  });

  it("keeps every composed enum behind a label helper or a written-down reason", () => {
    const accepted = new Set([...COMPOSE_EXEMPT, ...COMPOSE_OPEN].map(keyOf));
    expect(
      sites.filter((s) => !accepted.has(keyOf(s))).map((s) => `${s.file}:${s.line} ${s.shape} ${s.value}`),
      "a stored enum value is being composed into copy",
    ).toEqual([]);
  });

  it("keeps both lists on the sites and reasons they were reviewed with", () => {
    const listed = [...COMPOSE_EXEMPT, ...COMPOSE_OPEN];
    const claimed = new Set(sites.filter((s) => listed.some((e) => keyOf(e) === keyOf(s))).map(keyOf));
    expect(
      [...claimed].sort(),
      "an entry here has no site left — delete it; a site here has no entry — label it or write down why",
    ).toEqual([...new Set(listed.map(keyOf))].sort());
    for (const e of listed) {
      const found = sites.filter((s) => keyOf(s) === keyOf(e));
      expect(found.length, `${e.file} now has ${found.length} ${e.shape} sites, not ${e.sites} — fix it or re-review the entry`).toBe(e.sites);
      expect(readFileSync(e.file, "utf8"), `${e.file}: ${e.owner} no longer holds — delete the entry`).toMatch(e.premise);
    }
  });

  it("never moves a shipped defect into the accepted list", () => {
    // The OPEN entry is a defect awaiting owner authorization, not a design
    // decision. The same file may not appear in both lists, and the claim-check
    // above fails if the site is fixed and the entry is left behind.
    const openFiles = new Set(COMPOSE_OPEN.map((e) => e.file));
    expect(COMPOSE_EXEMPT.filter((e) => openFiles.has(e.file))).toEqual([]);
    expect(COMPOSE_OPEN.map((e) => e.owner).every((owner) => owner.startsWith("OPEN DEFECT C26"))).toBe(true);
  });
});
