import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// PostgREST answers a write that RLS filtered to zero rows with HTTP 2xx,
// error:null and no representation, so "no error" is not proof that anything
// was written. Batch 13 fixed that for every guarded write reachable from these
// 13 screens. This contract freezes the fix: a browser-authored .delete()/.update()
// here must either ask for the rows it touched, or carry a written reason why zero
// rows is a legitimate outcome.
const FILES = [
  "src/pages/coupons/Coupons.tsx",
  "src/pages/expenses/Expenses.tsx",
  "src/pages/hr/Schedules.tsx",
  "src/pages/inventory/Categories.tsx",
  "src/pages/inventory/Suppliers.tsx",
  "src/pages/invoices/Invoices.tsx",
  "src/pages/leads/Leads.tsx",
  "src/pages/medical/MedicalRecords.tsx",
  "src/pages/payments/Payments.tsx",
  "src/pages/queue/QueueAudit.tsx",
  "src/pages/reminders/Reminders.tsx",
  "src/pages/reminders/ScheduledReminders.tsx",
  "src/pages/reports/ScheduledReports.tsx",
];

const MARKER = "zero-rows-ok";
const source = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

// Walk upward from a write to the comment block that justifies it, skipping the
// rest of a multi-line chain but stopping at the enclosing statement boundary.
function justification(src: string, writeLine: number): string {
  const lines = src.split("\n");
  const found: string[] = [];
  for (let i = writeLine - 1, steps = 0; i >= 0 && steps < 12; i -= 1, steps += 1) {
    const line = lines[i].trim();
    if (/^(\/\/|\/\*|\*|\*\/)/.test(line)) found.push(line);
    else if (line === "") continue;
    else if (/[{}]$|;$|=>$/.test(line)) break;
  }
  return found.join("\n");
}

type Write = { line: number; kind: string; statement: string; selected: boolean; marker: boolean };

function clientWrites(src: string): Write[] {
  const lines = src.split("\n");
  const writes: Write[] = [];
  // Deliberately narrow: supabase.rpc("delete_...") and friends raise a real
  // error on an RLS rejection, so they do not need this contract.
  for (let line = 0; line < lines.length; line += 1) {
    const kind = lines[line].includes(".delete()") ? ".delete()" : lines[line].includes(".update(") ? ".update(" : null;
    if (!kind) continue;
    const tail = lines.slice(line).join("\n");
    const end = tail.indexOf(";");
    const statement = (end === -1 ? tail : tail.slice(0, end)).split("\n")[0];
    writes.push({
      line: line + 1,
      kind,
      statement,
      selected: statement.includes(".select("),
      marker: justification(src, line).includes(MARKER),
    });
  }
  return writes;
}

describe("batch-13 zero-row write contract", () => {
  const all = FILES.map((file) => ({ file, src: source(file), writes: clientWrites(source(file)) }));

  it("scans the batch scope and finds the writes it is meant to freeze", () => {
    expect(all).toHaveLength(13);
    expect(all.filter((e) => e.writes.length === 0)).toEqual([]);
    // 22 browser-authored deletes/updates remain across the 13 screens.
    expect(all.reduce((n, e) => n + e.writes.length, 0)).toBe(22);
  });

  it("proves every browser-authored write, or documents why zero rows is fine", () => {
    const unproved = all.flatMap((e) =>
      e.writes.filter((w) => !(w.selected || w.marker)).map((w) => `${e.file}:${w.line} ${w.kind} -> ${w.statement.trim().slice(0, 90)}`),
    );
    expect(unproved).toEqual([]);
  });

  it("never uses the zero-rows-ok escape hatch where a real proof is possible", () => {
    const marked = all.flatMap((e) => e.writes.filter((w) => w.marker).map((w) => `${e.file}:${w.line} ${w.kind}`));
    expect(marked).toEqual([
      "src/pages/hr/Schedules.tsx:137 .delete()",
      "src/pages/hr/Schedules.tsx:180 .delete()",
      "src/pages/reminders/Reminders.tsx:111 .update(",
    ]);
  });

  it("checks the rows back, not just asks for them", () => {
    const offenders = all
      .map((e) => ({ file: e.file, proved: e.writes.filter((w) => w.selected).length, uses: (e.src.match(/rowsWritten\(/g) ?? []).length }))
      .filter((r) => r.proved > r.uses);
    expect(offenders).toEqual([]);
  });

  it("routes every proof through the shared writeOutcome helper", () => {
    for (const e of all) {
      if (!/rowsWritten\(/.test(e.src)) continue;
      expect(e.src).toContain('from "@/lib/writeOutcome"');
    }
    expect(source("src/lib/writeOutcome.ts")).toContain("export function rowsWritten");
  });
});
