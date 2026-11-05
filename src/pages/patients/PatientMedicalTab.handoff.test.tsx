import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import PatientMedicalTab from "./PatientMedicalTab";

// The clinical tab of a patient profile is where a doctor stands when they decide
// to open a new visit. QuickConsult reads `?patient=<id>` off that hand-off
// (QuickConsult.patientHandoff.test.tsx), so the door has to carry the id.
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (s: string) => s, lang: "en" }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "doctor-1" } }) }));
vi.mock("@/components/Can", () => ({ Can: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
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

afterEach(cleanup);

describe("the patient profile's add-record door", () => {
  it("hands the patient to the visit it opens", async () => {
    render(
      <MemoryRouter>
        <PatientMedicalTab patientId="p-42" />
      </MemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: /addRecord/i });
    await waitFor(() => expect(link.getAttribute("href")).toContain("/medical/quick-consult"));
    expect(link.getAttribute("href")).toContain("patient=p-42");
  });
});
