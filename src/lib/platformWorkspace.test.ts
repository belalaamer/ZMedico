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
});
