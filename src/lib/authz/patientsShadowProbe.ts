import { createShadowProbe, type LegacyMap } from "./createShadowProbe";

/** Patients vertical slice — Shadow Probe (see createShadowProbe.ts). */
export const PATIENTS_KEY_LEGACY_MAP: LegacyMap = Object.freeze({
  "patients.view":   { module: "patients", action: "view" },
  "patients.create": { module: "patients", action: "create" },
  "patients.edit":   { module: "patients", action: "edit" },
  "patients.delete": { module: "patients", action: "delete" },
  "patients.export": { module: "patients", action: "export" },
});

const probe = createShadowProbe({
  slice: "patients",
  keyLegacyMap: PATIENTS_KEY_LEGACY_MAP,
  probeName: "PatientsShadowProbe",
});

export const PATIENTS_SHADOW_KEYS = probe.keys;
export const usePatientsShadowProbe = probe.useProbe;
export const __resetPatientsShadowProbeForTests = probe.resetForTests;