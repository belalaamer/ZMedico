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
  path: string,
  currentBranchId: string | null,
): boolean {
  const [pathname, search = ""] = path.split("?", 2);
  if (!isSystemOwner || pathname.startsWith("/platform")) return false;
  const handoffBranchId = getPlatformWorkspaceBranch();
  if (!handoffBranchId) return false;
  const queryBranchId = new URLSearchParams(search).get("branch");
  const effectiveBranchId = currentBranchId ?? queryBranchId;
  return effectiveBranchId === handoffBranchId;
}
