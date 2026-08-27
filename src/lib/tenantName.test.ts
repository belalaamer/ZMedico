import { localizedTenantName } from "./tenantName";

describe("localized tenant names", () => {
  it("prefers the Arabic name for Arabic UI", () => {
    expect(localizedTenantName({ name_en: "Blitz Physio", name_ar: "بليتز فيزيو" }, "ar")).toBe("بليتز فيزيو");
  });

  it("prefers the English name for English UI", () => {
    expect(localizedTenantName({ name_en: "Blitz Physio", name_ar: "بليتز فيزيو" }, "en")).toBe("Blitz Physio");
  });

  it("falls back to the alternate language when the preferred name is missing", () => {
    expect(localizedTenantName({ name_en: "Blitz Physio" }, "ar")).toBe("Blitz Physio");
    expect(localizedTenantName({ name_ar: "بليتز فيزيو" }, "en")).toBe("بليتز فيزيو");
  });

  it("uses a custom display name before localized tenant names", () => {
    expect(localizedTenantName({ display_name: "Blitz Care", name_en: "Blitz Physio", name_ar: "بليتز فيزيو" }, "ar")).toBe("Blitz Care");
  });

  it("uses the fallback when no name is available", () => {
    expect(localizedTenantName(null, "en", "Clinic")).toBe("Clinic");
  });
});
