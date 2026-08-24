import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPlatformWorkspaceBranch,
  isSystemOwnerWorkspaceHandoff,
  setPlatformWorkspaceBranch,
} from "./platformWorkspace";

describe("platform workspace handoff", () => {
  beforeEach(() => {
    clearPlatformWorkspaceBranch();
  });

  it("denies a system owner entering workspace without an explicit handoff", () => {
    expect(isSystemOwnerWorkspaceHandoff(true, "/workspace", "branch-1")).toBe(false);
  });

  it("allows only the branch explicitly opened from Platform Console", () => {
    setPlatformWorkspaceBranch("branch-1");
    expect(isSystemOwnerWorkspaceHandoff(true, "/workspace", "branch-1")).toBe(true);
    expect(isSystemOwnerWorkspaceHandoff(true, "/workspace", "branch-2")).toBe(false);
    expect(isSystemOwnerWorkspaceHandoff(true, "/platform", "branch-1")).toBe(false);
    expect(isSystemOwnerWorkspaceHandoff(false, "/workspace", "branch-1")).toBe(false);
  });

  it("uses the branch query while the BranchContext selection is still loading", () => {
    setPlatformWorkspaceBranch("branch-1");
    expect(isSystemOwnerWorkspaceHandoff(true, "/workspace?branch=branch-1", null)).toBe(true);
    expect(isSystemOwnerWorkspaceHandoff(true, "/workspace?branch=branch-2", null)).toBe(false);
  });

  it("falls back to an explicit branch query without a stored handoff", () => {
    expect(isSystemOwnerWorkspaceHandoff(true, "/workspace?branch=branch-1", null)).toBe(true);
    expect(isSystemOwnerWorkspaceHandoff(true, "/workspace?branch=branch-1", "branch-1")).toBe(true);
  });
});
