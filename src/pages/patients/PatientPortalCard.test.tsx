import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ read: vi.fn(), invoke: vi.fn(), error: vi.fn(), success: vi.fn(), user: { id: "staff-a" } }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: api.user }) }));
vi.mock("sonner", () => ({ toast: { error: api.error, success: api.success } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: (_field: string, patient: string) => ({ maybeSingle: () => api.read(patient) }) }) }),
  functions: { invoke: api.invoke },
} }));
import PatientPortalCard from "./PatientPortalCard";

const account = { id: "account-a", auth_user_id: "auth-a", status: "active", portal_enabled: true, must_change_password: false, invited_at: null };
const credentials = { username: "patient.a", email: "patient-a@example.invalid", password: "synthetic-temporary-password" };
function deferred() { let resolve!: (value: unknown) => void; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const element = (patient = "patient-a") => <PatientPortalCard patientId={patient} patientEmail={`${patient}@example.invalid`} />;
beforeEach(() => {
  vi.clearAllMocks(); api.user = { id: "staff-a" };
  api.read.mockResolvedValue({ data: null, error: null });
  api.invoke.mockResolvedValue({ data: { success: true, credentials }, error: null });
});
afterEach(cleanup);

it("shows a read failure with retry instead of offering to create an account", async () => {
  api.read.mockResolvedValue({ data: null, error: { message: "private database details" } });
  render(element());
  await screen.findByRole("button", { name: "Retry" });
  expect(screen.queryByRole("button", { name: "Create portal login" })).not.toBeInTheDocument();
  expect(screen.queryByText(/private database/)).not.toBeInTheDocument();
  api.read.mockResolvedValue({ data: null, error: null }); fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("button", { name: "Create portal login" });
});

it("handles a thrown read failure without leaving the card loading", async () => {
  api.read.mockRejectedValue(new Error("private transport details")); render(element());
  await screen.findByRole("button", { name: "Retry" });
  expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
});

it("clears temporary credentials immediately when the patient changes", async () => {
  const view = render(element()); fireEvent.click(await screen.findByRole("button", { name: "Create portal login" }));
  await screen.findByText(credentials.password);
  api.read.mockReturnValue(new Promise(() => {})); view.rerender(element("patient-b"));
  expect(screen.queryByText(credentials.password)).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("clears credentials when the signed-in staff identity changes", async () => {
  const view = render(element()); fireEvent.click(await screen.findByRole("button", { name: "Create portal login" }));
  await screen.findByText(credentials.password); api.user = { id: "staff-b" }; view.rerender(element());
  expect(screen.queryByText(credentials.password)).not.toBeInTheDocument();
  await screen.findByRole("button", { name: "Create portal login" });
});

it("ignores an old patient's late account read", async () => {
  const old = deferred(); api.read.mockImplementation(patient => patient === "patient-a" ? old.promise : Promise.resolve({ data: null, error: null }));
  const view = render(element()); view.rerender(element("patient-b"));
  await screen.findByRole("button", { name: "Create portal login" });
  await act(async () => { old.resolve({ data: account, error: null }); });
  expect(screen.queryByRole("button", { name: "Reset password" })).not.toBeInTheDocument();
});

it("discards an old patient's late credential response, including A to B to A", async () => {
  const old = deferred(); api.invoke.mockReturnValue(old.promise);
  const view = render(element()); fireEvent.click(await screen.findByRole("button", { name: "Create portal login" }));
  view.rerender(element("patient-b")); view.rerender(element());
  await act(async () => { old.resolve({ data: { success: true, credentials }, error: null }); });
  expect(screen.queryByText(credentials.password)).not.toBeInTheDocument(); expect(api.success).not.toHaveBeenCalled();
});

it("keeps a single create request in flight and recovers after rejection", async () => {
  const pending = deferred(); api.invoke.mockReturnValue(pending.promise); render(element());
  const button = await screen.findByRole("button", { name: "Create portal login" });
  fireEvent.click(button); fireEvent.click(button); expect(api.invoke).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve({ data: null, error: { message: "private server diagnostics" } }); });
  await waitFor(() => expect(button).not.toBeDisabled());
  expect(api.error.mock.calls.flat().join()).not.toContain("private server diagnostics");
  expect(api.success).not.toHaveBeenCalled();
});

it("handles thrown mutations and permits a deliberate retry", async () => {
  api.invoke.mockRejectedValueOnce(new Error("private stack trace")); render(element());
  const button = await screen.findByRole("button", { name: "Create portal login" }); fireEvent.click(button);
  await waitFor(() => expect(api.error).toHaveBeenCalled()); expect(button).not.toBeDisabled();
  expect(api.error.mock.calls.flat().join()).not.toContain("private stack trace");
  fireEvent.click(button); await screen.findByText(credentials.password);
});

it("does not confirm success from an incomplete function response", async () => {
  api.invoke.mockResolvedValue({ data: {}, error: null }); render(element());
  fireEvent.click(await screen.findByRole("button", { name: "Create portal login" }));
  await waitFor(() => expect(api.error).toHaveBeenCalled()); expect(api.success).not.toHaveBeenCalled();
});

it("refreshes the mandatory-password badge after a confirmed reset", async () => {
  api.read.mockResolvedValueOnce({ data: account, error: null }).mockResolvedValue({ data: { ...account, must_change_password: true }, error: null });
  render(element()); fireEvent.click(await screen.findByRole("button", { name: "Reset password" }));
  await screen.findByText(credentials.password); await screen.findByText("Must change password on first login");
  expect(api.invoke).toHaveBeenCalledWith("patient-portal-reset-password", { body: { patient_id: "patient-a" } });
});

it("does not reset an inactive portal account", async () => {
  api.read.mockResolvedValue({ data: { ...account, status: "disabled", portal_enabled: false }, error: null });
  render(element()); const button = await screen.findByRole("button", { name: "Reset password" });
  expect(button).toBeDisabled(); fireEvent.click(button); expect(api.invoke).not.toHaveBeenCalled();
});

it("does not expose a malformed credential response", async () => {
  api.invoke.mockResolvedValue({ data: { success: true, credentials: { password: 123, email: credentials.email } }, error: null });
  render(element()); fireEvent.click(await screen.findByRole("button", { name: "Create portal login" }));
  await waitFor(() => expect(api.error).toHaveBeenCalled()); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.success).not.toHaveBeenCalled();
});

it("retains confirmed credentials if the follow-up status read fails", async () => {
  api.read.mockResolvedValueOnce({ data: null, error: null }).mockRejectedValue(new Error("private refresh details"));
  render(element()); fireEvent.click(await screen.findByRole("button", { name: "Create portal login" }));
  await screen.findByText(credentials.password);
  await screen.findByText("Could not load the portal account status.");
  // The real modal correctly hides the underlying card from accessibility.
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await screen.findByRole("button", { name: "Retry" });
  expect(api.success).toHaveBeenCalledTimes(1); expect(api.invoke).toHaveBeenCalledTimes(1);
});

it("ignores a late mutation after the card unmounts", async () => {
  const pending = deferred(); api.invoke.mockReturnValue(pending.promise);
  const view = render(element()); fireEvent.click(await screen.findByRole("button", { name: "Create portal login" })); view.unmount();
  await act(async () => { pending.resolve({ data: { success: true, credentials }, error: null }); });
  expect(api.success).not.toHaveBeenCalled(); expect(api.read).toHaveBeenCalledTimes(1);
});
