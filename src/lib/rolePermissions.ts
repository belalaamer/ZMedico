export const ROLES = ["admin", "manager", "doctor", "nurse", "receptionist", "accountant", "hr", "staff"] as const;
export const MODULES = ["patients", "appointments", "medical_records", "invoices", "treasury", "inventory", "reports", "hr", "settings"] as const;
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
    invoices: ["view"],
    treasury: [],
    inventory: ["view"],
    reports: ["view"],
    hr: [],
    settings: [],
  },
  nurse: {
    patients: ["view"], appointments: ["view"], medical_records: ["view"],
    invoices: [], treasury: [], inventory: ["view"], reports: [], hr: [], settings: [],
  },
  receptionist: {
    patients: ["view","create","edit"], appointments: ["view","create","edit"],
    medical_records: [], invoices: ["view","create"], treasury: [], inventory: [],
    reports: [], hr: [], settings: [],
  },
  accountant: {
    patients: ["view"], appointments: ["view"], medical_records: [],
    invoices: ["view","create","edit","export"], treasury: ["view","create","edit"],
    inventory: ["view"], reports: ["view","export"], hr: [], settings: [],
  },
  hr: {
    patients: [], appointments: [], medical_records: [], invoices: [], treasury: [],
    inventory: [], reports: ["view"], hr: ["view","create","edit","export"], settings: [],
  },
  staff: {
    patients: [], appointments: ["view"], medical_records: [], invoices: [], treasury: [],
    inventory: [], reports: [], hr: [], settings: [],
  },
};

export function defaultActionsFor(role: string, module: string): string[] {
  return DEFAULT_PERMISSIONS[role]?.[module] ?? [];
}
