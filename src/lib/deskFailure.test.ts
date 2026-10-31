import { describe, expect, it } from "vitest";
import { deskFailure } from "./deskFailure";

// The raw sentences below are the ones these screens can actually produce, copied
// from the migrations that raise them and from PostgREST's own wording.
const FALLBACK = { en: "Could not save the appointment.", ar: "تعذر حفظ الموعد." };
const en = (error: unknown) => deskFailure(error, "en", FALLBACK.en);
const ar = (error: unknown) => deskFailure(error, "ar", FALLBACK.ar);

describe("deskFailure never shows the server's words", () => {
  const raw = [
    'duplicate key value violates unique constraint "patients_patient_code_active_key"',
    'new row violates row-level security policy for table "appointments"',
    "This appointments belongs to branch 4f2c1b6a-9d3e-4c1a-8b77-2f5a6d0c9e11, but the patient belongs to a different branch. Records cannot be created across branches.",
    'insert or update on table "appointments" violates foreign key constraint "appointments_doctor_id_fkey"',
    "plan_limit_patients_reached",
    "appointment is not eligible for self check-in",
    "JWT expired",
    "null value in column \"name_en\" of relation \"patients\" violates not-null constraint",
    'relation "appointment_settings" does not exist',
    "HTTP 500 internal server error",
  ];
  for (const message of raw) {
    it(`keeps ${JSON.stringify(message.slice(0, 42))}… out of both languages`, () => {
      for (const result of [en({ message, code: "42501" }), ar({ message, code: "42501" })]) {
        expect(JSON.stringify(result)).not.toContain(message);
        expect(result.title).not.toMatch(/appointments|patients|constraint|SQLSTATE|uuid|4f2c1b6a/);
      }
    });
  }
});

describe("deskFailure answers the failure the desk can act on", () => {
  it("treats a row-level security block as a permission problem", () => {
    const result = en({ code: "42501", message: 'new row violates row-level security policy for table "appointments"' });
    expect(result.title).toBe("Your account is not allowed to make this change.");
    expect(result.description).toContain("branch");
  });

  it("reads an expired session out of the raise text, not the generic privilege code", () => {
    expect(en({ code: "42501", message: "authentication required" }).title).toBe("Your session has expired.");
    expect(ar({ code: "42501", message: "JWT expired" }).title).toBe("انتهت جلسة الدخول الخاصة بك.");
  });

  it("separates the two check_violation raises of create_self_checkin_link", () => {
    expect(en({ code: "23514", message: "tenant subscription is not active" }).title)
      .toBe("This clinic's subscription is not active.");
    expect(en({ code: "23514", message: "appointment is not eligible for self check-in" }).description)
      .toContain("scheduled or confirmed");
  });

  it("names the plan ceiling rather than the token that triggered it", () => {
    expect(en({ code: "P0001", message: "plan_limit_patients_reached" }).title)
      .toBe("This plan has reached its patient limit.");
    expect(ar({ code: "P0001", message: "plan_limit_patients_reached" }).description).toContain("الباقة");
  });

  it("hides the branch UUID the cross-branch trigger interpolates", () => {
    const result = en({
      code: "23514",
      message: "This appointments belongs to branch 4f2c1b6a-9d3e-4c1a-8b77-2f5a6d0c9e11, but the patient belongs to a different branch.",
    });
    expect(result.title).toBe("This patient belongs to another branch.");
    expect(result.description).toBe("Choose a patient from the branch you are working in.");
  });

  it("keeps concurrency advice for a compare-and-set collision", () => {
    for (const code of ["40001", "40P01", "55P03"]) {
      expect(en({ code, message: "deadlock detected" }).title).toBe("Someone else changed this at the same moment.");
    }
  });

  it("says a record is gone instead of quoting the key that is missing", () => {
    expect(ar({ code: "P0002", message: 'no data found' }).title).toBe("هذا السجل غير موجود أو لم يعد متاحًا لك.");
    expect(en({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }).title)
      .toBe("This record is missing or no longer available to you.");
  });
});

describe("deskFailure degrades to the screen's own sentence", () => {
  it("shows the fallback title for a failure nothing here recognises", () => {
    const result = en({ code: "99999", message: "some brand new server text" });
    expect(result.title).toBe(FALLBACK.en);
    expect(result.description).toBe("Refresh the screen and check the result before retrying.");
    expect(JSON.stringify(result)).not.toContain("brand new");
  });

  it("shows only the fallback for a response that simply did not confirm the write", () => {
    expect(deskFailure(null, "en", FALLBACK.en)).toEqual({ title: FALLBACK.en });
    expect(deskFailure(null, "ar", FALLBACK.ar)).toEqual({ title: FALLBACK.ar });
  });

  it("is bilingual for every rule it knows", () => {
    const signals = [
      { code: "23505", message: "duplicate key value violates unique constraint" },
      { code: "23502", message: "null value violates not-null constraint" },
      { code: "23503", message: "violates foreign key constraint" },
      { code: "23514", message: "check constraint" },
      { code: "22001", message: "value too long" },
      { code: "22023", message: "invalid parameter value" },
      { code: "22P02", message: "invalid input syntax" },
      { code: "42501", message: "permission denied" },
      { code: "42883", message: "function does not exist" },
      { code: "PGRST202", message: "schema cache could not resolve" },
    ];
    for (const signal of signals) {
      const english = en(signal);
      const arabic = ar(signal);
      expect(english.title).not.toBe(FALLBACK.en);
      expect(arabic.title).not.toBe(FALLBACK.ar);
      expect(english.title).not.toBe(arabic.title);
      expect(arabic.title.length).toBeGreaterThan(8);
    }
  });
});
