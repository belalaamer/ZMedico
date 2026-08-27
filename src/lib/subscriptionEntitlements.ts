import { CLINIC_MODULES, type ClinicModuleKey } from "@/lib/clinicModules";

export type PlanFeatures = Readonly<Record<string, boolean>>;

const ALWAYS_INCLUDED_MODULES = new Set<ClinicModuleKey>([
  "dashboard",
  "patients",
  "appointments",
  "medical",
  "invoices",
  "communication",
]);
const PLAN_GATED_MODULE_KEYS = new Set<ClinicModuleKey>([
  "reports",
  "inventory",
  "hr",
  "marketing",
]);

/**
 * An empty feature map represents a legacy/unconfigured plan and preserves
 * the existing fail-open rollout behavior. The operational core is always
 * included; every optional module must be explicitly true in a configured
 * plan so the review screen and runtime gate cannot drift apart.
 */
export function planAllowsModule(key: ClinicModuleKey, planFeatures: PlanFeatures): boolean {
  if (planFeatures[key] === false) return false;
  if (ALWAYS_INCLUDED_MODULES.has(key)) return true;
  if (!PLAN_GATED_MODULE_KEYS.has(key)) return true;
  return Object.keys(planFeatures).length === 0 || planFeatures[key] === true;
}

export function defaultModulesForPlan(planFeatures: PlanFeatures): ClinicModuleKey[] {
  return CLINIC_MODULES.filter((module) => module.alwaysOn || (module.group !== "specialty" && planAllowsModule(module.key, planFeatures))).map((module) => module.key);
}

export function isModuleEnabledForEntitlement(
  key: ClinicModuleKey,
  enabledModules: readonly ClinicModuleKey[],
  planFeatures: PlanFeatures,
): boolean {
  return enabledModules.includes(key) && planAllowsModule(key, planFeatures);
}

export function filterModulesByPlan(
  modules: readonly ClinicModuleKey[],
  planFeatures: PlanFeatures,
): ClinicModuleKey[] {
  return modules.filter((key) => planAllowsModule(key, planFeatures));
}

/**
 * Subscription gating is branch-scoped and must run before role overrides.
 * A missing selected branch is intentionally not blocked because the route
 * guard cannot evaluate tenant entitlements until branch context is ready.
 */
export function shouldBlockRouteForEntitlement(
  key: ClinicModuleKey | null,
  currentBranchId: string | null | undefined,
  isModuleEnabled: (moduleKey: ClinicModuleKey) => boolean,
): boolean {
  return Boolean(key && currentBranchId && !isModuleEnabled(key));
}
