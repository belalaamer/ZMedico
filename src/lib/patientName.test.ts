import { describe, expect, it } from "vitest";
import { patientDisplayDirection, patientDisplayName } from "./patientName";

describe("patientDisplayName", () => {
  it("uses the English pair in English UI when both language pairs exist", () => {
    expect(patientDisplayName({
      first_name_en: "Mohamed",
      last_name_en: "Ibrahim",
      first_name_ar: "محمد",
      last_name_ar: "إبراهيم",
    }, "en")).toBe("Mohamed Ibrahim");
  });

  it("uses the Arabic pair in Arabic UI when both language pairs exist", () => {
    expect(patientDisplayName({
      first_name_en: "Mohamed",
      last_name_en: "Ibrahim",
      first_name_ar: "محمد",
      last_name_ar: "إبراهيم",
    }, "ar")).toBe("محمد إبراهيم");
  });

  it("does not mix an English last-name initial into an Arabic display", () => {
    expect(patientDisplayName({
      first_name_en: "إنجي سمير جريزي",
      last_name_en: "S",
      first_name_ar: "إنجي سمير جريزي",
      last_name_ar: null,
    }, "ar")).toBe("إنجي سمير جريزي");
  });

  it("drops a mismatched Arabic last-name component instead of mixing scripts", () => {
    expect(patientDisplayName({ first_name_ar: "محمد", last_name_ar: "A" }, "ar")).toBe("محمد");
  });

  it("drops a mismatched English last-name component instead of mixing scripts", () => {
    expect(patientDisplayName({ first_name_en: "Mohamed", last_name_en: "ع" }, "en")).toBe("Mohamed");
  });

  it("repairs a legacy row whose bilingual columns were populated in reverse", () => {
    expect(patientDisplayName({
      first_name_en: "أحمد",
      last_name_en: "علي",
      first_name_ar: "Ahmed",
      last_name_ar: "Ali",
    }, "en")).toBe("Ahmed Ali");
    expect(patientDisplayName({
      first_name_en: "أحمد",
      last_name_en: "علي",
      first_name_ar: "Ahmed",
      last_name_ar: "Ali",
    }, "ar")).toBe("أحمد علي");
  });

  it("falls back to a complete pair when only one language field is populated", () => {
    expect(patientDisplayName({ first_name_en: "Jane", last_name_en: "Doe" }, "ar")).toBe("Jane Doe");
    expect(patientDisplayName({ first_name_ar: "جنى", last_name_ar: "خطاب" }, "en")).toBe("جنى خطاب");
  });

  it("returns a direction matching the displayed script", () => {
    expect(patientDisplayDirection({ first_name_en: "John", first_name_ar: "John" }, "en")).toBe("ltr");
    expect(patientDisplayDirection({ first_name_en: "أحمد", first_name_ar: "أحمد" }, "en")).toBe("rtl");
    expect(patientDisplayDirection({ first_name_en: "Mohamed", first_name_ar: "محمد" }, "ar")).toBe("rtl");
  });
});
