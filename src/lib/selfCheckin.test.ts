import { describe, expect, it } from "vitest";
import {
  getSelfCheckinToken,
  isValidSelfCheckinToken,
  localizedBranchName,
  localizedClinicName,
  mapSelfCheckinDetailsState,
  mapSelfCheckinResultState,
} from "./selfCheckin";

const validToken = "A".repeat(64);

const baseDetails = {
  valid: true,
  status: "scheduled",
  tenant_name_en: "Blitz Physio",
  tenant_name_ar: "بلتز فيزيو",
  branch_name_en: "Main branch",
  branch_name_ar: "الفرع الرئيسي",
  scheduled_at: "2026-08-24T10:00:00.000Z",
  procedure_name: null,
  expires_at: "2026-08-24T13:00:00.000Z",
};

describe("selfCheckin helpers", () => {
  it("accepts only a 64-character hexadecimal token", () => {
    expect(isValidSelfCheckinToken(validToken)).toBe(true);
    expect(isValidSelfCheckinToken("a".repeat(63))).toBe(false);
    expect(isValidSelfCheckinToken("g".repeat(64))).toBe(false);
    expect(isValidSelfCheckinToken(null)).toBe(false);
  });

  it("extracts and normalizes a token from a query string or URL", () => {
    expect(getSelfCheckinToken(`?token=${validToken}`)).toBe(validToken.toLowerCase());
    expect(getSelfCheckinToken(`https://clinic.example/check-in?token=${validToken}`)).toBe(validToken.toLowerCase());
    expect(getSelfCheckinToken("?token=not-a-token")).toBeNull();
    expect(getSelfCheckinToken("?foo=bar")).toBeNull();
  });

  it("maps public details to ready, closed, or invalid", () => {
    expect(mapSelfCheckinDetailsState(baseDetails)).toBe("ready");
    expect(mapSelfCheckinDetailsState({ ...baseDetails, status: "confirmed" })).toBe("ready");
    expect(mapSelfCheckinDetailsState({ ...baseDetails, status: "completed" })).toBe("closed");
    expect(mapSelfCheckinDetailsState({ valid: false })).toBe("invalid");
  });

  it("maps mutation outcomes without treating failures as success", () => {
    expect(mapSelfCheckinResultState({ success: true, state: "checked_in" })).toBe("success");
    expect(mapSelfCheckinResultState({ success: false, state: "closed" })).toBe("closed");
    expect(mapSelfCheckinResultState({ success: false, state: "invalid" })).toBe("invalid");
    expect(mapSelfCheckinResultState(null, true)).toBe("error");
    expect(mapSelfCheckinResultState({ success: false, state: null })).toBe("error");
  });

  it("uses the requested language and falls back safely", () => {
    expect(localizedClinicName(baseDetails, "en")).toBe("Blitz Physio");
    expect(localizedClinicName(baseDetails, "ar")).toBe("بلتز فيزيو");
    expect(localizedBranchName(baseDetails, "en")).toBe("Main branch");
    expect(localizedBranchName(baseDetails, "ar")).toBe("الفرع الرئيسي");
    expect(localizedClinicName({ tenant_name_en: null, tenant_name_ar: null }, "en")).toBe("ZMedico");
  });
});
