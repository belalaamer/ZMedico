import { createShadowProbe, type LegacyMap } from "./createShadowProbe";

/** Medical Records vertical slice — Shadow Probe (see createShadowProbe.ts). */
export const MEDICAL_RECORDS_KEY_LEGACY_MAP: LegacyMap = Object.freeze({
  "medical_records.view":   { module: "medical_records", action: "view" },
  "medical_records.create": { module: "medical_records", action: "create" },
  "medical_records.edit":   { module: "medical_records", action: "edit" },
  "medical_records.delete": { module: "medical_records", action: "delete" },
  "medical_records.export": { module: "medical_records", action: "export" },
});

const probe = createShadowProbe({
  slice: "medical_records",
  keyLegacyMap: MEDICAL_RECORDS_KEY_LEGACY_MAP,
  probeName: "MedicalRecordsShadowProbe",
});

export const MEDICAL_RECORDS_SHADOW_KEYS = probe.keys;
export const useMedicalRecordsShadowProbe = probe.useProbe;
export const __resetMedicalRecordsShadowProbeForTests = probe.resetForTests;