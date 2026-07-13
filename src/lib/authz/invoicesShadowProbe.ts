import { createShadowProbe, type LegacyMap } from "./createShadowProbe";

/** Invoices vertical slice — Shadow Probe (see createShadowProbe.ts). */
export const INVOICES_KEY_LEGACY_MAP: LegacyMap = Object.freeze({
  "invoices.view":   { module: "invoices", action: "view" },
  "invoices.create": { module: "invoices", action: "create" },
  "invoices.edit":   { module: "invoices", action: "edit" },
  "invoices.delete": { module: "invoices", action: "delete" },
  "invoices.export": { module: "invoices", action: "export" },
});

const probe = createShadowProbe({
  slice: "invoices",
  keyLegacyMap: INVOICES_KEY_LEGACY_MAP,
  probeName: "InvoicesShadowProbe",
});

export const INVOICES_SHADOW_KEYS = probe.keys;
export const useInvoicesShadowProbe = probe.useProbe;
export const __resetInvoicesShadowProbeForTests = probe.resetForTests;