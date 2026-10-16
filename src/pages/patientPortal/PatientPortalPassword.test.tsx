import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn(), error: vi.fn(), success: vi.fn(), nav: vi.fn(), user: { id: "synthetic-a", email: "synthetic@example.invalid" } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: api.rpc, auth: { updateUser: api.update }, from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { username: "synthetic" }, error: null }) }; return q; } } }));
vi.mock("react-router-dom", async original => ({ ...(await original<typeof import("react-router-dom")>()), useNavigate: () => api.nav }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: api.user, loading: false, signOut: vi.fn() }) }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", setLang: vi.fn() }) }));
vi.mock("@/lib/observability/reportError", () => ({ reportClientError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: api.error, success: api.success } }));
import PatientPortal from "./PatientPortal";
const element = () => <MemoryRouter><PatientPortal /></MemoryRouter>;
beforeEach(() => {
  vi.clearAllMocks(); api.user = { id: "synthetic-a", email: "synthetic@example.invalid" };
  api.rpc.mockImplementation(async name => ({ data: name === "patient_portal_password_state" ? { active: true, must_change_password: true } : true, error: null }));
  api.update.mockResolvedValue({ data: { user: api.user }, error: null });
});
afterEach(cleanup);
async function form() {
  const view = render(element()); const input = await screen.findByPlaceholderText("New password");
  fireEvent.change(input, { target: { value: "synthetic-password" } }); return { ...view, form: input.closest("form")! };
}
const activations = () => api.rpc.mock.calls.filter(([name]) => name === "patient_portal_complete_password_change");
describe("patient password change phases", () => {
  it("retries only activation after a confirmed password update", async () => {
    let activation = 0;
    api.update.mockResolvedValueOnce({ data: { user: api.user }, error: null }).mockResolvedValue({ data: { user: null }, error: { code: "same_password", message: "Synthetic same-password rejection" } });
    api.rpc.mockImplementation(async name => ({ data: name === "patient_portal_password_state" ? { active: true, must_change_password: true } : ++activation > 1, error: null }));
    const view = await form(); fireEvent.submit(view.form); await waitFor(() => expect(api.error).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Change password and continue|Retry activation/ }));
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1)); expect(activations()).toHaveLength(2);
    expect(api.success).toHaveBeenCalled(); expect(api.nav).toHaveBeenCalledWith(0);
  });
  it("suppresses concurrent password submissions", async () => {
    let finish!: (value: unknown) => void; api.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = await form(); fireEvent.submit(view.form); fireEvent.submit(view.form); expect(api.update).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ data: { user: api.user }, error: null }); });
  });
  it("does not leak a rejected password's diagnostics or call activation", async () => {
    api.update.mockResolvedValue({ data: { user: null }, error: { code: "same_password", message: "private provider details" } });
    fireEvent.submit((await form()).form); await waitFor(() => expect(api.error).toHaveBeenCalled());
    expect(api.error.mock.calls.flat().join(" ")).not.toContain("private provider"); expect(activations()).toHaveLength(0); expect(api.success).not.toHaveBeenCalled();
  });
  it("does not activate another account when the prior update finishes", async () => {
    let finish!: (value: unknown) => void; const original = api.user; api.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = await form(); fireEvent.submit(view.form); api.user = { id: "synthetic-b", email: "other@example.invalid" }; view.rerender(element());
    await act(async () => { finish({ data: { user: original }, error: null }); });
    expect(activations()).toHaveLength(0); expect(api.success).not.toHaveBeenCalled(); expect(api.nav).not.toHaveBeenCalled();
  });
  it("does not call activation after the component is abandoned", async () => {
    let finish!: (value: unknown) => void; api.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.submit((await form()).form); cleanup(); await act(async () => { finish({ data: { user: api.user }, error: null }); });
    expect(activations()).toHaveLength(0); expect(api.success).not.toHaveBeenCalled();
  });
  it("does not repeat a confirmed password while activation is pending", async () => {
    let finish!: (value: unknown) => void;
    api.rpc.mockImplementation(name => name === "patient_portal_password_state" ? Promise.resolve({ data: { active: true, must_change_password: true }, error: null }) : new Promise(resolve => { finish = resolve; }));
    const view = await form(); fireEvent.submit(view.form); await waitFor(() => expect(activations()).toHaveLength(1)); fireEvent.submit(view.form);
    expect(api.update).toHaveBeenCalledTimes(1); expect(activations()).toHaveLength(1);
    await act(async () => { finish({ data: true, error: null }); }); expect(api.nav).toHaveBeenCalledWith(0);
  });
  it("retains activation-only retry after the activation response is lost", async () => {
    let attempt = 0; api.rpc.mockImplementation(name => name === "patient_portal_password_state" ? Promise.resolve({ data: { active: true, must_change_password: true }, error: null }) : ++attempt === 1 ? Promise.reject(new Error("private transport")) : Promise.resolve({ data: true, error: null }));
    fireEvent.submit((await form()).form); fireEvent.click(await screen.findByRole("button", { name: "Retry activation" }));
    await waitFor(() => expect(api.nav).toHaveBeenCalledWith(0)); expect(api.update).toHaveBeenCalledTimes(1); expect(activations()).toHaveLength(2);
    expect(api.error.mock.calls.flat().join(" ")).not.toContain("private transport");
  });
  it("does not activate after an unconfirmed password update", async () => {
    api.update.mockRejectedValue(new Error("private update transport")); fireEvent.submit((await form()).form);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be confirmed"); expect(activations()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Retry activation" })).not.toBeInTheDocument(); expect(api.update).toHaveBeenCalledTimes(1);
  });
  it("requires the successful update response to identify the exact caller", async () => {
    api.update.mockResolvedValue({ data: { user: { id: "synthetic-b" } }, error: null }); fireEvent.submit((await form()).form);
    await screen.findByRole("alert"); expect(activations()).toHaveLength(0); expect(api.success).not.toHaveBeenCalled();
  });
  it("does not expose rejected activation diagnostics", async () => {
    api.rpc.mockImplementation(async name => ({ data: name === "patient_portal_password_state" ? { active: true, must_change_password: true } : false, error: name === "patient_portal_password_state" ? null : { message: "private activation diagnostics" } }));
    fireEvent.submit((await form()).form); await waitFor(() => expect(api.error).toHaveBeenCalled());
    expect(api.error.mock.calls.flat().join(" ")).not.toContain("private activation"); expect(api.success).not.toHaveBeenCalled(); expect(api.nav).not.toHaveBeenCalled();
  });
  it("discards activation proof after account A to B to A", async () => {
    api.rpc.mockImplementation(async name => ({ data: name === "patient_portal_password_state" ? { active: true, must_change_password: true } : false, error: null }));
    const view = await form(); fireEvent.submit(view.form); await screen.findByRole("button", { name: "Retry activation" });
    const original = api.user; api.user = { id: "synthetic-b", email: "other@example.invalid" }; view.rerender(element()); api.user = original; view.rerender(element());
    expect(await screen.findByPlaceholderText("New password")).toHaveValue(""); expect(screen.queryByRole("button", { name: "Retry activation" })).not.toBeInTheDocument();
    expect(activations()).toHaveLength(1);
  });
  it("ignores an activation completion after an account switch", async () => {
    let finish!: (value: unknown) => void; api.rpc.mockImplementation(name => name === "patient_portal_password_state" ? Promise.resolve({ data: { active: true, must_change_password: true }, error: null }) : new Promise(resolve => { finish = resolve; }));
    const view = await form(); fireEvent.submit(view.form); await waitFor(() => expect(activations()).toHaveLength(1));
    api.user = { id: "synthetic-b", email: "other@example.invalid" }; view.rerender(element()); await act(async () => { finish({ data: true, error: null }); });
    expect(api.success).not.toHaveBeenCalled(); expect(api.nav).not.toHaveBeenCalled();
  });
  it("preserves confirmation when the same user's profile object refreshes", async () => {
    let activation = 0; api.rpc.mockImplementation(async name => ({ data: name === "patient_portal_password_state" ? { active: true, must_change_password: true } : ++activation > 1, error: null }));
    const view = await form(); fireEvent.submit(view.form); await screen.findByRole("button", { name: "Retry activation" }); api.user = { ...api.user }; view.rerender(element());
    fireEvent.click(await screen.findByRole("button", { name: "Retry activation" })); await waitFor(() => expect(api.nav).toHaveBeenCalled());
    expect(api.update).toHaveBeenCalledTimes(1); expect(activations()).toHaveLength(2);
  });
  it("does not bypass the eight-character creation requirement", async () => {
    const view = await form(); fireEvent.change(screen.getByPlaceholderText("New password"), { target: { value: "short6" } }); fireEvent.submit(view.form);
    expect(api.update).not.toHaveBeenCalled(); expect(activations()).toHaveLength(0);
  });
  it("uses the same activation-only retry for the optional password form", async () => {
    let activation = 0;
    const snapshot = { patient: { id: "patient-a", first_name_en: "Synthetic", last_name_en: "A" }, clinic: { name_en: "Synthetic clinic", name_ar: "عيادة اختبار" }, appointments: [], invoices: [], physio_cases: [], sessions: [] };
    api.rpc.mockImplementation(async name => ({ data: name === "patient_portal_password_state" ? { active: true, must_change_password: false } : name === "patient_portal_snapshot" ? snapshot : ++activation > 1, error: null }));
    const view = await form(); fireEvent.submit(view.form); await screen.findByRole("button", { name: "Retry activation" });
    fireEvent.click(screen.getByRole("button", { name: "Retry activation" })); await waitFor(() => expect(api.nav).toHaveBeenCalledWith(0));
    expect(api.update).toHaveBeenCalledTimes(1); expect(activations()).toHaveLength(2);
  });
});
