import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  rpc: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
  reload: vi.fn(),
  profile: vi.fn(),
}));

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", setLang: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "auth-patient" }, loading: false, signOut: api.signOut }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: api.rpc,
    auth: { signOut: api.signOut, updateUser: api.updateUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: api.profile }) }) }),
  },
}));

import PatientPortal from "./PatientPortal";

const snapshot = {
  patient: { id: "p-1", patient_code: 39, first_name_en: "Test", last_name_en: "Patient", first_name_ar: null, last_name_ar: null, name_language: null, phone: null, email: "t@example.invalid", dob: null, gender: null },
  clinic: { name_en: "Blitz Physio", name_ar: "بلتس", support_email: "support@zmedico.com", support_phone: null, complaint_instructions_en: null, complaint_instructions_ar: null },
  appointments: [], invoices: [], physio_cases: [], sessions: [],
};

function mount() {
  return render(<MemoryRouter><PatientPortal /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.profile.mockResolvedValue({ data: { username: null }, error: null });
  api.updateUser.mockResolvedValue({ error: null });
  api.rpc.mockImplementation(async (name: string) => {
    if (name === "patient_portal_snapshot") return { data: snapshot, error: null };
    return { data: null, error: null };
  });
  // The harness replaces the real one so window.location.reload() cannot print "Not implemented".
  Object.defineProperty(window, "location", { value: { ...window.location, reload: api.reload, assign: vi.fn() }, configurable: true });
});
afterEach(cleanup);

it("treats a never-activated invitation as a blocking first-password step", async () => {
  api.rpc.mockImplementation(async (name: string) => {
    if (name === "patient_portal_password_state") return { data: { active: true, must_change_password: true, activated: false, reason: "first_password_setup" }, error: null };
    if (name === "patient_portal_snapshot") return { data: snapshot, error: null };
    return { data: null, error: null };
  });
  mount();
  await screen.findByRole("heading", { name: "Set your password to continue" });
  expect(screen.getByText(/invitation link can be used once/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Set password and continue" })).toBeInTheDocument();
  expect(api.rpc).not.toHaveBeenCalledWith("patient_portal_snapshot");
  expect(screen.queryByText(/Blitz Physio/)).not.toBeInTheDocument();
});

it("still blocks when only activated is false, as the production invitation row reports", async () => {
  api.rpc.mockImplementation(async (name: string) => {
    if (name === "patient_portal_password_state") return { data: { active: true, must_change_password: false, activated: false }, error: null };
    if (name === "patient_portal_snapshot") return { data: snapshot, error: null };
    return { data: null, error: null };
  });
  mount();
  await screen.findByRole("heading", { name: "Set your password to continue" });
  expect(api.rpc).not.toHaveBeenCalledWith("patient_portal_snapshot");
});

it("uses change-password wording for an activated account flagged by an admin reset", async () => {
  api.rpc.mockImplementation(async (name: string) => {
    if (name === "patient_portal_password_state") return { data: { active: true, must_change_password: true, activated: true }, error: null };
    if (name === "patient_portal_snapshot") return { data: snapshot, error: null };
    return { data: null, error: null };
  });
  mount();
  await screen.findByRole("heading", { name: "Password change required" });
  expect(screen.getByRole("button", { name: "Change password and continue" })).toBeInTheDocument();
  expect(api.rpc).not.toHaveBeenCalledWith("patient_portal_snapshot");
});

it("renders the portal once the account is activated", async () => {
  api.rpc.mockImplementation(async (name: string) => {
    if (name === "patient_portal_password_state") return { data: { active: true, must_change_password: false, activated: true }, error: null };
    if (name === "patient_portal_snapshot") return { data: snapshot, error: null };
    return { data: null, error: null };
  });
  mount();
  await waitFor(() => expect(api.rpc).toHaveBeenCalledWith("patient_portal_snapshot"));
  await screen.findByRole("heading", { name: /Welcome, Test Patient/ });
  expect(screen.queryByRole("heading", { name: "Set your password to continue" })).not.toBeInTheDocument();
});

it("activates the account through the RPC and reloads instead of trusting local state", async () => {
  api.rpc.mockImplementation(async (name: string) => {
    if (name === "patient_portal_password_state") return { data: { active: true, must_change_password: true, activated: false }, error: null };
    if (name === "patient_portal_complete_password_change") return { data: true, error: null };
    return { data: null, error: null };
  });
  mount();
  const input = await screen.findByPlaceholderText("New password");
  fireEvent.change(input, { target: { value: "a-chosen-secret" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set password and continue" })); });
  await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith({ password: "a-chosen-secret" }));
  await waitFor(() => expect(api.rpc).toHaveBeenCalledWith("patient_portal_complete_password_change"));
  await waitFor(() => expect(api.reload).toHaveBeenCalled());
});

it("distinguishes a refused request from a disabled account on the blocked screen", async () => {
  // The card used to tell both states to "use your invitation link", which is
  // single-use and already consumed by anyone who can reach this screen.
  api.rpc.mockImplementation(async (name: string) => {
    if (name === "patient_portal_password_state") return { data: { active: false }, error: null };
    return { data: null, error: null };
  });
  mount();
  await screen.findByRole("heading", { name: "Patient portal unavailable" });
  expect(screen.getByText(/has not enabled your account/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  expect(screen.getByText(/invitation link works only once/)).toBeInTheDocument();
  expect(screen.queryByText(/use your invitation link/i)).toBeNull();
});

it("offers a retry when the account check itself was refused", async () => {
  api.rpc.mockImplementation(async (name: string) => {
    if (name === "patient_portal_password_state") return { data: null, error: { message: "boom", status: 500 } };
    return { data: null, error: null };
  });
  mount();
  await screen.findByRole("heading", { name: "The patient portal could not be loaded" });
  expect(screen.queryByText(/has not enabled your account/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(api.reload).toHaveBeenCalled());
});

it("leaves the step blocking when the password was written but the activation RPC failed", async () => {
  api.rpc.mockImplementation(async (name: string) => {
    if (name === "patient_portal_password_state") return { data: { active: true, must_change_password: true, activated: false }, error: null };
    if (name === "patient_portal_complete_password_change") return { data: false, error: { message: "boom" } };
    return { data: null, error: null };
  });
  mount();
  const input = await screen.findByPlaceholderText("New password");
  fireEvent.change(input, { target: { value: "a-chosen-secret" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set password and continue" })); });
  await waitFor(() => expect(api.rpc).toHaveBeenCalledWith("patient_portal_complete_password_change"));
  expect(api.reload).not.toHaveBeenCalled();
  expect(screen.queryByRole("heading", { name: /Welcome/ })).not.toBeInTheDocument();
});
