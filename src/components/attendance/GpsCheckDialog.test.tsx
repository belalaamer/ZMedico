import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ locate: vi.fn() }));
vi.mock("@/lib/geo", async (original) => ({ ...await original<object>(), getCurrentLocation: mocks.locate }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", t: (key: string) => key }) }));
vi.mock("@/components/LocationMap", () => ({ default: () => <div>map</div> }));
vi.mock("@/components/ui/dialog", () => {
  const Wrap = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Dialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children: ReactNode }) => open && <div><button onClick={() => onOpenChange(false)}>dismiss</button>{children}</div>, DialogContent: Wrap, DialogFooter: Wrap, DialogHeader: Wrap, DialogTitle: Wrap };
});
import GpsCheckDialog from "./GpsCheckDialog";
const branch = { id: "b", name_en: "Clinic", name_ar: "Clinic", allowed_latitude: 0, allowed_longitude: 0, allowed_radius: 100 };
beforeEach(() => { vi.clearAllMocks(); mocks.locate.mockResolvedValue({ lat: 0, lon: 0 }); });
afterEach(cleanup);
it("does not round an outside-radius position into the allowed zone", async () => {
  mocks.locate.mockResolvedValue({ lat: (100.4 / 6371000) * (180 / Math.PI), lon: 0 });
  render(<GpsCheckDialog open mode="in" branch={branch} onClose={vi.fn()} onConfirm={vi.fn()} />);
  await screen.findByText("outsideAllowedZone");
  expect(screen.getByRole("button", { name: "checkIn" })).toBeDisabled();
});
it("ignores an old location response after switching branches", async () => {
  let oldResult!: (value: { lat: number; lon: number }) => void;
  mocks.locate.mockReturnValueOnce(new Promise(resolve => { oldResult = resolve; }))
    .mockResolvedValueOnce({ lat: 0, lon: 0 });
  const props = { open: true, mode: "in" as const, onClose: vi.fn(), onConfirm: vi.fn() };
  const view = render(<GpsCheckDialog {...props} branch={branch} />);
  view.rerender(<GpsCheckDialog {...props} branch={{ ...branch, id: "second" }} />);
  await screen.findByText("withinAllowedZone");
  await act(async () => oldResult({ lat: 1, lon: 0 }));
  expect(screen.getByText("withinAllowedZone")).toBeInTheDocument();
  expect(screen.queryByText("outsideAllowedZone")).not.toBeInTheDocument();
});
it("keeps zero coordinates subject to radius validation", async () => {
  mocks.locate.mockResolvedValue({ lat: 1, lon: 0 });
  const confirm = vi.fn();
  render(<GpsCheckDialog open mode="in" branch={branch} onClose={vi.fn()} onConfirm={confirm} />);
  await screen.findByText("outsideAllowedZone");
  expect(screen.getByRole("button", { name: "checkIn" })).toBeDisabled();
  expect(confirm).not.toHaveBeenCalled();
});
it("blocks duplicate save and dismissal while waiting", async () => {
  let finish!: () => void;
  const confirm = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const close = vi.fn();
  render(<GpsCheckDialog open mode="in" branch={branch} onClose={close} onConfirm={confirm} />);
  await screen.findByText("withinAllowedZone");
  const save = screen.getByRole("button", { name: "checkIn" });
  fireEvent.click(save); fireEvent.click(save); fireEvent.click(screen.getByText("dismiss"));
  expect(confirm).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(close).toHaveBeenCalledTimes(1);
});
it("retains dialog and releases save lock after rejection", async () => {
  const close = vi.fn();
  render(<GpsCheckDialog open mode="in" branch={branch} onClose={close} onConfirm={vi.fn().mockRejectedValue(new Error("network"))} />);
  await screen.findByText("withinAllowedZone");
  fireEvent.click(screen.getByRole("button", { name: "checkIn" }));
  await screen.findByText(/Could not confirm the save/);
  expect(close).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "checkIn" })).not.toBeDisabled());
});
