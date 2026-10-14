import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({ actor: "actor-a", branch: "branch-a", lang: "en", rpcError: null as unknown, rpcData: "lang-b" as string | null, pending: null as Promise<unknown> | null, readError: false, throwRpc: false }));
const events = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), rpc: vi.fn(), update: vi.fn() }));
vi.mock("sonner", () => ({ toast: events }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: state.lang, t: (key: string) => key }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: state.actor } }) }));
vi.mock("@/contexts/BranchContext", () => ({ useBranch: () => ({ currentBranchId: state.branch }) }));
vi.mock("./SettingsLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (name: string, args: unknown) => { events.rpc(name, args); return state.pending ?? (state.throwRpc ? Promise.reject(new Error("private transport")) : Promise.resolve({ data: state.rpcData, error: state.rpcError })); },
  from: () => {
    const read = Promise.resolve({ data: [{ id: "lang-a", code: "en", name_en: "English", name_ar: "الإنجليزية", is_active: true, is_default: true, is_rtl: false }, { id: "lang-b", code: "ar", name_en: "Arabic", name_ar: "العربية", is_active: true, is_default: false, is_rtl: true }], error: state.readError ? { code: "42501" } : null });
    const query: Record<string, unknown> = { then: read.then.bind(read) };
    query.select = () => query; query.order = () => query;
    query.update = (...args: unknown[]) => {
      events.update(...args); const result = Promise.resolve({ data: null, error: { code: "42501", message: "private policy" } });
      const write: Record<string, unknown> = { then: result.then.bind(result), maybeSingle: () => result };
      write.eq = () => write; write.select = () => write; return write;
    };
    return query;
  },
} }));
import Languages from "./Languages";
beforeEach(() => { state.actor = "actor-a"; state.branch = "branch-a"; state.lang = "en"; state.rpcError = null; state.rpcData = "lang-b"; state.pending = null; state.readError = false; state.throwRpc = false; vi.clearAllMocks(); });
afterEach(cleanup);
async function setup() { const view = render(<Languages />); await screen.findByText("Arabic"); return { view, button: screen.getAllByRole("button", { name: "setDefault" })[1] }; }
async function form() {
  await setup(); fireEvent.click(screen.getByRole("button", { name: "addLanguage" }));
  const dialog = screen.getByRole("dialog"); const inputs = within(dialog).getAllByRole("textbox");
  [" fr ", " French ", " فرنسي " ].forEach((value, i) => fireEvent.change(inputs[i], { target: { value } }));
  return { dialog, save: within(dialog).getByRole("button", { name: "save" }) };
}
it("default selection uses one exact-identity RPC and no client-side clearing", async () => {
  const { button } = await setup(); fireEvent.click(button); await waitFor(() => expect(events.success).toHaveBeenCalledOnce());
  expect(events.rpc).toHaveBeenCalledExactlyOnceWith("set_default_system_language", { _language_id: "lang-b" }); expect(events.update).not.toHaveBeenCalled();
});
it("missing backend denies safely without falling back to two updates", async () => {
  state.rpcError = { code: "PGRST202", message: "private cache detail" }; state.rpcData = null;
  const { button } = await setup(); fireEvent.click(button); await waitFor(() => expect(events.error).toHaveBeenCalled()); expect(events.update).not.toHaveBeenCalled(); expect(events.success).not.toHaveBeenCalled();
});
it("wrong returned default identity is not acknowledged", async () => {
  state.rpcData = "other"; const { button } = await setup(); fireEvent.click(button); await waitFor(() => expect(events.error).toHaveBeenCalled()); expect(events.success).not.toHaveBeenCalled();
});
it("default double click makes one request and blocks selection while pending", async () => {
  let resolve!: (value: unknown) => void; state.pending = new Promise(done => { resolve = done; }); const { button } = await setup();
  fireEvent.click(button); fireEvent.click(button); expect(events.rpc).toHaveBeenCalledOnce(); expect(button).toBeDisabled();
  await act(async () => resolve({ data: "lang-b", error: null })); expect(events.success).toHaveBeenCalledOnce();
});
it("default language cannot be deactivated from this screen", async () => {
  await setup(); const control = screen.getByRole("switch", { name: "Toggle language status en" }); expect(control).toBeDisabled(); fireEvent.click(control); expect(events.update).not.toHaveBeenCalled();
});
it("activation denial is readable and does not announce success", async () => {
  await setup(); fireEvent.click(screen.getByRole("switch", { name: "Toggle language status ar" })); await waitFor(() => expect(events.error).toHaveBeenCalledWith("You do not have permission to change this record.")); expect(events.success).not.toHaveBeenCalled();
});
it("late default acknowledgement from a previous actor is ignored", async () => {
  let resolve!: (value: unknown) => void; state.pending = new Promise(done => { resolve = done; }); const { view, button } = await setup(); fireEvent.click(button);
  await act(async () => { state.actor = "actor-b"; view.rerender(<Languages />); }); await act(async () => resolve({ data: "lang-b", error: null })); expect(events.success).not.toHaveBeenCalled();
});
it("failed refresh is separate from confirmed default persistence", async () => {
  const { button } = await setup(); state.readError = true; fireEvent.click(button); await waitFor(() => expect(events.error).toHaveBeenCalledWith("The change was saved, but the list could not be refreshed. Refresh the page.")); expect(events.success).toHaveBeenCalledOnce();
});
it("creation submits trimmed fields once through the atomic RPC", async () => {
  state.rpcData = "lang-new"; const { save } = await form(); fireEvent.click(save); await waitFor(() => expect(events.success).toHaveBeenCalledOnce());
  expect(events.rpc).toHaveBeenCalledExactlyOnceWith("create_system_language", { _code: "fr", _name_en: "French", _name_ar: "فرنسي", _is_rtl: false, _is_default: false }); expect(events.update).not.toHaveBeenCalled();
});
it("failed creation stays open without clearing defaults or exposing details", async () => {
  state.rpcData = null; state.rpcError = { code: "23505", message: "private constraint" }; const { save } = await form(); fireEvent.click(save);
  await waitFor(() => expect(events.error).toHaveBeenCalledWith("Language save could not be confirmed. Refresh the list before retrying.")); expect(screen.getByRole("dialog")).toBeInTheDocument(); expect(events.success).not.toHaveBeenCalled(); expect(events.update).not.toHaveBeenCalled();
});
it("creation duplicate submission is suppressed while pending", async () => {
  let resolve!: (value: unknown) => void; state.pending = new Promise(done => { resolve = done; }); const { save } = await form(); fireEvent.click(save); fireEvent.click(save); expect(events.rpc).toHaveBeenCalledOnce(); expect(save).toBeDisabled();
  await act(async () => resolve({ data: "lang-new", error: null })); expect(events.success).toHaveBeenCalledOnce();
});
it("transport failure is not automatically retried", async () => {
  state.throwRpc = true; const { save } = await form(); fireEvent.click(save); await waitFor(() => expect(events.error).toHaveBeenCalled()); expect(events.rpc).toHaveBeenCalledOnce(); expect(events.update).not.toHaveBeenCalled();
});
