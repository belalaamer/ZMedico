import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import QuickConsult from "./QuickConsult";

/** Where the form ended up, so a test can see which query it was left with. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

const m = vi.hoisted(() => ({
  handoff: null as null | { id: string; lang: string; branchId?: string | null },
  resolved: null as null | { id: string; label: string; phone: string | null },
}));

// The picker's own paging is covered in patientSearch.test.ts; here the question is
// what QuickConsult does with a patient handed to it through the URL, so only the
// one-by-id read is standing in.
vi.mock("@/lib/patientSearch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/patientSearch")>("@/lib/patientSearch");
  return {
    ...actual,
    fetchPatientOption: vi.fn(async (_client: unknown, input: { id: string; lang: string; branchId?: string | null }) => {
      m.handoff = { id: input.id, lang: input.lang, branchId: input.branchId };
      return m.resolved;
    }),
  };
});

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (s: string) => s, lang: "en" }) }));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ currentBranchId: "branch-a", branchSelectionReady: true }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "doctor-1" } }) }));
vi.mock("@/hooks/usePatientSearch", () => ({
  usePatientSearch: () => ({ options: [], searching: false, failed: false, search: vi.fn(), reload: vi.fn() }),
}));
vi.mock("@/lib/dataSync", () => ({ useDataSync: () => {}, notifyDataChange: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        neq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    },
  },
}));

function openWith(search: string) {
  render(
    <MemoryRouter initialEntries={[`/medical/quick-consult${search}`]}>
      <QuickConsult />
      <LocationProbe />
    </MemoryRouter>,
  );
}

/**
 * The patient box, found through its own label.
 *
 * `getByRole("combobox")` cannot name it: the specialty and visit-type selects are
 * the same role, and the one control that can carry a patient is the one under test.
 */
function patientBox(): HTMLElement {
  const box = screen.getByText("patientName").parentElement?.querySelector('button[role="combobox"]');
  if (!box) throw new Error("the patient picker is missing from the form");
  return box as HTMLElement;
}

const pickedIntoBox = () => patientBox().textContent?.includes("Salma Adel") ?? false;

beforeEach(() => {
  vi.clearAllMocks();
  m.handoff = null;
  m.resolved = { id: "p-9", label: "Salma Adel", phone: "0101234567" };
});

afterEach(() => cleanup());

describe("QuickConsult patient handoff", () => {
  it("arrives with its patient already named", async () => {
    openWith("?patient=p-9");
    await waitFor(() => expect(pickedIntoBox()).toBe(true));
    // The record this form writes carries branch_id = currentBranchId, so the id
    // from the URL is resolved inside that branch and not across the clinic.
    expect(m.handoff).toEqual({ id: "p-9", lang: "en", branchId: "branch-a" });
  });

  it("hands the param back once it has been read", async () => {
    openWith("?patient=p-9");
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).toBe(""));
  });

  it("refuses a patient that belongs to another branch instead of filing them here", async () => {
    m.resolved = null;
    openWith("?patient=p-other-branch");
    await waitFor(() => expect(m.handoff?.id).toBe("p-other-branch"));
    expect(pickedIntoBox()).toBe(false);
    // The desk is told why the box is empty, rather than left on a silent no-match.
    expect(await screen.findByRole("status")).toHaveTextContent(/not registered in the current branch/i);
    // No patient means no visit to save.
    expect(screen.getByRole("button", { name: "saveQuickConsult" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "openFullRecord" })).toBeDisabled();
  });

  it("leaves a form opened without a handoff exactly as it was", async () => {
    openWith("");
    await waitFor(() => expect(patientBox()).toBeInTheDocument());
    expect(m.handoff).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent(/selectPatient/i);
  });
});
