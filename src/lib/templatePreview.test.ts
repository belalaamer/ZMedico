import { describe, expect, it } from "vitest";
import { templatePreview } from "./templatePreview";

describe("templatePreview", () => {
  it("uses Arabic demo values", () => expect(templatePreview("مرحبًا {{ patient_name }}", "ar").text).toBe("مرحبًا مريض تجريبي"));
  it("uses English demo values", () => expect(templatePreview("Hello {{patient_name}}", "en").text).toBe("Hello Demo patient"));
  it("preserves unknown variables and deduplicates warnings", () => expect(templatePreview("{{x}} {{x}}", "en")).toEqual({ text: "{{x}} {{x}}", unknown: ["x"] }));
  it("does not resolve prototype properties", () => expect(templatePreview("{{constructor}}", "ar").unknown).toEqual(["constructor"]));
  it("keeps HTML as plain text", () => expect(templatePreview("<script>alert(1)</script>", "en").text).toBe("<script>alert(1)</script>"));
  it("supports empty text", () => expect(templatePreview("", "ar")).toEqual({ text: "", unknown: [] }));
});
