import { describe, expect, it } from "vitest";
import {
  deepLinkBanner,
  deepLinkPatientId,
  deepLinkPickerLabel,
  patientDeepLinkId,
  withoutPatientParam,
  type DeepLinkedPatient,
} from "./calendarPatientDeepLink";

const ID = "3f2a1b0c-9d8e-4f70-a1b2-c3d4e5f60718";

const ready: DeepLinkedPatient = { id: ID, name: "Salma Adel", lookupFailed: false };
const notFound: DeepLinkedPatient = { id: ID, name: null, lookupFailed: false };
const failed: DeepLinkedPatient = { id: ID, name: null, lookupFailed: true };

describe("patientDeepLinkId", () => {
  it("accepts a well-formed uuid and nothing else", () => {
    expect(patientDeepLinkId(ID)).toBe(ID);
    expect(patientDeepLinkId(` ${ID} `)).toBe(ID);
  });

  it("refuses values that must not reach the database as a filter", () => {
    for (const raw of [null, undefined, "", "   ", "1", "not-a-uuid", `${ID}tail`, "3f2a1b0c-9d8e-4f70-a1b2-c3d4e5f6071g"]) {
      expect(patientDeepLinkId(raw)).toBeNull();
    }
  });
});

describe("deepLinkPatientId", () => {
  it("only prefills a patient that was actually resolved", () => {
    expect(deepLinkPatientId(ready)).toBe(ID);
    expect(deepLinkPatientId(notFound)).toBe("");
    expect(deepLinkPatientId(failed)).toBe("");
    expect(deepLinkPatientId(null)).toBe("");
  });
});

describe("deepLinkPickerLabel", () => {
  const options = [{ id: "other", label: "Other Patient" }];

  it("prefers the loaded option list", () => {
    expect(deepLinkPickerLabel([{ id: ID, label: "From list" }], ID, ready)).toBe("From list");
  });

  it("falls back to the deep-linked row, because the 200-patient list may not contain it", () => {
    expect(deepLinkPickerLabel(options, ID, ready)).toBe("Salma Adel");
  });

  it("keeps the old dash when there is genuinely nothing to show", () => {
    expect(deepLinkPickerLabel(options, ID, null)).toBe("—");
  });
});

describe("withoutPatientParam", () => {
  it("drops only patient_id", () => {
    const params = new URLSearchParams(`patient_id=${ID}&date=2026-10-26&branch=b1`);
    const next = withoutPatientParam(params);
    expect(next.toString()).toBe("date=2026-10-26&branch=b1");
    expect(params.get("patient_id")).toBe(ID);
  });
});

describe("deepLinkBanner", () => {
  it("says nothing when no patient was linked", () => {
    expect(deepLinkBanner("en", null)).toBeNull();
  });

  it("names the patient in both languages and offers the booking", () => {
    expect(deepLinkBanner("en", ready)?.action).toBe("New appointment for Salma Adel");
    expect(deepLinkBanner("ar", { ...ready, name: "سلمى عادل" })?.title).toContain("سلمى عادل");
  });

  it("keeps a refused lookup apart from an absent patient", () => {
    const missing = deepLinkBanner("en", notFound);
    const failure = deepLinkBanner("en", failed);
    expect(missing?.title).toBe("This patient is not bookable here");
    expect(failure?.title).toBe("This booking link could not be checked");
    expect(failure?.detail).not.toBe(missing?.detail);
  });
});
