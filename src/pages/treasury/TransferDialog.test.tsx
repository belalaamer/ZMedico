import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TransferDialog } from "./TransferDialog";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (s: string) => s, lang: "en" }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user" } }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: { children: ReactNode; value: string; onValueChange: (v: string) => void; disabled?: boolean }) => (
    <select value={value} disabled={disabled} onChange={(e) => onValueChange(e.target.value)}><option value="" />{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));

type Result = { error: null | { message: string; code?: string } };
function deferred() {
  let resolve!: (v: Result) => void;
  const promise = new Promise<Result>((r) => { resolve = r; });
  return { promise, resolve };
}
function setup(destinationCurrency = "EGP") {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  const treasuries = [
    { id: "source", name_en: "Source", name_ar: "مصدر", current_balance: 100, currency: "EGP" },
    { id: "destination", name_en: "Destination", name_ar: "وجهة", current_balance: 0, currency: destinationCurrency },
  ];
  const view = render(<TransferDialog open onSaved={onSaved} onOpenChange={onOpenChange} treasuries={treasuries} />);
  fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "source" } });
  fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "destination" } });
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "10" } });
  return { onSaved, onOpenChange, confirm: screen.getByRole("button", { name: "confirm" }), updateBalance: (balance: number) => view.rerender(<TransferDialog open onSaved={onSaved} onOpenChange={onOpenChange} treasuries={[{ ...treasuries[0], current_balance: balance }, treasuries[1]]} />) };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("crypto", { randomUUID: () => "transfer-reference" });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("atomic treasury transfer", () => {
  it("rejects new transfers beyond available cash before sending any RPC", () => {
    const { confirm, onSaved } = setup();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '101' } });
    fireEvent.click(confirm);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith('Available cash is insufficient for this transfer.');
  });
  it("can reconcile a lost-response request after its debit exhausted displayed cash", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({ error: null });
    const { confirm, onSaved, updateBalance } = setup();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '100' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    updateBalance(0);
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[1][1]).toEqual(mocks.rpc.mock.calls[0][1]);
  });
  it.each(["USD", ""])("rejects mismatched or unknown destination currency before RPC: %s", currency => {
    const { confirm, onSaved } = setup(currency);
    fireEvent.click(confirm);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("Transfers require two treasuries with the same currency.");
    expect(confirm).not.toBeDisabled();
  });
  it("holds the submit lock and prevents dismissal until the atomic RPC finishes", async () => {
    const transfer = deferred();
    mocks.rpc.mockReturnValueOnce(transfer.promise);
    const { confirm, onOpenChange, onSaved } = setup();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    transfer.resolve({ error: null });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it("uses one idempotency-keyed RPC instead of separate debit and credit calls", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: null });
    const { confirm, onSaved } = setup();
    fireEvent.click(confirm);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("transfer_treasury_funds", {
      p_from_treasury_id: "source",
      p_to_treasury_id: "destination",
      p_amount: 10,
      p_reference_id: "transfer-reference",
      p_note: null,
    });
  });

  it("completes exactly one transfer under repeated clicks", async () => {
    const transfer = deferred();
    mocks.rpc.mockReturnValueOnce(transfer.promise);
    const { confirm, onSaved } = setup();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    transfer.resolve({ error: null });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("releases busy state after a thrown transport error without reporting success", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce({ error: null });
    const { confirm, onSaved } = setup();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    expect(confirm).not.toBeDisabled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole("spinbutton")).toHaveValue(10);
    fireEvent.click(confirm);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0][1].p_reference_id).toBe("transfer-reference");
    expect(mocks.rpc.mock.calls[1][1].p_reference_id).toBe("transfer-reference");
  });

  it("reports a rejected atomic transfer without claiming success", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { message: "denied", code: "42501" } });
    const { confirm, onSaved } = setup();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(confirm).not.toBeDisabled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
