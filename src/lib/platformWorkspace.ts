export const PLATFORM_WORKSPACE_HANDOFF_KEY = "zmedico.platform.workspace.branch";

export function getPlatformWorkspaceBranch(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PLATFORM_WORKSPACE_HANDOFF_KEY);
}

export function setPlatformWorkspaceBranch(branchId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PLATFORM_WORKSPACE_HANDOFF_KEY, branchId);
}

export function clearPlatformWorkspaceBranch(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PLATFORM_WORKSPACE_HANDOFF_KEY);
}

export function isSystemOwnerWorkspaceHandoff(
  isSystemOwner: boolean,
  pathname: string,
  currentBranchId: string | null,
): boolean {
  if (!isSystemOwner || pathname.startsWith("/platform") || !currentBranchId) return false;
  return getPlatformWorkspaceBranch() === currentBranchId;
}
