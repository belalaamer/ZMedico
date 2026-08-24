export const PLATFORM_WORKSPACE_HANDOFF_KEY = "zmedico.platform.workspace.branch";

export function getPlatformWorkspaceBranch(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(PLATFORM_WORKSPACE_HANDOFF_KEY);
  } catch {
    return null;
  }
}

export function setPlatformWorkspaceBranch(branchId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PLATFORM_WORKSPACE_HANDOFF_KEY, branchId);
  } catch {
    // The URL fallback keeps an explicit workspace handoff usable when storage is blocked.
  }
}

export function clearPlatformWorkspaceBranch(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PLATFORM_WORKSPACE_HANDOFF_KEY);
  } catch {
    // Ignore blocked storage during a normal return to Platform Console.
  }
}

export function isSystemOwnerWorkspaceHandoff(
  isSystemOwner: boolean,
  path: string,
  currentBranchId: string | null,
): boolean {
  const [pathname, search = ""] = path.split("?", 2);
  if (!isSystemOwner || pathname.startsWith("/platform")) return false;
  const queryBranchId = new URLSearchParams(search).get("branch");
  const handoffBranchId = getPlatformWorkspaceBranch() ?? queryBranchId;
  if (!handoffBranchId) return false;
  const effectiveBranchId = currentBranchId ?? queryBranchId;
  return effectiveBranchId === handoffBranchId;
}
