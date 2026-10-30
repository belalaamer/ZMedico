import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PATIENT_PICKER_LIMIT,
  fetchPatientOption,
  patientPickerCopy,
  patientSearchFilter,
  pickedPatientLabel,
  searchPatientRows,
  toPatientOptions,
  type PatientSearchRow,
} from "@/lib/patientSearch";

/** Records the builder calls in order, and resolves the read with `result`. */
function fakeClient(result: { data?: unknown; error?: { message: string } | null } = {}) {
  const calls: string[] = [];
  const record = (entry: string) => {
    calls.push(entry);
    return chain;
  };
  const chain: Record<string, unknown> = {
    then: (onFulfilled?: (value: unknown) => unknown) =>
      Promise.resolve(result).then((value) => (onFulfilled ? onFulfilled(value) : value)),
  };
  for (const method of ["from", "select", "is", "eq", "or", "order", "limit", "maybeSingle"]) {
    chain[method] = (...args: unknown[]) => record(`${method}(${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join("|")})`);
  }
  return { client: chain as unknown as SupabaseClient, calls };
}

const ROW = {
  id: "p-1",
  patient_code: 412,
  first_name_en: "Salma",
  last_name_en: "Adel",
  first_name_ar: "سلمى",
  last_name_ar: "عادل",
  name_language: "en",
  phone: "0101234567",
  phone2: null,
  email: "salma@example.com",
} satisfies PatientSearchRow;

describe("patientSearchFilter", () => {
  it("asks for nothing when the term is blank", () => {
    expect(patientSearchFilter("")).toBeNull();
    expect(patientSearchFilter("   ")).toBeNull();
    expect(patientSearchFilter(null)).toBeNull();
    expect(patientSearchFilter(undefined)).toBeNull();
  });

  it("matches name, phone and email in one server-side rule", () => {
    const filter = patientSearchFilter("salma") ?? "";
    const clauses = filter.split(",");
    for (const column of ["first_name_en", "last_name_en", "first_name_ar", "last_name_ar", "phone", "phone2", "email"]) {
      expect(clauses).toContain(`${column}.ilike.%salma%`);
    }
    expect(clauses).toHaveLength(7);
  });

  it("treats a whole number as the clinic code, too", () => {
    const clauses = (patientSearchFilter("412") ?? "").split(",");
    expect(clauses).toContain("patient_code.eq.412");
    expect(clauses).toHaveLength(8);
  });

  it("cannot be turned into filter syntax by the person typing", () => {
    // An unsanitized comma closes the or(...) group and the rest of the string
    // becomes PostgREST filter syntax.
    const hostile = `a") or (id.eq.1),delete`;
    const clauses = (patientSearchFilter(hostile) ?? "").split(",");
    expect(clauses.every((clause) => /^[a-z0-9_]+\.ilike\.%[^()"']*$/.test(clause))).toBe(true);
    expect(clauses).toHaveLength(7);
  });

  it("strips LIKE wildcards so a term cannot widen its own match", () => {
    // "%sa_" arriving at the server as ilike.%...%sa_%...% would match anything
    // with "sa" followed by any character.
    expect(patientSearchFilter("%sa_")).toBe(
      "first_name_en.ilike.%sa%,last_name_en.ilike.%sa%,first_name_ar.ilike.%sa%,last_name_ar.ilike.%sa%,phone.ilike.%sa%,phone2.ilike.%sa%,email.ilike.%sa%",
    );
    expect(patientSearchFilter("sa%le")).toBe("first_name_en.ilike.%sale%,last_name_en.ilike.%sale%,first_name_ar.ilike.%sale%,last_name_ar.ilike.%sale%,phone.ilike.%sale%,phone2.ilike.%sale%,email.ilike.%sale%");
  });

  it("caps the term at 60 characters", () => {
    const clauses = (patientSearchFilter("x".repeat(200)) ?? "").split(",");
    expect(clauses[0]).toBe(`first_name_en.ilike.%${"x".repeat(60)}%`);
  });
});

describe("searchPatientRows", () => {
  it("is branch-scoped, soft-delete-aware, newest-first and bounded", async () => {
    const { client, calls } = fakeClient({ data: [ROW], error: null });
    const outcome = await searchPatientRows(client, { q: "salma", branchId: "branch-1", limit: 25 });
    expect(calls[0]).toBe("from(patients)");
    expect(calls).toContain("is(deleted_at|null)");
    expect(calls).toContain("eq(branch_id|branch-1)");
    expect(calls.some((c) => c.startsWith("or(") && c.includes("phone.ilike.%salma%"))).toBe(true);
    expect(calls).toContain("order(created_at|{\"ascending\":false})");
    expect(calls).toContain("limit(25)");
    expect(outcome.error).toBeNull();
    expect(outcome.rows).toEqual([ROW]);
  });

  it("applies the search filter before the ordering, which PostgREST requires", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await searchPatientRows(client, { q: "salma", branchId: "branch-1", limit: 25 });
    const orIndex = calls.findIndex((c) => c.startsWith("or("));
    const orderIndex = calls.findIndex((c) => c.startsWith("order("));
    expect(orIndex).toBeGreaterThan(-1);
    expect(orderIndex).toBeGreaterThan(orIndex);
  });

  it("sends no filter for an empty term, so opening the picker is a page not a match", async () => {
    const { client, calls } = fakeClient({ data: [ROW], error: null });
    await searchPatientRows(client, { q: "", branchId: "branch-1", limit: 25 });
    expect(calls.some((c) => c.startsWith("or("))).toBe(false);
    expect(calls).toContain("limit(25)");
  });

  it("does not query another clinic or a clinic that is not chosen", async () => {
    const { client, calls } = fakeClient({ data: [ROW], error: null });
    const outcome = await searchPatientRows(client, { q: "salma", branchId: null, limit: 25 });
    expect(calls).toEqual([]);
    expect(outcome).toEqual({ rows: [], error: null });
  });

  it("keeps a refused read apart from a patient-less clinic", async () => {
    const { client } = fakeClient({ data: null, error: { message: "permission denied for table patients" } });
    const outcome = await searchPatientRows(client, { q: "salma", branchId: "branch-1", limit: 25 });
    expect(outcome.rows).toEqual([]);
    expect(outcome.error?.message).toBe("permission denied for table patients");
  });

  it("reads nothing for a zero-size page", async () => {
    const { client, calls } = fakeClient({ data: [ROW], error: null });
    const outcome = await searchPatientRows(client, { q: "salma", branchId: "branch-1", limit: 0 });
    expect(calls).toEqual([]);
    expect(outcome.rows).toEqual([]);
  });
});

describe("toPatientOptions", () => {
  it("labels by the interface language and carries the phone for disambiguation", () => {
    expect(toPatientOptions([ROW], "en")).toEqual([{ id: "p-1", label: "Salma Adel", phone: "0101234567" }]);
    expect(toPatientOptions([ROW], "ar")).toEqual([{ id: "p-1", label: "سلمى عادل", phone: "0101234567" }]);
  });

  it("survives a row with no phone", () => {
    expect(toPatientOptions([{ ...ROW, phone: null }], "en")[0].phone).toBeNull();
  });
});

describe("fetchPatientOption", () => {
  it("names the one patient a form was opened on, by id", async () => {
    const { client, calls } = fakeClient({ data: { ...ROW, id: "p-9" }, error: null });
    const hit = await fetchPatientOption(client, { id: "p-9", lang: "en" });
    expect(calls).toContain("eq(id|p-9)");
    expect(calls).toContain("is(deleted_at|null)");
    expect(hit).toEqual({ id: "p-9", label: "Salma Adel", phone: "0101234567" });
  });

  it("names them in the language the form is using", async () => {
    const { client } = fakeClient({ data: ROW, error: null });
    expect(await fetchPatientOption(client, { id: "p-1", lang: "ar" })).toEqual({
      id: "p-1",
      label: "سلمى عادل",
      phone: "0101234567",
    });
  });

  it("asks nothing for an id it does not have", async () => {
    const { client, calls } = fakeClient({ data: ROW, error: null });
    expect(await fetchPatientOption(client, { id: "", lang: "en" })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("stays silent when the row is gone or the read was refused", async () => {
    const gone = fakeClient({ data: null, error: null });
    expect(await fetchPatientOption(gone.client, { id: "p-1", lang: "en" })).toBeNull();
    const refused = fakeClient({ data: null, error: { message: "permission denied for table patients" } });
    expect(await fetchPatientOption(refused.client, { id: "p-1", lang: "en" })).toBeNull();
  });
});

describe("pickedPatientLabel", () => {
  const options = [{ id: "p-1", label: "Salma Adel" }];

  it("keeps naming the patient that was chosen, after the page moved on", () => {
    expect(pickedPatientLabel({ id: "p-1", label: "Salma Adel" }, [], "p-1")).toBe("Salma Adel");
  });

  it("falls back to the live page when nothing was picked yet", () => {
    expect(pickedPatientLabel(null, options, "p-1")).toBe("Salma Adel");
  });

  it("shows nothing rather than a uuid when the id is on neither", () => {
    expect(pickedPatientLabel(null, [], "p-1")).toBeNull();
    expect(pickedPatientLabel({ id: "p-2", label: "Other" }, [], "p-1")).toBeNull();
  });

  it("shows nothing for an empty selection", () => {
    expect(pickedPatientLabel({ id: "p-1", label: "Salma Adel" }, options, "")).toBeNull();
  });
});

describe("patient picker copy", () => {
  it("answers in both languages", () => {
    const en = patientPickerCopy("en");
    const ar = patientPickerCopy("ar");
    for (const key of ["searchPlaceholder", "searching", "empty", "failed", "truncated"] as const) {
      expect(en[key].length).toBeGreaterThan(0);
      expect(ar[key].length).toBeGreaterThan(0);
      expect(ar[key]).not.toBe(en[key]);
    }
  });

  it("promises phone search in the box itself", () => {
    expect(patientPickerCopy("en").searchPlaceholder).toMatch(/phone/i);
    expect(patientPickerCopy("ar").searchPlaceholder).toContain("رقم الهاتف");
  });

  it("sizes the page as a page, not a clinic", () => {
    expect(PATIENT_PICKER_LIMIT).toBeLessThan(100);
  });
});
