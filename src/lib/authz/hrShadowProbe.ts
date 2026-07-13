import { createShadowProbe, type LegacyMap } from "./createShadowProbe";

/** HR vertical slice — Shadow Probe (see createShadowProbe.ts). */
export const HR_KEY_LEGACY_MAP: LegacyMap = Object.freeze({
  "hr.view":   { module: "hr", action: "view" },
  "hr.create": { module: "hr", action: "create" },
  "hr.edit":   { module: "hr", action: "edit" },
  "hr.delete": { module: "hr", action: "delete" },
  "hr.export": { module: "hr", action: "export" },
});

const probe = createShadowProbe({
  slice: "hr",
  keyLegacyMap: HR_KEY_LEGACY_MAP,
  probeName: "HrShadowProbe",
});

export const HR_SHADOW_KEYS = probe.keys;
export const useHrShadowProbe = probe.useProbe;
export const __resetHrShadowProbeForTests = probe.resetForTests;