import type { ClinicModuleKey } from "@/lib/clinicModules";

export type PlanFeatures = Readonly<Record<string, boolean>>;

/**
 * An empty feature map represents a legacy/unconfigured plan and preserves
 * the existing fail-open rollout behavior. An explicit false always denies.
 */
export function planAllowsModule(key: ClinicModuleKey, planFeatures: PlanFeatures): boolean {
  return Object.keys(planFeatures).length === 0 || planFeatures[key] !== false;
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
