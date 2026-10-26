import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CalendarPage from "./CalendarPage";

const ID = "3f2a1b0c-9d8e-4f70-a1b2-c3d4e5f60718";

const state = vi.hoisted(() => ({
  reads: [] as string[],
  inserts: [] as Record<string, unknown>[],
  patientLookup: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/contexts/I18nContext", () => ({
  useI18n: () => ({ lang: "en", setLang: vi.fn(), t: (key: string) => key, dir: "ltr" }),
}));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({
    branches: [{ id: "branch-1", name_en: "Main", name_ar: "الرئيسي" }],
    currentBranchId: "branch-1",
    branchSelectionReady: true,
    subscription: { tenant_id: "tenant-1", plan_features: {}, subscription_status: "active" },
    subscriptionLoading: false,
    enabledModules: [],
    isModuleEnabled: () => true,
    setCurrentBranchId: vi.fn(),
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/dataSync", () => ({ useDataSync: () => undefined }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/Can", () => ({ Can: ({ children }: { children: ReactNode }) => <>{children}</> }));

function builder(table: string) {
  const filters: string[] = [];
  const record = () => { state.reads.push(`${table}|${filters.join(",")}`); };
  const settle = () => {
    record();
    if (table === "patients" && filters.some((filter) => filter.startsWith("id,"))) return Promise.resolve(state.patientLookup);
    return Promise.resolve({ data: [], error: null });
  };
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "in", "not", "or", "filter", "order", "limit", "match", "range", "gte", "lte", "gt", "lt", "ilike", "like", "contains", "textSearch"]) {
    chain[method] = (field?: string, value?: unknown) => {
      if (field && (method === "eq" || method === "is" || method === "in")) filters.push(`${field},${String(value)}`);
      return chain;
    };
  }
  chain.then = (onValue: (result: { data: unknown; error: unknown }) => unknown) => settle().then(onValue);
  chain.maybeSingle = () => {
    const pending = settle().then(({ data, error }) => ({
      data: Array.isArray(data) ? (data[0] ?? null) : (data ?? null),
      error,
    }));
    return { then: (onValue: (result: { data: unknown; error: unknown }) => unknown) => pending.then(onValue) };
  };
  chain.single = chain.maybeSingle;
  chain.insert = (payload: Record<string, unknown>) => {
    state.inserts.push(payload);
    record();
    return Promise.resolve({ data: null, error: null });
  };
  chain.update = () => { record(); return Promise.resolve({ error: null }); };
  chain.delete = () => { record(); return Promise.resolve({ error: null }); };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => builder(table),
    rpc: async () => ({ data: [], error: null }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

const PATIENT_ROW = {
  id: ID,
  first_name_en: "Salma",
  last_name_en: "Adel",
  first_name_ar: "سلمى",
  last_name_ar: "عادل",
  name_language: "en",
};

async function arriveAt(url: string) {
  window.history.replaceState({}, "", url);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // BrowserRouter, not MemoryRouter: the fix writes the cleaned URL back through
  // setSearchParams, and the assertions read window.location.
  render(<BrowserRouter><CalendarPage /></BrowserRouter>);
  await screen.findByRole("button", { name: "today" });
}

function openBookingFromBanner() {
  fireEvent.click(screen.getByRole("button", { name: /^New appointment/ }));
}

async function tryToSave() {
  fireEvent.click(await screen.findByRole("button", { name: "save" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  cleanup();
  state.reads = [];
  state.inserts = [];
  state.patientLookup = { data: null, error: null };
  vi.restoreAllMocks();
});

// CalendarPage is a 1,550-line page and every case mounts it in jsdom, which on a loaded
// runner goes past the 5 s default. This is a budget, not a wait: the cases finish earlier.
describe("CalendarPage ?patient_id= deep link", { timeout: 30_000 }, () => {
  it("names the arriving patient instead of dropping the link", async () => {
    state.patientLookup = { data: [PATIENT_ROW], error: null };
    await arriveAt(`/calendar?patient_id=${ID}`);
    expect(await screen.findByText("Booking for Salma Adel")).toBeInTheDocument();
  });

  it("fills the booking form with that patient and saves the appointment for them", async () => {
    state.patientLookup = { data: [PATIENT_ROW], error: null };
    await arriveAt(`/calendar?patient_id=${ID}`);
    openBookingFromBanner();
    // The picker trigger is role="combobox", which takes no name from content, so the
    // assertion reads the visible label itself.
    expect(await screen.findByText("Salma Adel")).toBeInTheDocument();
    await tryToSave();
    await waitFor(() => expect(state.inserts).toHaveLength(1));
    expect(state.inserts[0].patient_id).toBe(ID);
    expect(state.inserts[0].branch_id).toBe("branch-1");
  });

  it("refuses to prefill a patient the database says is not there", async () => {
    state.patientLookup = { data: null, error: null };
    await arriveAt(`/calendar?patient_id=${ID}`);
    expect(await screen.findByText("This patient is not bookable here")).toBeInTheDocument();
    openBookingFromBanner();
    expect(await screen.findByText("Search patient...")).toBeInTheDocument();
    await tryToSave();
    expect(state.inserts).toHaveLength(0);
  });

  it("keeps a refused lookup apart from an absent patient", async () => {
    state.patientLookup = { data: null, error: { message: "permission denied for table patients" } };
    await arriveAt(`/calendar?patient_id=${ID}`);
    expect(await screen.findByText("This booking link could not be checked")).toBeInTheDocument();
    expect(screen.queryByText("This patient is not bookable here")).toBeNull();
  });

  it("does not query the database for a value that is not a patient id", async () => {
    await arriveAt("/calendar?patient_id=drop-table");
    await waitFor(() => expect(screen.getByRole("button", { name: "today" })).toBeEnabled());
    expect(state.reads.some((read) => read.includes("patients|id,"))).toBe(false);
    expect(screen.queryByText(/Booking for|Checking the patient|not bookable/)).toBeNull();
  });

  it("shows no banner for a plain arrival, so the day view is unchanged", async () => {
    await arriveAt("/calendar");
    await waitFor(() => expect(screen.getByRole("button", { name: "today" })).toBeEnabled());
    expect(screen.queryByText(/Booking for|Checking the patient/)).toBeNull();
    expect(state.reads.some((read) => read.includes("patients|id,"))).toBe(false);
  });

  it("clears both the prefill and the URL when the desk dismisses the patient", async () => {
    state.patientLookup = { data: [PATIENT_ROW], error: null };
    await arriveAt(`/calendar?patient_id=${ID}`);
    fireEvent.click(await screen.findByRole("button", { name: "Clear patient" }));
    await waitFor(() => {
      expect(screen.queryByText("Booking for Salma Adel")).toBeNull();
      expect(window.location.search).not.toContain("patient_id");
    });
  });

  it("spends the link on the booking it was made for", async () => {
    state.patientLookup = { data: [PATIENT_ROW], error: null };
    await arriveAt(`/calendar?patient_id=${ID}`);
    openBookingFromBanner();
    await tryToSave();
    await waitFor(() => expect(state.inserts).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText("Booking for Salma Adel")).toBeNull());
    expect(window.location.search).not.toContain("patient_id");
  });
});
