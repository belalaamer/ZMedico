import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A doctor is allowed to write the visit's invoice -- the branch policies let the
// insert through -- but the invoices screen is a money screen they cannot open.
// These two screens used to answer a successful create with an Access Denied card,
// which reads to the clinic as "the invoice you just made does not exist". The
// contract is therefore: never hand a money door to a role that cannot walk
// through it, and keep the created draft visible where it was made.

const here = path.dirname(fileURLToPath(import.meta.url));
const VISIT_SCREENS = ["MedicalRecordEditor.tsx", "ConsultationDashboard.tsx"];

const read = (file: string) => readFileSync(path.join(here, file), "utf8");

function region(file: string, start: string): string {
  const src = read(file);
  const from = src.indexOf(start);
  expect(from, `${start} is missing from ${file}`).toBeGreaterThan(-1);
  return src.slice(from);
}

/** Every link toward `/invoices/<id>`, tagged with whether a guard sits above it. */
const DOOR = /(to=|nav\()\{?`\/invoices\//;

function invoiceDoors(file: string) {
  const lines = read(file).split("\n");
  return lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => DOOR.test(line))
    .map(({ line, index }) => ({
      line: line.trim(),
      guarded: lines.slice(Math.max(0, index - 6), index + 1).some((near) => near.includes("canOpenInvoice")),
    }));
}

describe("the visit keeps its invoice inside the visit", () => {
  it("asks the permission rather than trusting the role", () => {
    for (const file of VISIT_SCREENS) {
      expect(
        region(file, 'const canOpenInvoice = authz.can("invoices.view")'),
        `${file} does not gate on invoices.view`,
      ).not.toBe("");
    }
  });

  it("puts every door to the money screen behind that answer", () => {
    for (const file of VISIT_SCREENS) {
      const doors = invoiceDoors(file);
      expect(doors.length, `${file} lost its invoice link entirely`).toBeGreaterThan(0);
      for (const door of doors) {
        expect(door.guarded, `${file}: unguarded money door -> ${door.line}`).toBe(true);
      }
    }
  });

  it("creates the draft and stays on the visit", () => {
    const create = region("MedicalRecordEditor.tsx", "const create = async () => {").split("\n  };")[0];
    expect(create).not.toMatch(/nav\(/);
    // The draft has to be visible here, so the list is re-read after the write.
    expect(create).toContain("await loadInvoices()");
    expect(create).toContain("setJustCreatedId(inv.id)");
  });

  it("tells the desk the draft was handed over, in both languages", () => {
    const created = region("MedicalRecordEditor.tsx", "{justCreated && (");
    expect(created).toContain('lang === "ar"');
    expect(created).toMatch(/تحصيلها/);
    expect(created).toMatch(/reception desk/);
  });
});
