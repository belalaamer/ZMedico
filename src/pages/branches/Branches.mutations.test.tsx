import { cleanup, fireEvent, render, screen, waitFor, within, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
const mocks = vi.hoisted(() => ({ remove: vi.fn(), archive: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/dataSync", () => ({ useDataSync: () => undefined }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", t: (key: string) => key }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "actor" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isSystemOwner: true }) }));
vi.mock("@/contexts/BranchContext", () => ({ useBranch: () => ({ currentBranchId: null, subscription: null, subscriptionLoading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/LocationMap", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...args: unknown[]) => mocks.archive(...args),
  from: (table: string) => ({
    select: () => ({ order: () => Promise.resolve({ data: table === "branches" ? [{ id: "branch", name_en: "Demo branch", name_ar: "فرع", tenant_id: "tenant", is_active: true, is_main_branch: false, working_days: [1], working_hours_start: "09:00", working_hours_end: "17:00" }] : [], error: null }) }),
    delete: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => mocks.remove() }) }) }),
  }),
} }));
import Branches from "./Branches";
beforeEach(() => { vi.clearAllMocks(); mocks.remove.mockResolvedValue({ data: null, error: { code: "23503" } }); mocks.archive.mockResolvedValue({ data: { success: true }, error: null }); });
afterEach(cleanup);
async function openDelete() {
  render(<MemoryRouter><Branches /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Delete branch Demo branch" }));
  return screen.getByRole("alertdialog");
}
async function showArchive() {
  const dialog = await openDelete();
  fireEvent.click(within(dialog).getByRole("button", { name: "delete" }));
  return screen.findByRole("button", { name: "Archive" });
}
it("keeps the real confirmation dialog open for linked-record archival", async () => {
  await showArchive();
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  expect(mocks.archive).not.toHaveBeenCalled();
});
it("does not misclassify permission failures as linked records", async () => {
  mocks.remove.mockResolvedValue({ data: null, error: { code: "42501", message: "private policy" } });
  const dialog = await openDelete(); fireEvent.click(within(dialog).getByRole("button", { name: "delete" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "You do not have permission for this action" })));
  expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
});
it("rejects zero-row delete acknowledgements", async () => {
  mocks.remove.mockResolvedValue({ data: null, error: null });
  const dialog = await openDelete(); fireEvent.click(within(dialog).getByRole("button", { name: "delete" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "The branch is missing or no longer accessible" })));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
});
it("blocks double archive submissions and closes only after confirmed success", async () => {
  let finish!: (value: unknown) => void;
  mocks.archive.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const archive = await showArchive(); fireEvent.click(archive); fireEvent.click(archive);
  expect(mocks.archive).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  await act(async () => { finish({ data: { success: true }, error: null }); });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});
it("recovers after a rejected archive request and allows retry", async () => {
  mocks.archive.mockRejectedValueOnce(new Error("private network stack"));
  fireEvent.click(await showArchive());
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "The branch could not be archived. Try again." })));
  fireEvent.click(screen.getByRole("button", { name: "Archive" }));
  await waitFor(() => expect(mocks.archive).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});
it("keeps the archive dialog available after the final-active constraint", async () => {
  mocks.archive.mockResolvedValue({ data: null, error: { code: "23514", message: "private constraint" } });
  fireEvent.click(await showArchive());
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "The final active branch cannot be archived" })));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
});
it("does not acknowledge an unsuccessful archive payload", async () => {
  mocks.archive.mockResolvedValue({ data: { success: false }, error: null });
  fireEvent.click(await showArchive());
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "The branch could not be archived. Try again." })));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
});
