import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Restore replays what the archive recorded. The database refuses to guess a clinic's
// before-state (RESTORE_BRANCH_SELECTION_REQUIRED / RESTORE_SUBSCRIPTION_STATUS_REQUIRED),
// so this dialog has to make the operator choose *before* the call, and say plainly when
// there is no recorded state to replay.

const state = vi.hoisted(() => ({
  lang: "en",
  rpc: { data: { restored: true, tenant_id: "tenant-1" } as unknown, error: null as unknown },
  pending: null as Promise<unknown> | null,
  rpcCalls: [] as { fn: string; args: unknown }[],
}));
const events = vi.hoisted(() => ({ toast: vi.fn(), close: vi.fn(), restored: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: events.toast }) }));
vi.mock("@/contexts/I18nContext", () => ({
  useI18n: () => ({ lang: state.lang, dir: state.lang === "ar" ? "rtl" : "ltr", t: (key: string) => key }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args });
      return state.pending ?? Promise.resolve(state.rpc);
    },
  },
}));

import { RestoreWorkspaceDialog } from "./RestoreWorkspaceDialog";
import type { Workspace, WorkspaceBranch } from "@/lib/platformWorkspaces";

const base = {
  id: "tenant-1",
  name: "Nile Physio",
  name_en: "Nile Physio",
  name_ar: "النيل للعلاج الطبيعي",
  slug: "nile-physio",
  subscription_status: "cancelled",
  is_active: false,
  is_archived: true,
  plan_id: "plan-1",
  trial_ends_at: null,
  subscription_ends_at: "2026-11-01T00:00:00.000Z",
  archived_at: "2026-11-01T00:00:00.000Z",
  archived_by: "owner-1",
  archive_reason: "contract ended",
  archive_snapshot: null,
  subscription_plans: null,
} as unknown as Workspace;

const snapshot = (over: Record<string, unknown>) => ({ version: 2, ...over }) as unknown as Workspace["archive_snapshot"];

const branches = [
  { id: "b1", tenant_id: "tenant-1", is_active: false, name_en: "Main", name_ar: "الرئيسي" },
  { id: "b2", tenant_id: "tenant-1", is_active: false, name_en: "Second", name_ar: "الثاني" },
  { id: "b9", tenant_id: "other", is_active: true, name_en: "Foreign", name_ar: "خارجي" },
] as unknown as WorkspaceBranch[];

const renderDialog = (workspace: Workspace, list: WorkspaceBranch[] = branches) =>
  render(
    <RestoreWorkspaceDialog
      workspace={workspace}
      branches={list}
      open
      onOpenChange={events.close}
      onRestored={events.restored}
    />,
  );

const confirmButton = () => screen.getByRole("button", { name: "Confirm restore" });
const statusSelect = () => screen.getByLabelText("Subscription status after restore") as unknown as HTMLSelectElement;
const reasonInput = () => screen.getByLabelText(/Restore reason/) as HTMLInputElement;
const checkbox = (name: string) => screen.getByRole("checkbox", { name });

beforeEach(() => {
  state.lang = "en";
  state.rpc = { data: { restored: true, tenant_id: "tenant-1" }, error: null };
  state.pending = null;
  state.rpcCalls = [];
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("restoring a workspace", () => {
  it("pre-selects exactly the branches the snapshot recorded active", () => {
    renderDialog({
      ...base,
      archive_snapshot: snapshot({
        tenant: { subscription_status: "past_due" },
        branches: [{ id: "b1", is_active: true }, { id: "b2", is_active: false }],
      }),
    });

    expect(checkbox("Main")).toBeChecked();
    expect(checkbox("Second")).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Foreign" })).not.toBeInTheDocument();
    expect(statusSelect().value).toBe("past_due");
    expect(confirmButton()).toBeEnabled();
  });

  it("falls back to the only branch when there is no snapshot", () => {
    renderDialog({ ...base, archive_snapshot: null }, [branches[0]]);
    expect(checkbox("Main")).toBeChecked();
    expect(screen.getByText("No recorded snapshot")).toBeInTheDocument();
  });

  it("makes the operator choose when there is neither a snapshot nor a single branch", () => {
    renderDialog({ ...base, archive_snapshot: null });

    expect(checkbox("Main")).not.toBeChecked();
    expect(checkbox("Second")).not.toBeChecked();
    expect(statusSelect().value).toBe("");
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByText("Select at least one branch")).toBeInTheDocument();
  });

  it("stays disabled until a branch and a status are both chosen", () => {
    renderDialog({ ...base, archive_snapshot: null });

    fireEvent.click(checkbox("Main"));
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(statusSelect(), { target: { value: "active" } });
    expect(confirmButton()).toBeEnabled();

    fireEvent.click(checkbox("Main"));
    expect(confirmButton()).toBeDisabled();
  });

  it("refuses to replay a status restore may not set", () => {
    // cancelled/expired is what the archive itself wrote; replaying it would be a no-op
    // dressed as a restore, so it is not offered and the operator must choose.
    renderDialog({
      ...base,
      archive_snapshot: snapshot({ tenant: { subscription_status: "cancelled" }, branches: [{ id: "b1", is_active: true }] }),
    });

    expect(statusSelect().value).toBe("");
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByRole("option", { name: "Trial" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Cancelled" })).not.toBeInTheDocument();
  });

  it("sends the chosen branches, the status and a null reason when none was given", async () => {
    renderDialog({
      ...base,
      archive_snapshot: snapshot({ tenant: { subscription_status: "active" }, branches: [{ id: "b1", is_active: true }] }),
    });
    fireEvent.change(reasonInput(), { target: { value: "  renewed  " } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(state.rpcCalls).toHaveLength(1));
    expect(state.rpcCalls[0]).toEqual({
      fn: "platform_restore_tenant",
      args: { p_tenant_id: "tenant-1", p_reason: "renewed", p_branch_ids: ["b1"], p_subscription_status: "active" },
    });
  });

  it("confirms, closes and refreshes on success", async () => {
    renderDialog({
      ...base,
      archive_snapshot: snapshot({ tenant: { subscription_status: "active" }, branches: [{ id: "b1", is_active: true }] }),
    });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(events.toast).toHaveBeenCalledWith({ title: "Workspace restored" }));
    expect(events.close).toHaveBeenCalledWith(false);
    expect(events.restored).toHaveBeenCalledOnce();
  });

  it("says a workspace was already live instead of claiming a restore", async () => {
    state.rpc = { data: { restored: false, already_active: true, tenant_id: "tenant-1" }, error: null };
    renderDialog({
      ...base,
      archive_snapshot: snapshot({ tenant: { subscription_status: "active" }, branches: [{ id: "b1", is_active: true }] }),
    });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(events.toast).toHaveBeenCalledWith({ title: "This workspace is already live" }));
  });

  it("turns the two server refusals into the operator's own sentence", async () => {
    const workspace = {
      ...base,
      archive_snapshot: snapshot({ tenant: { subscription_status: "active" }, branches: [{ id: "b1", is_active: true }] }),
    } as unknown as Workspace;

    state.rpc = { data: null, error: { code: "23514", message: "RESTORE_BRANCH_SELECTION_REQUIRED: name a branch" } };
    const first = renderDialog(workspace);
    fireEvent.click(confirmButton());
    await waitFor(() => expect(screen.getByText("Select at least one branch")).toBeInTheDocument());
    first.unmount();

    state.rpc = { data: null, error: { code: "23514", message: "RESTORE_SUBSCRIPTION_STATUS_REQUIRED: pass a status" } };
    renderDialog(workspace);
    fireEvent.click(confirmButton());
    await waitFor(() => expect(screen.getAllByText("Choose a subscription status").length).toBeGreaterThan(0));
    expect(events.toast).not.toHaveBeenCalled();
    expect(events.restored).not.toHaveBeenCalled();
  });

  it("translates any other refusal and never repeats the database's sentence", async () => {
    state.rpc = { data: null, error: { code: "42501", message: "permission denied for table tenants" } };
    renderDialog({
      ...base,
      archive_snapshot: snapshot({ tenant: { subscription_status: "active" }, branches: [{ id: "b1", is_active: true }] }),
    });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(screen.getByText("Your account is not allowed to make this change.")).toBeInTheDocument());
    expect(screen.queryByText(/permission denied for table tenants/)).not.toBeInTheDocument();
    expect(events.restored).not.toHaveBeenCalled();
  });

  it("suppresses a duplicate restore while the first is in flight", async () => {
    let resolve!: (value: unknown) => void;
    state.pending = new Promise((done) => { resolve = done; });
    renderDialog({
      ...base,
      archive_snapshot: snapshot({ tenant: { subscription_status: "active" }, branches: [{ id: "b1", is_active: true }] }),
    });
    const button = confirmButton();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(state.rpcCalls).toHaveLength(1);
    await waitFor(() => expect(button).toBeDisabled());
    resolve({ data: { restored: true, tenant_id: "tenant-1" }, error: null });
    await waitFor(() => expect(events.restored).toHaveBeenCalledOnce());
  });

  it("explains that a workspace with no branches cannot be restored", () => {
    renderDialog({ ...base, archive_snapshot: null }, []);
    expect(screen.getByText("A workspace with no branches cannot be restored. This one has no branch on record.")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
});
