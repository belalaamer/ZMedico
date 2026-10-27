import { describe, expect, it } from "vitest";
import { notConfirmedCopy, rowsWritten } from "./writeOutcome";

describe("rowsWritten — the only honest answer a guarded write can get", () => {
  it("counts the rows PostgREST returned", () => {
    expect(rowsWritten([{ id: "a" }, { id: "b" }])).toBe(2);
    expect(rowsWritten([{ id: "a" }])).toBe(1);
  });

  it.each([["empty array", []], ["null", null], ["undefined", undefined], ["false", false]])(
    "treats %s as nothing touched",
    (_label, value) => {
      expect(rowsWritten(value)).toBe(0);
    },
  );

  it("accepts the single-object shape that maybeSingle() responses already use", () => {
    expect(rowsWritten({ id: "a" })).toBe(1);
  });

  it("does not mistake a plain 0-row response for a failure of the caller", () => {
    // This is the whole point: error === null AND 0 rows is what RLS filtering
    // looks like on the wire, and it must not be read as success.
    const response = { data: [], error: null };
    expect(response.error).toBeNull();
    expect(rowsWritten(response.data)).toBe(0);
  });
});

describe("notConfirmedCopy", () => {
  it("answers in the language the screen is using", () => {
    expect(notConfirmedCopy("ar", "delete")).toContain("لم يتم الحذف");
    expect(notConfirmedCopy("en", "delete")).toContain("Nothing was deleted");
    expect(notConfirmedCopy("ar", "save")).toContain("لم يتم الحفظ");
    expect(notConfirmedCopy("fr", "save")).toBe(notConfirmedCopy("en", "save"));
  });

  it("never opens with a claim that the write happened", () => {
    for (const outcome of ["delete", "save", "own"] as const) {
      for (const lang of ["ar", "en"]) {
        const copy = notConfirmedCopy(lang, outcome);
        expect(copy).not.toMatch(/^(saved|deleted|done|success)/i);
        expect(copy).not.toContain("تم الحفظ بنجاح");
      }
    }
  });

  it("says who may delete an own-only row", () => {
    expect(notConfirmedCopy("en", "own")).toContain("another user");
    expect(notConfirmedCopy("ar", "own")).toContain("مستخدم");
  });
});
