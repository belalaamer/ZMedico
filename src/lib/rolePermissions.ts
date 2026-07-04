export const ROLES = ["admin", "manager", "doctor", "nurse", "receptionist", "accountant", "hr", "staff"] as const;
export const MODULES = [
  "patients",
  "appointments",
  "medical_records",
  "vitals",
  "treatment_plans",
  "invoices",
  "treasury",
  "inventory",
  "reports",
  "reports_finance",
  "reports_medical",
  "reports_operational",
  "reports_hr",
  "reports_inventory",
  "hr",
  "settings",
  "coupons",
] as const;
export const ACTIONS = ["view", "create", "edit", "delete", "export"] as const;

export type RoleName = typeof ROLES[number] | string;
export type ModuleName = typeof MODULES[number] | string;

const ALL = [...ACTIONS] as string[];

export const DEFAULT_PERMISSIONS: Record<string, Record<string, string[]>> = {
  admin: Object.fromEntries(MODULES.map(m => [m, [...ALL]])),
  // Manager: operational oversight — no clinical writes, treasury read/export only.
  manager: {
    patients: ["view","create","edit","export"],
    appointments: ["view","create","edit","export"],
    medical_records: ["view"],
    vitals: ["view"],
    treatment_plans: ["view"],
    invoices: ["view","create","edit","export"],
    treasury: ["view","export"],
    inventory: ["view","create","edit","export"],
    reports: ["view","export"],
    reports_finance: ["view","export"],
    reports_medical: ["view","export"],
    reports_operational: ["view","export"],
    reports_hr: [],
    reports_inventory: ["view","export"],
    hr: ["view"],
    settings: ["view"],
    coupons: ["view","create","edit","export"],
  },
  doctor: {
    patients: ["view"],
    appointments: ["view","create","edit"],
    medical_records: ["view","create","edit"],
    vitals: ["view","create","edit"],
    treatment_plans: ["view","create","edit"],
    invoices: ["view"],
    reports: ["view"],
    reports_medical: ["view"],
    reports_operational: ["view"],
    reports_finance: [],
    reports_hr: [],
    reports_inventory: [],
  },
  nurse: {
    patients: ["view"],
    appointments: ["view","create","edit"],
    medical_records: ["view"],
    vitals: ["view","create","edit"],
    treatment_plans: ["view"],
    inventory: ["view"],
  },
  receptionist: {
    patients: ["view","create","edit"],
    appointments: ["view","create","edit","delete"],
    invoices: ["view","create"],
    coupons: ["view"],
  },
  accountant: {
    patients: ["view"],
    appointments: ["view"],
    invoices: ["view","create","edit","export"],
    treasury: ["view","create","edit","export"],
    inventory: ["view"],
    reports: ["view","export"],
    reports_finance: ["view","export"],
    reports_inventory: ["view","export"],
    reports_operational: ["view","export"],
    reports_medical: [],
    reports_hr: [],
    coupons: ["view","export"],
  },
  hr: {
    reports: ["view"],
    reports_hr: ["view","export"],
    hr: ["view","create","edit","export"],
  },
  staff: {
    appointments: ["view"],
  },
};

export function defaultActionsFor(role: string, module: string): string[] {
  return DEFAULT_PERMISSIONS[role]?.[module] ?? [];
}

// Map route path prefixes to permission modules. Used by PermissionRoute.
export function moduleForPath(path: string): string | null {
  if (path.startsWith("/calendar") || path.startsWith("/reminders")) return "appointments";
  if (path.startsWith("/queue")) return "appointments";
  if (path.startsWith("/physio")) return "medical_records";
  if (path.startsWith("/patients")) return "patients";
  if (path.startsWith("/invoices") || path.startsWith("/payments")) return "invoices";
  if (path.startsWith("/treasury") || path.startsWith("/expenses")) return "treasury";
  if (path.startsWith("/coupons")) return "coupons";
  if (path.startsWith("/inventory")) return "inventory";
  if (path.startsWith("/medical")) return "medical_records";
  if (path.startsWith("/hr")) return "hr";
  if (path.startsWith("/reports/financial")) return "reports_finance";
  if (path.startsWith("/reports/medical")) return "reports_medical";
  if (path.startsWith("/reports/operational")) return "reports_operational";
  if (path.startsWith("/reports/hr")) return "reports_hr";
  if (path.startsWith("/reports/inventory")) return "reports_inventory";
  if (path.startsWith("/reports/commissions") || path.startsWith("/reports/doctor-performance")) return "reports_medical";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/settings") || path.startsWith("/branches")) return "settings";
  if (path.startsWith("/pricing")) return "settings";
  return null;
}
