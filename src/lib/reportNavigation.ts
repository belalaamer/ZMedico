export type ReportNavigationKey =
  | "financial"
  | "operational"
  | "medical"
  | "hr"
  | "inventory"
  | "scheduled"
  | "commissions"
  | "doctorPerformance";

export type ReportNavigationItem = {
  key: ReportNavigationKey;
  to: string;
  permission: string;
};

/**
 * Report destinations and their canonical view permissions.
 * Keep this list aligned with moduleForPath() in rolePermissions.ts.
 */
export const REPORT_NAVIGATION: readonly ReportNavigationItem[] = [
  { key: "financial", to: "/reports/financial", permission: "reports_finance.view" },
  { key: "operational", to: "/reports/operational", permission: "reports_operational.view" },
  { key: "medical", to: "/reports/medical", permission: "reports_medical.view" },
  { key: "hr", to: "/reports/hr", permission: "reports_hr.view" },
  { key: "inventory", to: "/reports/inventory", permission: "reports_inventory.view" },
  { key: "scheduled", to: "/reports/scheduled", permission: "reports.view" },
  { key: "commissions", to: "/reports/commissions", permission: "reports_medical.view" },
  { key: "doctorPerformance", to: "/reports/doctor-performance", permission: "reports_medical.view" },
];

export function visibleReportNavigation(can: (permission: string) => boolean): ReportNavigationItem[] {
  return REPORT_NAVIGATION.filter((item) => can(item.permission));
}
