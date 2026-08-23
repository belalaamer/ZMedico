import { describe, expect, it } from "vitest";
import { roleLabel } from "./roleLabels";

describe("role labels", () => {
  it("distinguishes platform and clinic administration", () => {
    expect(roleLabel("system_owner", "ar")).toBe("مسؤول المنصة");
    expect(roleLabel("admin", "ar")).toBe("مسؤول العيادة");
    expect(roleLabel("system_owner", "en")).toBe("System Owner");
    expect(roleLabel("admin", "en")).toBe("Clinic Admin");
  });

  it("keeps unknown roles visible instead of silently relabeling them", () => {
    expect(roleLabel("future_role", "en")).toBe("future_role");
  });
});
