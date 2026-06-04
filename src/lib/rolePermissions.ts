export const ROLES = ["admin", "manager", "doctor", "nurse", "receptionist", "accountant", "hr", "staff"] as const;
export const MODULES = ["patients", "appointments", "medical_records", "treatment_plans", "invoices", "treasury", "inventory", "reports", "hr", "settings"] as const;
export const ACTIONS = ["view", "create", "edit", "delete", "export"] as const;

export type RoleName = typeof ROLES[number] | string;
export type ModuleName = typeof MODULES[number] | string;

const ALL = [...ACTIONS] as string[];

export const DEFAULT_PERMISSIONS: Record<string, Record<string, string[]>> = {
  admin: Object.fromEntries(MODULES.map(m => [m, [...ALL]])),
  manager: Object.fromEntries(MODULES.map(m => [m, ["view","create","edit","export"]])),
  doctor: {
    patients: ["view","edit"],
    appointments: ["view","create","edit"],
    medical_records: ["view","create","edit"],
    treatment_plans: ["view","create","edit"],
    invoices: ["view"], // read-only billing
    treasury: [],
    inventory: [],
    reports: ["view"],
    hr: [],
    settings: [],
  },
  nurse: {
    // Vitals, patient lists, specific medical logs. No delete on billing/records.
    patients: ["view"],
    appointments: ["view","create","edit"],
    medical_records: ["view","create","edit"],
    treatment_plans: ["view","edit"],
    invoices: ["view"],
    treasury: [],
    inventory: ["view"],
    reports: [],
    hr: [],
    settings: [],
  },
  receptionist: {
    // Calendar, patient registration, invoices. No clinical notes/medical history.
    patients: ["view","create","edit"],
    appointments: ["view","create","edit","delete"],
    medical_records: [],
    treatment_plans: ["view"],
    invoices: ["view","create","edit"],
    treasury: [],
    inventory: [],
    reports: [],
    hr: [],
    settings: [],
  },
  accountant: {
    // Invoices, payments, expenses. No medical records.
    patients: ["view"],
    appointments: ["view"],
    medical_records: [],
    treatment_plans: ["view"],
    invoices: ["view","create","edit","delete","export"],
    treasury: ["view","create","edit","export"],
    inventory: ["view"],
    reports: ["view","export"],
    hr: [],
    settings: [],
  },
  hr: {
    patients: [], appointments: [], medical_records: [], treatment_plans: [], invoices: [], treasury: [],
    inventory: [], reports: ["view"], hr: ["view","create","edit","export"], settings: [],
  },
  staff: {
    patients: [], appointments: ["view"], medical_records: [], treatment_plans: [], invoices: [], treasury: [],
    inventory: [], reports: [], hr: [], settings: [],
  },
};

export function defaultActionsFor(role: string, module: string): string[] {
  return DEFAULT_PERMISSIONS[role]?.[module] ?? [];
}

// Map route path prefixes to permission modules. Used by PermissionRoute.
export function moduleForPath(path: string): string | null {
  if (path.startsWith("/calendar") || path.startsWith("/reminders")) return "appointments";
  if (path.startsWith("/patients")) return "patients";
  if (path.startsWith("/invoices") || path.startsWith("/payments")) return "invoices";
  if (path.startsWith("/treasury") || path.startsWith("/expenses")) return "treasury";
  if (path.startsWith("/inventory")) return "inventory";
  if (path.startsWith("/medical")) return "medical_records";
  if (path.startsWith("/hr")) return "hr";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/settings") || path.startsWith("/branches")) return "settings";
  return null;
}
