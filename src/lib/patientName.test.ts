import { describe, expect, it } from "vitest";
import { patientDisplayDirection, patientDisplayName } from "./patientName";

describe("patientDisplayName", () => {
  it("keeps an English-entered name in Latin script in Arabic UI", () => {
    expect(patientDisplayName({
      first_name_en: "John",
      last_name_en: "Smith",
      first_name_ar: "John",
      last_name_ar: "Smith",
    }, "ar")).toBe("John Smith");
  });

  it("keeps an Arabic-entered name in Arabic script in English UI", () => {
    expect(patientDisplayName({
      first_name_en: "أحمد",
      last_name_en: "علي",
      first_name_ar: "أحمد",
      last_name_ar: "علي",
    }, "en")).toBe("أحمد علي");
  });

  it("prefers the populated original-script field when the other translation is different", () => {
    expect(patientDisplayName({
      first_name_en: "Mohamed",
      last_name_en: "Ibrahim",
      first_name_ar: "محمد",
      last_name_ar: "إبراهيم",
    }, "ar")).toBe("محمد إبراهيم");
    expect(patientDisplayName({
      first_name_en: "Mohamed",
      last_name_en: "Ibrahim",
      first_name_ar: "محمد",
      last_name_ar: "إبراهيم",
    }, "en")).toBe("محمد إبراهيم");
  });

  it("falls back when only one language field is populated", () => {
    expect(patientDisplayName({ first_name_en: "Jane", last_name_en: "Doe" }, "ar")).toBe("Jane Doe");
    expect(patientDisplayName({ first_name_ar: "جنى", last_name_ar: "خطاب" }, "en")).toBe("جنى خطاب");
  });

  it("returns a direction matching the displayed script", () => {
    expect(patientDisplayDirection({ first_name_en: "John", first_name_ar: "John" }, "ar")).toBe("ltr");
    expect(patientDisplayDirection({ first_name_en: "أحمد", first_name_ar: "أحمد" }, "en")).toBe("rtl");
  });
});
