import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({ lang: "en", branch: "branch-a", actor: "actor-a", result: { data: { id: "row-qa" } as { id: string } | null, error: null as unknown }, pending: null as Promise<unknown> | null, throwWrite: false, failRead: false, readError: false }));
const events = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), update: vi.fn(), read: vi.fn(), filter: vi.fn() }));
vi.mock("sonner", () => ({ toast: events }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: state.lang, t: (key: string) => key }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: state.actor } }) }));
vi.mock("@/contexts/BranchContext", () => ({ useBranch: () => ({ currentBranchId: state.branch, branches: [] }) }));
vi.mock("./SettingsLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/Can", () => ({ Can: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/RowActions", () => ({ RowActions: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "is", "order", "in"]) chain[name] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
    events.read(table);
    const result = state.failRead ? Promise.reject(new Error("private read detail")) : Promise.resolve({ data: ["departments", "payment_methods"].includes(table) ? [{ id: "row-qa", branch_id: "branch-a", name_en: "QA row", name_ar: "صف اختبار", is_active: true, code: "qa", type: "cash", processing_fee_percentage: 0, processing_fee_fixed: 0 }] : [], error: state.readError ? { code: "42501", message: "private read detail" } : null });
    return result.then(resolve, reject);
  };
  chain.update = (payload: unknown) => {
    events.update(table, payload);
    const result = state.pending ?? (state.throwWrite ? Promise.reject(new Error("private write detail")) : Promise.resolve(state.result));
    const write: Record<string, unknown> = { then: result.then.bind(result), maybeSingle: () => result };
    write.eq = (...args: unknown[]) => { events.filter(table, ...args); return write; };
    write.select = () => write;
    return write;
  };
  return chain;
} } }));
import PaymentMethods from "./PaymentMethods";
import Departments from "../hr/Departments";
beforeEach(() => { state.lang = "en"; state.branch = "branch-a"; state.actor = "actor-a"; state.result = { data: { id: "row-qa" }, error: null }; state.pending = null; state.throwWrite = false; state.failRead = false; state.readError = false; vi.clearAllMocks(); });
afterEach(cleanup);

for (const [name, Page, label] of [["departments", Departments, "Toggle department status"], ["payment methods", PaymentMethods, "Toggle payment method status"]] as const) {
  const setup = async () => { const view = render(<Page />); const button = await screen.findByRole("button", { name: label }); return { view, button }; };
  it(`${name}: reports rejected writes without raw database details`, async () => {
    state.result = { data: null, error: { code: "42501", message: "private policy detail" } };
    const { button } = await setup(); fireEvent.click(button);
    await waitFor(() => expect(events.error).toHaveBeenCalledWith("You do not have permission to change this record."));
    expect(events.success).not.toHaveBeenCalled();
  });
  it(`${name}: zero affected rows are not success`, async () => {
    state.result = { data: null, error: null }; const { button } = await setup(); fireEvent.click(button);
    await waitFor(() => expect(events.error).toHaveBeenCalled()); expect(events.success).not.toHaveBeenCalled();
  });
  it(`${name}: mismatched returned identity is not success`, async () => {
    state.result = { data: { id: "other" }, error: null }; const { button } = await setup(); fireEvent.click(button);
    await waitFor(() => expect(events.error).toHaveBeenCalled()); expect(events.success).not.toHaveBeenCalled();
  });
  it(`${name}: releases the synchronous row lock after transport rejection`, async () => {
    state.throwWrite = true; const { button } = await setup(); fireEvent.click(button);
    await waitFor(() => expect(events.error).toHaveBeenCalledOnce()); state.throwWrite = false; fireEvent.click(button);
    await waitFor(() => expect(events.success).toHaveBeenCalledOnce()); expect(events.update).toHaveBeenCalledTimes(2);
  });
  it(`${name}: suppresses duplicate writes while pending`, async () => {
    let resolve!: (value: unknown) => void; state.pending = new Promise(done => { resolve = done; }); const { button } = await setup(); fireEvent.click(button); fireEvent.click(button);
    expect(events.update).toHaveBeenCalledOnce(); expect(button).toBeDisabled();
    await act(async () => resolve({ data: { id: "row-qa" }, error: null })); await waitFor(() => expect(events.success).toHaveBeenCalledOnce());
  });
  it(`${name}: ignores acknowledgement after branch changes`, async () => {
    let resolve!: (value: unknown) => void; state.pending = new Promise(done => { resolve = done; }); const { view, button } = await setup(); fireEvent.click(button); state.branch = "branch-b"; view.rerender(<Page />);
    await act(async () => resolve({ data: { id: "row-qa" }, error: null })); expect(events.success).not.toHaveBeenCalled();
  });
  it(`${name}: ignores acknowledgement after identity changes`, async () => {
    let resolve!: (value: unknown) => void; state.pending = new Promise(done => { resolve = done; }); const { view, button } = await setup(); fireEvent.click(button); state.actor = "actor-b"; view.rerender(<Page />);
    await act(async () => resolve({ data: { id: "row-qa" }, error: null })); expect(events.success).not.toHaveBeenCalled();
  });
  it(`${name}: distinguishes refresh failure from confirmed persistence`, async () => {
    const { button } = await setup(); state.failRead = true; fireEvent.click(button);
    await waitFor(() => expect(events.error).toHaveBeenCalledWith("The change was saved, but the list could not be refreshed. Refresh the page."));
    expect(events.success).toHaveBeenCalledOnce();
  });
  it(`${name}: distinguishes returned refresh error from confirmed persistence`, async () => {
    const { button } = await setup(); state.readError = true; fireEvent.click(button);
    await waitFor(() => expect(events.error).toHaveBeenCalledWith("The change was saved, but the list could not be refreshed. Refresh the page.")); expect(events.success).toHaveBeenCalledOnce();
  });
  it(`${name}: only updates the exact row in its previously observed state`, async () => {
    const { button } = await setup(); fireEvent.click(button); await waitFor(() => expect(events.success).toHaveBeenCalledOnce());
    expect(events.filter).toHaveBeenCalledWith(name === "departments" ? "departments" : "payment_methods", "id", "row-qa");
    expect(events.filter).toHaveBeenCalledWith(name === "departments" ? "departments" : "payment_methods", "is_active", true);
    if (name === "departments") expect(events.filter).toHaveBeenCalledWith("departments", "branch_id", "branch-a");
  });
  it(`${name}: Arabic feedback stays readable`, async () => {
    state.lang = "ar"; state.result = { data: null, error: { code: "42501", message: "private policy detail" } }; render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: name === "departments" ? "تغيير حالة القسم" : "تغيير حالة طريقة الدفع" }));
    await waitFor(() => expect(events.error).toHaveBeenCalledWith("ليس لديك صلاحية تعديل هذا السجل."));
  });
  it(`${name}: ignores late completion after unmount`, async () => {
    let resolve!: (value: unknown) => void; state.pending = new Promise(done => { resolve = done; }); const { view, button } = await setup(); fireEvent.click(button); view.unmount();
    await act(async () => resolve({ data: { id: "row-qa" }, error: null })); expect(events.success).not.toHaveBeenCalled(); expect(events.error).not.toHaveBeenCalled();
  });
}

it("department row from an old branch cannot be mutated from the new branch view", async () => {
  const view = render(<Departments />); await screen.findByRole("button", { name: "Toggle department status" }); await act(async () => { state.branch = "branch-b"; view.rerender(<Departments />); });
  fireEvent.click(screen.getByRole("button", { name: "Toggle department status" }));
  expect(events.update).not.toHaveBeenCalled(); expect(events.error).toHaveBeenCalledWith("The department is outside the current branch. Refresh the list.");
});
