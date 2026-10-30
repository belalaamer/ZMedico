import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// S1 ratchet. A screen that hands `error.message` to a toast is printing whatever
// the database said: English, untranslated, and usually carrying a table name, a
// constraint name, or a row UUID. Batch A (this PR) moved the queue, the calendar
// and the patient list onto `deskFailure`; the counts below pin that those fifteen
// paths stay mediated, and the ledger names every screen still waiting.
//
// The ledger is a ledger, not a threshold: each file and its exact count are named,
// so a new raw sink fails wherever it appears, and a converted file has to leave the
// list on purpose. A call whose argument goes through one of the mediators below is
// not a sink — it reads the message and answers with copy. `src/pages/patients/Patients.tsx=1`
// is the patient form's zod message, a different class (per-field labels, not a
// server sentence), so it stays counted here until a form-validation batch claims it.

// Call sites whose argument is already translated by a rule, not echoed.
const MEDIATORS = ["safeEdgeReason", "invokeFailureReason", "portalFailureReason", "deskFailure", "bookingFailureCopy"];

const LEDGER: string[] = [
  "src/components/ConsumablesEditor.tsx=4",
  "src/pages/appointments/AppointmentDetail.tsx=2",
  "src/pages/auth/Auth.tsx=1",
  "src/pages/booking/PublicBooking.tsx=1",
  "src/pages/branches/Branches.tsx=4",
  "src/pages/coupons/Coupons.tsx=4",
  "src/pages/expenses/Expenses.tsx=3",
  "src/pages/hr/Attendance.tsx=5",
  "src/pages/hr/Departments.tsx=2",
  "src/pages/hr/DoctorServicesTab.tsx=3",
  "src/pages/hr/Leaves.tsx=2",
  "src/pages/hr/Payroll.tsx=6",
  "src/pages/hr/Performance.tsx=1",
  "src/pages/hr/Positions.tsx=3",
  "src/pages/hr/Schedules.tsx=3",
  "src/pages/hr/Staff.tsx=3",
  "src/pages/hr/StaffBranchesTab.tsx=2",
  "src/pages/hr/TargetBonuses.tsx=3",
  "src/pages/inventory/Alerts.tsx=1",
  "src/pages/inventory/Categories.tsx=2",
  "src/pages/inventory/Products.tsx=5",
  "src/pages/inventory/PurchaseOrders.tsx=3",
  "src/pages/inventory/Suppliers.tsx=3",
  "src/pages/invoices/CreateInvoiceDialog.tsx=4",
  "src/pages/invoices/InvoiceDetail.tsx=2",
  "src/pages/invoices/Invoices.tsx=3",
  "src/pages/invoices/OutstandingDebts.tsx=1",
  "src/pages/leads/LeadDetail.tsx=4",
  "src/pages/leads/Leads.tsx=5",
  "src/pages/medical/ConsultationDashboard.tsx=6",
  "src/pages/medical/Diagnoses.tsx=2",
  "src/pages/medical/DocumentsCenter.tsx=2",
  "src/pages/medical/MedicalRecordEditor.tsx=9",
  "src/pages/medical/MedicalRecords.tsx=1",
  "src/pages/medical/Medications.tsx=2",
  "src/pages/medical/PrescriptionDetail.tsx=2",
  "src/pages/medical/Prescriptions.tsx=1",
  "src/pages/medical/Procedures.tsx=2",
  "src/pages/medical/QuickConsult.tsx=2",
  "src/pages/medical/Specialties.tsx=1",
  "src/pages/patientPortal/PatientPortal.tsx=1",
  "src/pages/patients/EditPatientDialog.tsx=1",
  "src/pages/patients/PatientDental.tsx=1",
  "src/pages/patients/PatientDocumentsTab.tsx=2",
  "src/pages/patients/PatientMedicalTab.tsx=1",
  "src/pages/patients/PatientProfile.tsx=2",
  "src/pages/patients/PatientTreatmentPlans.tsx=11",
  "src/pages/patients/PatientWalletTab.tsx=2",
  "src/pages/patients/Patients.tsx=1",
  "src/pages/payments/Payments.tsx=2",
  "src/pages/payments/RecordPaymentDialog.tsx=1",
  "src/pages/physio/PhysioCaseDetail.tsx=5",
  "src/pages/physio/PhysioCases.tsx=1",
  "src/pages/platform/PlanCatalogPanel.tsx=1",
  "src/pages/platform/PlatformConsole.tsx=4",
  "src/pages/platform/SubscriptionRequestsPanel.tsx=3",
  "src/pages/platform/TenantBrandingDialog.tsx=5",
  "src/pages/platform/TenantDomains.tsx=3",
  "src/pages/queue/QueueAudit.tsx=5",
  "src/pages/reminders/Reminders.tsx=2",
  "src/pages/reminders/ScheduledReminders.tsx=4",
  "src/pages/reports/ScheduledReports.tsx=3",
  "src/pages/settings/AISettings.tsx=1",
  "src/pages/settings/AppointmentSettings.tsx=8",
  "src/pages/settings/AutomatedCommunication.tsx=1",
  "src/pages/settings/BackupExport.tsx=4",
  "src/pages/settings/GeneralSettings.tsx=3",
  "src/pages/settings/InsuranceCompanies.tsx=2",
  "src/pages/settings/InsuranceContracts.tsx=4",
  "src/pages/settings/InvoiceSettings.tsx=1",
  "src/pages/settings/NotificationSettings.tsx=1",
  "src/pages/settings/PaymentMethods.tsx=1",
  "src/pages/settings/QAIdentities.tsx=3",
  "src/pages/settings/RemindersSettings.tsx=2",
  "src/pages/settings/RolePermissions.tsx=1",
  "src/pages/settings/Services.tsx=4",
  "src/pages/settings/Templates.tsx=1",
  "src/pages/settings/UserManagement.tsx=6",
  "src/pages/treasury/DailyClose.tsx=2",
  "src/pages/treasury/Treasury.tsx=5",
];

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

// The first argument of a call, quote-aware so a string containing a bracket or a
// comma cannot end the scan early, and stopping at the first top-level comma.
function firstArgument(src: string, open: number): string {
  let depth = 0;
  let out = "";
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      for (; i < src.length; i += 1) {
        out += src[i];
        if (src[i] === "\\") { i += 1; out += src[i] ?? ""; continue; }
        if (src[i] === quote) break;
      }
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
      if (depth === 1) continue;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 1) break;
      depth -= 1;
    } else if (ch === "," && depth === 1) break;
    out += ch;
  }
  return out;
};

function mediated(arg: string): string {
  let left = arg;
  for (const name of MEDIATORS) left = left.replace(new RegExp(`\\b${name}\\s*\\([^()]*\\)`, "g"), "");
  return left;
}

function rawSinks(): Array<{ file: string; line: number; arg: string }> {
  const found: Array<{ file: string; line: number; arg: string }> = [];
  for (const file of sourceFiles("src")) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/\btoast(?:\.\w+)?\s*\(/g)) {
      const open = (match.index ?? 0) + match[0].length - 1;
      const arg = mediated(firstArgument(src, open));
      if (!/\.message\b|\.error\b|\berror\b\s*\)/.test(arg)) continue;
      const line = src.slice(0, match.index).split("\n").length;
      found.push({ file, line, arg: arg.trim().slice(0, 90) });
    }
  }
  return found;
}

const ledgerEntry = (file: string, count: number) => `${file}=${count}`;

// What batch A claims about the three screens it converted: this many error paths go
// through the rule, and no other raw sink is left except the patient form's zod
// message, named in the header above.
const CONVERTED = [
  { file: "src/pages/queue/Queue.tsx", ruleCalls: 6, remainingRaw: 0 },
  { file: "src/pages/calendar/CalendarPage.tsx", ruleCalls: 6, remainingRaw: 0 },
  { file: "src/pages/patients/Patients.tsx", ruleCalls: 3, remainingRaw: 1 },
];

describe("screens stop quoting the database (S1)", () => {
  const sinks = rawSinks();
  const counts = new Map<string, number>();
  for (const sink of sinks) counts.set(sink.file, (counts.get(sink.file) ?? 0) + 1);
  const measured = [...counts.entries()].map(([file, count]) => ledgerEntry(file, count)).sort();

  it("routes each converted error path through deskFailure", () => {
    for (const { file, ruleCalls } of CONVERTED) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain('import { deskFailure } from "@/lib/deskFailure";');
      expect(src.match(/\bdeskFailure\(/g)?.length ?? 0).toBe(ruleCalls);
    }
  });

  it("leaves only the sinks this batch declares on those screens", () => {
    for (const { file, remainingRaw } of CONVERTED) {
      const left = sinks.filter((sink) => sink.file === file);
      expect(left.map((sink) => `${sink.line}: ${sink.arg}`)).toHaveLength(remainingRaw);
    }
  });

  it("keeps the ledger of remaining raw sinks exactly as counted here", () => {
    expect(measured).toEqual(LEDGER);
  });
});
