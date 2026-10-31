import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * C4: a patient past the page a picker loads cannot be found, and therefore
 * cannot be booked. Every surface that lets the desk choose a patient must ask
 * the database (src/lib/patientSearch.ts) instead of pulling the clinic into
 * the browser and filtering names there -- which never matched on phone anyway.
 *
 * The negative assertion is per file on purpose: `from("patients")` followed by
 * a numeric `.limit(n)` is the loader shape this defect shipped with. A paginated
 * list (`.range()`) and a one-row lookup are not.
 */
const PICKER_SURFACES = [
  "src/pages/calendar/CalendarPage.tsx",
  "src/pages/queue/Queue.tsx",
  "src/lib/globalSearch.ts",
  "src/pages/medical/QuickConsult.tsx",
  "src/pages/patients/ReferrerPicker.tsx",
  "src/pages/payments/RecordPaymentDialog.tsx",
  "src/pages/invoices/CreateInvoiceDialog.tsx",
  "src/pages/reminders/ScheduledReminders.tsx",
  "src/pages/physio/PhysioCases.tsx",
  "src/pages/medical/DocumentsCenter.tsx",
];

// A page window on the patients table, however large, is the defect. `.range()`
// paging and a `.maybeSingle()` lookup of the row the form already holds are not.
const CAPPED_PATIENTS_QUERY =
  /from\(\s*"patients"\s*\)(?:(?!\.then\(|\.single\(|\.maybeSingle\()[\s\S]){0,400}?\.limit\(\s*\d+\s*\)/;

// ⌘K shares the rule but renders no picker of its own, so only the surfaces with
// a widget are checked for the search callback.
const PICKER_WIDGETS = PICKER_SURFACES.filter((file) => file !== "src/lib/globalSearch.ts");

describe("patient pickers search server-side (C4)", () => {
  it.each(PICKER_SURFACES)("%s goes through the shared patient search", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src, `${file} must use the shared server-side patient search`).toMatch(
      /from "@\/lib\/patientSearch"|from "@\/hooks\/usePatientSearch"/,
    );
    expect(src, `${file} still loads a capped patient list into the browser`).not.toMatch(CAPPED_PATIENTS_QUERY);
  });

  it.each(PICKER_WIDGETS)("%s hands the picker a search callback", (file) => {
    const src = readFileSync(file, "utf8");
    // Without onSearch the widget only filters the page it was given, which is
    // the exact half-fix that leaves a patient past the ceiling unreachable.
    expect(src, `${file} must let the picker ask the server for a term`).toMatch(/onSearch=\{/);
  });

  it.each([
    // A form that can be opened *on* a patient is handed an id, and one page of
    // matches will usually not contain that row, so the label needs its own lookup.
    ["src/pages/invoices/CreateInvoiceDialog.tsx", "presetPatientId"],
    ["src/pages/patients/ReferrerPicker.tsx", "value"],
  ])("%s looks up the patient it was handed by id", (file, prop) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/fetchPatientOption|\.eq\(\s*"id"\s*,/);
    expect(src, `${file} must still label the patient held in ${prop}`).toContain(prop);
  });

  it("has one matching rule, used by every picker and by ⌘K", () => {
    const shared = readFileSync("src/lib/patientSearch.ts", "utf8");
    const patientsList = readFileSync("src/pages/patients/Patients.tsx", "utf8");
    // The patients list is the reference implementation the shared rule copied;
    // if the two ever disagree, a patient findable in one screen is invisible in
    // another, which is exactly the complaint C4 was filed for.
    for (const column of ["first_name_en", "last_name_en", "first_name_ar", "last_name_ar", "phone", "phone2", "email"]) {
      expect(shared).toContain(`"${column}"`);
      expect(patientsList).toContain(`${column}.ilike`);
    }
  });

  it("sanitizes before the or(...) group, never after", () => {
    const shared = readFileSync("src/lib/patientSearch.ts", "utf8");
    expect(shared).toMatch(/sanitizeSearch\(/);
    expect(shared.indexOf("sanitizeSearch(")).toBeLessThan(shared.indexOf(".join(\",\")"));
  });
});
