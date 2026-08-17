import { describe, expect, it } from "vitest";
import { doctorDisplayName } from "./doctorName";

describe("doctorDisplayName", () => {
  const doctor = {
    full_name: "Dr. Mohamed Ibrahim",
    full_name_en: "Dr. Mohamed Ibrahim",
    full_name_ar: "د. محمد إبراهيم",
  };

  it("uses the English doctor name in English UI", () => {
    expect(doctorDisplayName(doctor, "en")).toBe("Dr. Mohamed Ibrahim");
  });

  it("uses the Arabic doctor name in Arabic UI", () => {
    expect(doctorDisplayName(doctor, "ar")).toBe("د. محمد إبراهيم");
  });

  it("rejects a localized field whose script is wrong for the UI", () => {
    expect(doctorDisplayName({ full_name_en: "Dr. محمد A", full_name_ar: "د. محمد" }, "en")).toBe("د. محمد");
    expect(doctorDisplayName({ full_name_en: "Dr. Mohamed", full_name_ar: "د. محمد A" }, "ar")).toBe("Dr. Mohamed");
  });

  it("falls back to the legacy profile name when localized fields are absent", () => {
    expect(doctorDisplayName({ full_name: "Dr. Smith" }, "ar")).toBe("Dr. Smith");
    expect(doctorDisplayName({ full_name: "د. سمير" }, "en")).toBe("د. سمير");
  });
});
