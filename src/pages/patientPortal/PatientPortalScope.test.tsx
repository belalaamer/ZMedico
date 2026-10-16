import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ rpc: vi.fn(), error: vi.fn(), user: { id: "synthetic-a" } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: api.rpc, auth: {}, from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { username: "synthetic" }, error: null }) }; return q; } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: api.user, loading: false, signOut: vi.fn() }) }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", setLang: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: api.error, success: vi.fn() } }));
vi.mock("@/lib/observability/reportError", () => ({ reportClientError: vi.fn() }));
import PatientPortal from "./PatientPortal";
const snapshot = { patient: { id: "patient-a", first_name_en: "Synthetic", last_name_en: "A" }, clinic: { name_en: "Synthetic clinic", name_ar: "عيادة اختبار" }, appointments: [], invoices: [], physio_cases: [], sessions: [] };
const element = () => <MemoryRouter><PatientPortal /></MemoryRouter>;
beforeEach(() => { vi.clearAllMocks(); api.user = { id: "synthetic-a" }; api.rpc.mockImplementation(async name => ({ data: name === "patient_portal_password_state" ? { active: true, must_change_password: false } : snapshot, error: null })); });
afterEach(cleanup);
it("hides the previous patient's records immediately while the new account is pending", async () => {
  const view = render(element()); await screen.findByRole("heading", { name: "Welcome, Synthetic A" });
  api.rpc.mockReturnValue(new Promise(() => {})); api.user = { id: "synthetic-b" }; view.rerender(element());
  expect(screen.queryByRole("heading", { name: "Welcome, Synthetic A" })).not.toBeInTheDocument();
});
it("does not retain patient A's records after account B is denied portal access", async () => {
  const view = render(element()); await screen.findByRole("heading", { name: "Welcome, Synthetic A" });
  api.rpc.mockResolvedValue({ data: { active: false, must_change_password: false }, error: null }); api.user = { id: "synthetic-b" }; view.rerender(element());
  await screen.findByRole("heading", { name: "Patient portal unavailable" });
  expect(screen.queryByRole("heading", { name: "Welcome, Synthetic A" })).not.toBeInTheDocument();
});
it("hides the previous account's password form while a new account is pending", async () => {
  api.rpc.mockResolvedValue({ data: { active: true, must_change_password: true }, error: null });
  const view = render(element()); const field = await screen.findByPlaceholderText("New password"); fireEvent.change(field, { target: { value: "synthetic-password" } });
  api.rpc.mockReturnValue(new Promise(() => {})); api.user = { id: "synthetic-b" }; view.rerender(element());
  expect(screen.queryByPlaceholderText("New password")).not.toBeInTheDocument();
});
it("does not expose the old forced-password action after the new account is denied", async () => {
  api.rpc.mockResolvedValue({ data: { active: true, must_change_password: true }, error: null });
  const view = render(element()); await screen.findByPlaceholderText("New password");
  api.rpc.mockResolvedValue({ data: { active: false, must_change_password: false }, error: null }); api.user = { id: "synthetic-b" }; view.rerender(element());
  await screen.findByRole("heading", { name: "Patient portal unavailable" }); expect(screen.queryByPlaceholderText("New password")).not.toBeInTheDocument();
});
it("ignores a snapshot from the previous account arriving after the current account", async () => {
  let finish!: (value: unknown) => void;
  api.rpc.mockImplementation(name => name === "patient_portal_password_state" ? Promise.resolve({ data: { active: true, must_change_password: false }, error: null }) : api.user.id === "synthetic-a" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ data: { ...snapshot, patient: { ...snapshot.patient, last_name_en: "B" } }, error: null }));
  const view = render(element()); await waitFor(() => expect(api.rpc.mock.calls.some(([name]) => name === "patient_portal_snapshot")).toBe(true));
  api.user = { id: "synthetic-b" }; view.rerender(element()); await screen.findByRole("heading", { name: "Welcome, Synthetic B" });
  await act(async () => { finish({ data: snapshot, error: null }); }); expect(screen.queryByRole("heading", { name: "Welcome, Synthetic A" })).not.toBeInTheDocument();
});
it("clears clinical data if the current account's snapshot is rejected", async () => {
  const view = render(element()); await screen.findByRole("heading", { name: "Welcome, Synthetic A" });
  api.rpc.mockImplementation(async name => ({ data: name === "patient_portal_password_state" ? { active: true, must_change_password: false } : null, error: name === "patient_portal_password_state" ? null : { code: "42501" } }));
  api.user = { id: "synthetic-b" }; view.rerender(element()); await screen.findByRole("heading", { name: "Patient portal unavailable" });
  expect(screen.queryByRole("heading", { name: "Welcome, Synthetic A" })).not.toBeInTheDocument();
});
