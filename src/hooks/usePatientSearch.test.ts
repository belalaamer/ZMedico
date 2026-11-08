import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The hook is the single source of the patient picker's first page. QuickConsult mounts its
// picker before the branch context resolves, so the mount-time ask returns nothing; the hook
// must ask again when the branch becomes usable instead of waiting for a keystroke.
const searchPatientRows = vi.hoisted(() => vi.fn());

vi.mock("@/lib/patientSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/patientSearch")>();
  return { ...actual, searchPatientRows };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

import { usePatientSearch } from "./usePatientSearch";

const row = {
  id: "p1",
  patient_code: 1,
  first_name_en: "Salma",
  last_name_en: "Adel",
  first_name_ar: null,
  last_name_ar: null,
  name_language: "en",
  phone: "01000000000",
};

beforeEach(() => {
  searchPatientRows.mockReset();
  searchPatientRows.mockResolvedValue({ rows: [row], error: null });
});

describe("usePatientSearch", () => {
  it("loads the first page once the branch becomes ready after mount", async () => {
    const { result, rerender } = renderHook(
      ({ ready, branchId }: { ready: boolean; branchId: string | null }) =>
        usePatientSearch({ ready, branchId, lang: "en" }),
      { initialProps: { ready: false, branchId: null } },
    );

    expect(searchPatientRows).not.toHaveBeenCalled();
    rerender({ ready: true, branchId: "branch-1" });

    await waitFor(() => expect(result.current.options).toHaveLength(1));
    expect(result.current.options[0].label).toBe("Salma Adel");
    expect(searchPatientRows).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ branchId: "branch-1" }),
    );
  });

  it("asks again when the branch changes, and never shows the old branch's rows", async () => {
    const { result, rerender } = renderHook(
      ({ branchId }: { branchId: string }) => usePatientSearch({ ready: true, branchId, lang: "en" }),
      { initialProps: { branchId: "branch-1" } },
    );
    await waitFor(() => expect(result.current.options).toHaveLength(1));

    searchPatientRows.mockClear();
    rerender({ branchId: "branch-2" });

    await waitFor(() =>
      expect(searchPatientRows).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ branchId: "branch-2" }),
      ),
    );
  });
});
