import { describe, expect, it } from "vitest";
import { enumLabel } from "./enumLabels";

describe("enum labels", () => {
  it("gives the Arabic desk a word instead of the stored value", () => {
    expect(enumLabel("appointment_status", "in_progress", "ar")).toBe("جارٍ");
    expect(enumLabel("document_type", "ct_scan", "ar")).toBe("أشعة مقطعية");
    expect(enumLabel("visit_type", "follow_up", "ar")).toBe("متابعة");
  });

  it("leaves the English desk on the stored value", () => {
    expect(enumLabel("appointment_status", "in_progress", "en")).toBe("in_progress");
    expect(enumLabel("document_type", "ct_scan", "en")).toBe("ct_scan");
  });

  it("reuses the words the physio screens already shipped", () => {
    // PhysioCaseDetail.bilingual.test.tsx asserts these on the rendered page;
    // moving the maps into this module must not have changed a byte of them.
    expect(enumLabel("physio_case_status", "active", "ar")).toBe("نشطة");
    expect(enumLabel("physio_attendance", "missed", "ar")).toBe("لم تحضر");
    expect(enumLabel("physio_trend", "worsening", "ar")).toBe("في تدهور");
    expect(enumLabel("appointment_status", "departed", "ar")).toBe("غادر");
  });

  it("agrees with the noun it describes rather than repeating one word", () => {
    // موظف is masculine, حالة is feminine: same stored value, two correct words.
    expect(enumLabel("staff_status", "active", "ar")).toBe("نشط");
    expect(enumLabel("physio_case_status", "active", "ar")).toBe("نشطة");
  });

  it("shows a dash for a missing value and the value itself for an unknown one", () => {
    expect(enumLabel("invoice_status", null, "ar")).toBe("—");
    expect(enumLabel("invoice_status", undefined, "ar")).toBe("—");
    expect(enumLabel("invoice_status", "", "ar")).toBe("—");
    expect(enumLabel("invoice_status", "refunded", "ar")).toBe("refunded");
  });
});
