import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import MedicalRecords from "./MedicalRecords";

const m = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  listRows: [] as unknown[],
  writeRows: [] as unknown[],
  writeError: null as null | { message: string },
  writeAskedForRows: false,
  reads: 0,
  writes: 0,
}));

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (s: string) => s, lang: "en" }) }));
vi.mock("@/contexts/BranchContext", () => ({ useBranch: () => ({ currentBranchId: "branch-a", branchSelectionReady: true }) }));
vi.mock("@/components/Can", () => ({ Can: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/lib/authz/useAuthorization", () => ({ useAuthorization: () => ({ authz: { can: () => true } }) }));
vi.mock("sonner", () => ({ toast: { error: m.error, success: m.success, message: vi.fn() } }));
// The confirm dialog is Radix-owned; this test is about what the page does with
// the write response, so the row menu is reduced to the one control it fires.
vi.mock("@/components/RowActions", () => ({
  RowActions: ({ onDelete, canDelete }: { onDelete?: () => void; canDelete?: boolean }) =>
    canDelete ? <button onClick={onDelete}>stub-delete</button> : null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let wrote = false;
      const chain: Record<string, unknown> = {
        update: () => { wrote = true; m.writes += 1; return chain; },
        delete: () => { wrote = true; m.writes += 1; return chain; },
        insert: () => { wrote = true; m.writes += 1; return chain; },
        select: () => { if (wrote) m.writeAskedForRows = true; return chain; },
        eq: () => chain,
        is: () => chain,
        not: () => chain,
        order: () => chain,
        range: () => chain,
        limit: () => chain,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(wrote
            ? { data: m.writeRows, error: m.writeError }
            : (m.reads += 1, { data: m.listRows, count: m.listRows.length })).then(resolve),
      };
      return chain;
    },
  },
}));

const record = {
  id: "rec-1",
  branch_id: "branch-a",
  visit_date: "2026-10-01",
  visit_type: "walk_in",
  status: "completed",
  patients: { patient_code: "P-1", first_name_en: "Salma", last_name_en: "Kamal", first_name_ar: "سلمى", last_name_ar: "كمال", name_language: "en" },
};

async function openWithOneRecord() {
  render(<MemoryRouter><MedicalRecords /></MemoryRouter>);
  const button = await screen.findByRole("button", { name: "stub-delete" });
  return { readsBefore: m.reads, button };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.listRows = [record];
  m.writeRows = [];
  m.writeError = null;
  m.writeAskedForRows = false;
  m.reads = 0;
  m.writes = 0;
});

afterEach(() => { cleanup(); });

describe("Medical Records soft delete — rec_update_clinical filters, PostgREST does not error", () => {
  it("refuses to report a zero-row delete as success and re-reads the list", async () => {
    const { readsBefore, button } = await openWithOneRecord();
    fireEvent.click(button);
    await waitFor(() => expect(m.error).toHaveBeenCalledTimes(1));
    expect(m.success).not.toHaveBeenCalled();
    expect(m.writeAskedForRows).toBe(true);
    expect(String(m.error.mock.calls[0][0])).toMatch(/Nothing was deleted/);
    // The screen must not keep showing the record it just promised to remove.
    await waitFor(() => expect(m.reads).toBeGreaterThan(readsBefore));
  });

  it("still reports success when the guarded update returns the row", async () => {
    m.writeRows = [{ id: "rec-1" }];
    const { button } = await openWithOneRecord();
    fireEvent.click(button);
    await waitFor(() => expect(m.success).toHaveBeenCalledTimes(1));
    expect(m.error).not.toHaveBeenCalled();
  });

  it("keeps a real database error on the error path", async () => {
    m.writeError = { message: "private policy detail" };
    const { button } = await openWithOneRecord();
    fireEvent.click(button);
    await waitFor(() => expect(m.error).toHaveBeenCalledTimes(1));
    expect(m.success).not.toHaveBeenCalled();
    expect(String(m.error.mock.calls[0][0])).toBe("private policy detail");
  });

  it("blocks a record from another branch before it ever writes", async () => {
    m.listRows = [{ ...record, branch_id: "branch-b" }];
    const { button } = await openWithOneRecord();
    fireEvent.click(button);
    await waitFor(() => expect(m.error).toHaveBeenCalledTimes(1));
    expect(m.writes).toBe(0);
    expect(m.success).not.toHaveBeenCalled();
  });
});
