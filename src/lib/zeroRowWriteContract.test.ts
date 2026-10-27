import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// PostgREST answers a write that RLS filtered to zero rows with HTTP 2xx,
// error:null and no representation, so "no error" is not proof that anything
// was written. Batches 13 to 17 fixed that for every guarded write reachable
// from these screens. This contract freezes the fix: a browser-authored
// .delete()/.update() here must either ask for the rows it touched, or carry a
// written reason why zero rows is a legitimate outcome.
const FILES = [
  // batch 13
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
  // batch 14 — clinical, patient and settings writes
  "src/pages/patients/PatientTreatmentPlans.tsx",
  "src/pages/physio/PhysioCaseDetail.tsx",
  "src/pages/invoices/InvoiceDetail.tsx",
  "src/pages/patients/Patients.tsx",
  "src/pages/patients/EditPatientDialog.tsx",
  "src/pages/patients/PatientMedicalTab.tsx",
  "src/pages/hr/Departments.tsx",
  "src/pages/settings/Services.tsx",
  "src/pages/settings/InsuranceContracts.tsx",
  "src/components/ConsumablesEditor.tsx",
  "src/pages/hr/Attendance.tsx",
  "src/pages/hr/Positions.tsx",
  "src/pages/settings/PaymentMethods.tsx",
  "src/pages/settings/UserManagement.tsx",
  "src/pages/settings/AutomatedCommunication.tsx",
  "src/components/layout/Topbar.tsx",
  // batch 16 — desk, calendar, treasury and settings writes
  "src/lib/queueAlerts.ts",
  "src/lib/queueMutation.ts",
  "src/contexts/I18nContext.tsx",
  "src/pages/branches/Branches.tsx",
  "src/pages/medical/MedicalRecordEditor.tsx",
  "src/pages/calendar/CalendarPage.tsx",
  "src/pages/settings/AppointmentSettings.tsx",
  "src/pages/settings/InsuranceCompanies.tsx",
  "src/pages/settings/Templates.tsx",
  "src/pages/hr/Leaves.tsx",
  "src/pages/hr/StaffBranchesTab.tsx",
  "src/pages/invoices/CreateInvoiceDialog.tsx",
  "src/pages/treasury/Treasury.tsx",
  // batch 17 — payroll, catalog and patient writes
  "src/pages/hr/Payroll.tsx",
  "src/pages/hr/TargetBonuses.tsx",
  "src/pages/inventory/Products.tsx",
  "src/pages/medical/Diagnoses.tsx",
  "src/pages/medical/Medications.tsx",
  "src/pages/medical/Procedures.tsx",
  "src/pages/medical/Prescriptions.tsx",
  "src/pages/medical/PrescriptionDetail.tsx",
  "src/pages/medical/Specialties.tsx",
  "src/pages/medical/DocumentsCenter.tsx",
  "src/pages/patients/PatientDocumentsTab.tsx",
  "src/pages/patients/PatientDental.tsx",
  "src/pages/patients/PatientProfile.tsx",
  // Folded into the freeze with no behaviour change: these two were already
  // proved before this campaign, by optimistic-concurrency reads that a later
  // edit could strip as easily as a naive one.
  "src/pages/queue/Queue.tsx",
  "src/pages/settings/Languages.tsx",
];

const MARKER = "zero-rows-ok";
const source = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

// Walk upward from a write to the comment block that justifies it, skipping the
// rest of a multi-line chain but stopping at the enclosing statement boundary.
function justification(lines: string[], writeIndex: number): string {
  const found: string[] = [];
  for (let i = writeIndex - 1, steps = 0; i >= 0 && steps < 12; i -= 1, steps += 1) {
    const line = lines[i].trim();
    if (/^(\/\/|\/\*|\*|\*\/)/.test(line)) found.push(line);
    else if (line === "") continue;
    else if (/[{}]$|;$|=>$/.test(line)) break;
  }
  return found.join("\n");
}

// A builder chain can start on the line above the write ("await supabase"), so
// the head is part of the expression. It stops at a statement or block boundary.
function head(lines: string[], writeIndex: number): string {
  const out: string[] = [];
  for (let i = writeIndex - 1, steps = 0; i >= 0 && steps < 6; i -= 1, steps += 1) {
    const line = lines[i].trim();
    if (line === "" || /^(\/\/|\/\*|\*|\*\/)/.test(line)) continue;
    if (/[{};]$/.test(line)) break;
    out.unshift(line);
  }
  return out.join(" ");
}

// The statement text, for reporting: the write line through the first ";" plus
// any leading-dot continuation lines after it.
function statement(lines: string[], writeIndex: number): string {
  const out: string[] = [];
  let sawSemicolon = false;
  for (let i = writeIndex, steps = 0; i < lines.length && steps < 8; i += 1, steps += 1) {
    const line = lines[i].trim();
    out.push(line);
    if (/;/.test(line)) sawSemicolon = true;
    if (!sawSemicolon) continue;
    if ((lines[i + 1] ?? "").trim().startsWith(".")) continue;
    break;
  }
  return out.join(" ");
}

// The proof lives in the same block as the write, so the window is cut short by
// the next write, by the enclosing block close, or by 8 lines. A later write's
// own .select() can therefore never pay for an earlier unproved one.
function proofWindow(lines: string[], writeIndex: number): string {
  const indent = (lines[writeIndex].match(/^\s*/)?.[0] ?? "").length;
  const out: string[] = [];
  for (let i = writeIndex, steps = 0; i < lines.length && steps < 8; i += 1, steps += 1) {
    const line = lines[i].trim();
    const closesBlock = /^(?:\}|\}\);|\}\s*else)\b/.test(line)
      || (line.endsWith("}") && line !== "" && (lines[i].match(/^\s*/)?.[0] ?? "").length <= indent);
    if (i > writeIndex && (/\.(update\(|delete\(\))/.test(line) || closesBlock)) break;
    out.push(line);
  }
  return out.join(" ");
}

type Write = { line: number; kind: string; statement: string; selected: boolean; marker: boolean };

function clientWrites(src: string): Write[] {
  const lines = src.split("\n");
  const writes: Write[] = [];
  // Deliberately narrow: supabase.rpc("delete_...") and friends raise a real
  // error on an RLS rejection, so they do not need this contract. The same
  // applies to .insert()/.upsert() pairs whose UPDATE half is guarded by the
  // policy WITH CHECK — those are proved by hand in the screens that use them.
  for (let index = 0; index < lines.length; index += 1) {
    const kind = lines[index].includes(".delete()") ? ".delete()" : lines[index].includes(".update(") ? ".update(" : null;
    if (!kind) continue;
    // A Set/Map/.ref() "delete" is not a PostgREST write.
    if (!/\.\s*from\(/.test(head(lines, index) + " " + lines[index])) continue;
    writes.push({
      line: index + 1,
      kind,
      statement: statement(lines, index),
      selected: /\.select\(/.test(proofWindow(lines, index)),
      marker: justification(lines, index).includes(MARKER),
    });
  }
  return writes;
}

describe("zero-row write contract (batches 13-17)", () => {
  const all = FILES.map((file) => ({ file, src: source(file), writes: clientWrites(source(file)) }));

  it("scans the batch scope and finds the writes it is meant to freeze", () => {
    expect(all).toHaveLength(57);
    expect(all.filter((e) => e.writes.length === 0)).toEqual([]);
    // 114 browser-authored deletes/updates remain across the 57 screens. The
    // app-wide census finds 115; the one write outside this list is
    // leads/LeadDetail.tsx:85, proved by `.select("*").single()` — a form this
    // file's rows-back check cannot see, so listing it would fail the screen
    // rather than the defect.
    expect(all.reduce((n, e) => n + e.writes.length, 0)).toBe(114);
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
      "src/components/layout/Topbar.tsx:136 .update(",
      "src/components/layout/Topbar.tsx:143 .update(",
      "src/lib/queueAlerts.ts:112 .update(",
      "src/lib/queueAlerts.ts:114 .update(",
      "src/contexts/I18nContext.tsx:106 .update(",
      "src/pages/branches/Branches.tsx:285 .update(",
      "src/pages/settings/AppointmentSettings.tsx:118 .delete()",
      "src/pages/hr/Payroll.tsx:213 .delete()",
    ]);
  });

  it("checks the rows back, not just asks for them", () => {
    const offenders = all
      .map((e) => ({
        file: e.file,
        proved: e.writes.filter((w) => w.selected).length,
        uses: (e.src.match(/rowsWritten\(/g) ?? []).length + (e.src.match(/maybeSingle\(/g) ?? []).length,
      }))
      .filter((r) => r.proved > r.uses);
    expect(offenders).toEqual([]);
  });

  it("routes every proof through the shared writeOutcome helper", () => {
    for (const e of all) {
      if (!/rowsWritten\(/.test(e.src)) continue;
      expect(e.src).toMatch(/from ["']@\/lib\/writeOutcome["']/);
    }
    expect(source("src/lib/writeOutcome.ts")).toContain("export function rowsWritten");
  });
});
