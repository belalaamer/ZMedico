import { createShadowProbe, type LegacyMap } from "./createShadowProbe";

/** Settings vertical slice — Shadow Probe (see createShadowProbe.ts). */
export const SETTINGS_KEY_LEGACY_MAP: LegacyMap = Object.freeze({
  "settings.org.update":          { module: "settings", action: "edit" },
  "settings.branch.update":       { module: "settings", action: "edit" },
  "settings.pricing.update":      { module: "settings", action: "edit" },
  "settings.catalog.update":      { module: "settings", action: "edit" },
  "settings.integrations.manage": { module: "settings", action: "edit" },
});

const probe = createShadowProbe({
  slice: "settings",
  keyLegacyMap: SETTINGS_KEY_LEGACY_MAP,
  probeName: "SettingsShadowProbe",
});

export const SETTINGS_SHADOW_KEYS = probe.keys;
export const useSettingsShadowProbe = probe.useProbe;
export const __resetSettingsShadowProbeForTests = probe.resetForTests;