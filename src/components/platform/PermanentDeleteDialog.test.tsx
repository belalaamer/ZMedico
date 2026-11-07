import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Deletion is decided by the database, not by this dialog. The assessment walks the
// foreign-key graph and returns a verdict; the dialog only renders it and refuses to
// offer the button the server would refuse. These tests pin that: no verdict, no button —
// and a blocker always arrives with a named way forward.

const state = vi.hoisted(() => ({
  lang: "en",
  responses: {} as Record<string, { data: unknown; error: unknown; pending?: Promise<unknown> | null }>,
  rpcCalls: [] as { fn: string; args: unknown }[],
}));
const events = vi.hoisted(() => ({
  toast: vi.fn(),
  close: vi.fn(),
  deleted: vi.fn(),
  archive: vi.fn(),
  domains: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: events.toast }) }));
vi.mock("@/contexts/I18nContext", () => ({
  useI18n: () => ({ lang: state.lang, dir: state.lang === "ar" ? "rtl" : "ltr", t: (key: string) => key }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args });
      const response = state.responses[fn] ?? { data: null, error: null };
      return response.pending ?? Promise.resolve({ data: response.data, error: response.error });
    },
  },
}));

import { PermanentDeleteDialog } from "./PermanentDeleteDialog";
import type { Workspace } from "@/lib/platformWorkspaces";

const workspace = {
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
  archive_snapshot: { version: 2 },
  subscription_plans: null,
} as unknown as Workspace;

const baseAssessment = {
  tenant_id: "tenant-1",
  slug: "nile-physio",
  name: "النيل للعلاج الطبيعي",
  is_archived: true,
  archived_at: "2026-11-01T00:00:00.000Z",
  subscription_status: "cancelled",
  branch_count: 1,
  verdict: "DELETABLE",
  walk_levels: 4,
  walk_stopped: false,
  tables_measured: 31,
  edges_walked: 44,
  blockers: [] as unknown[],
  erased: [{ table: "tenant_branding", rows: 1, rank: 3, depth: 1 }],
  survivors: [{ table: "audit_logs", rows: 4, depth: 2 }],
  confirm_value: "nile-physio",
};

const assessWith = (over: Record<string, unknown>) => ({ ...baseAssessment, ...over });
const receipt = {
  deleted: true,
  tenant_id: "tenant-1",
  slug: "nile-physio",
  receipt_id: "receipt-9",
  branch_count: 1,
  erased: [{ table: "tenant_branding", rows: 1, rank: 3 }],
  survivors: [{ table: "audit_logs", rows: 4 }],
  change_log_rows_kept: 3,
  reason: "duplicate trial",
};

const renderDialog = () =>
  render(
    <PermanentDeleteDialog
      workspace={workspace}
      open
      onOpenChange={events.close}
      onDeleted={events.deleted}
      onArchive={events.archive}
      onOpenDomains={events.domains}
    />,
  );

const deleteButton = () => screen.queryByRole("button", { name: "Delete permanently" });
const confirmInput = () => screen.getByLabelText(/Type the slug exactly as shown to confirm/) as HTMLInputElement;
const reasonInput = () => screen.getByLabelText(/Deletion reason/) as HTMLInputElement;
const assessCalls = () => state.rpcCalls.filter((call) => call.fn === "platform_workspace_delete_assess");

beforeEach(() => {
  state.lang = "en";
  state.responses = {
    platform_workspace_delete_assess: { data: assessWith({}), error: null },
    platform_permanent_delete_tenant: { data: receipt, error: null },
  };
  state.rpcCalls = [];
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("permanent deletion is gated by the assessment", () => {
  it("asks the database first and shows the plan it proved", async () => {
    renderDialog();

    await waitFor(() => expect(assessCalls()).toHaveLength(1));
    expect(assessCalls()[0].args).toEqual({ p_tenant_id: "tenant-1" });
    expect(await screen.findByText("This workspace can be permanently deleted")).toBeInTheDocument();
    expect(screen.getByText("Will be erased")).toBeInTheDocument();
    expect(screen.getByText("Branding")).toBeInTheDocument();
    expect(screen.getByText("Kept on purpose")).toBeInTheDocument();
    expect(screen.getByText("Audit trail")).toBeInTheDocument();
    expect(deleteButton()).toBeInTheDocument();
  });

  it("offers archiving instead when the workspace was never archived", async () => {
    state.responses.platform_workspace_delete_assess = { data: assessWith({ verdict: "NEEDS_ARCHIVE" }), error: null };
    renderDialog();

    const archive = await screen.findByRole("button", { name: "Archive first" });
    expect(deleteButton()).not.toBeInTheDocument();

    fireEvent.click(archive);
    expect(events.close).toHaveBeenCalledWith(false);
    expect(events.archive).toHaveBeenCalledWith(workspace);
  });

  it("renders every blocker as a named fact with a way forward, and never the delete button", async () => {
    state.responses.platform_workspace_delete_assess = {
      data: assessWith({
        verdict: "BLOCKED",
        blockers: [
          { table: "invoices", rows: 12, code: "DATA_invoices", reason: "Invoices exist — the clinic has issued bills.", action: "archive", depth: 2 },
          { table: "mystery_table", rows: null, code: "SCOPE_UNMEASURABLE", reason: "not counted", action: "archive", depth: 1 },
        ],
      }),
      error: null,
    };
    renderDialog();

    expect(await screen.findByText("Permanent deletion is not possible")).toBeInTheDocument();
    expect(deleteButton()).not.toBeInTheDocument();
    expect(screen.getByText("What blocks deletion")).toBeInTheDocument();
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.getByText("12 rows")).toBeInTheDocument();
    expect(screen.getByText(/Invoices exist/)).toBeInTheDocument();
    // An unmeasured table is disclosed as unmeasured, and still named by its identifier
    // (once as the label fallback, once as the mono identifier the database will touch).
    expect(screen.getAllByText("mystery_table")).toHaveLength(2);
    expect(screen.getByText("not measured")).toBeInTheDocument();
    expect(screen.getAllByText("Archiving is the right action").length).toBe(2);
  });

  it("re-assesses from the dialog instead of making the operator reopen it", async () => {
    state.responses.platform_workspace_delete_assess = {
      data: assessWith({ verdict: "BLOCKED", blockers: [{ table: "invoices", rows: 1, code: "DATA_invoices", reason: "x", action: "archive", depth: 2 }] }),
      error: null,
    };
    renderDialog();

    const again = await screen.findByRole("button", { name: "Assess again" });
    expect(assessCalls()).toHaveLength(1);
    fireEvent.click(again);
    await waitFor(() => expect(assessCalls()).toHaveLength(2));
  });

  it("offers the domains panel when a provider hostname is what blocks the delete", async () => {
    state.responses.platform_workspace_delete_assess = {
      data: assessWith({
        verdict: "BLOCKED",
        blockers: [{ table: "tenant_domains", rows: 1, code: "PROVIDER_HOSTNAME_ATTACHED", reason: "hostname attached", action: "domains", depth: 1 }],
      }),
      error: null,
    };
    renderDialog();

    const open = await screen.findByRole("button", { name: "Open domains" });
    expect(screen.getByText("Remove the domain in the Domains panel")).toBeInTheDocument();
    fireEvent.click(open);
    expect(events.close).toHaveBeenCalledWith(false);
    expect(events.domains).toHaveBeenCalledWith(workspace);
  });

  it("blocks as a precaution when the walk hit its depth limit", async () => {
    state.responses.platform_workspace_delete_assess = {
      data: assessWith({ walk_stopped: true, walk_levels: 12 }),
      error: null,
    };
    renderDialog();

    expect(await screen.findByText("The walk hit its depth limit, so deletion is blocked as a precaution.")).toBeInTheDocument();
    expect(deleteButton()).not.toBeInTheDocument();
  });

  it("surfaces a failed assessment as a failure, not as an empty workspace", async () => {
    state.responses.platform_workspace_delete_assess = { data: null, error: { code: "42501", message: "permission denied" } };
    renderDialog();

    expect(await screen.findByText("Your account is not allowed to make this change.")).toBeInTheDocument();
    expect(screen.queryByText(/permission denied/)).not.toBeInTheDocument();
    expect(deleteButton()).not.toBeInTheDocument();

    state.responses.platform_workspace_delete_assess = { data: assessWith({}), error: null };
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("This workspace can be permanently deleted")).toBeInTheDocument());
  });
});

describe("the delete itself", () => {
  const openDeletable = async () => {
    renderDialog();
    await screen.findByText("This workspace can be permanently deleted");
  };

  it("will not fire until the live slug is typed exactly", async () => {
    await openDeletable();
    expect(deleteButton()).toBeDisabled();

    fireEvent.change(confirmInput(), { target: { value: "nile" } });
    expect(deleteButton()).toBeDisabled();
    expect(screen.getByText("The slug you typed does not match this workspace. Type it exactly as shown.")).toBeInTheDocument();

    fireEvent.change(confirmInput(), { target: { value: "nile-physio" } });
    expect(deleteButton()).toBeEnabled();
  });

  it("sends the tenant, the typed slug and the trimmed reason", async () => {
    await openDeletable();
    fireEvent.change(confirmInput(), { target: { value: "nile-physio" } });
    fireEvent.change(reasonInput(), { target: { value: "  duplicate trial  " } });
    fireEvent.click(deleteButton()!);

    await waitFor(() => expect(state.rpcCalls.some((call) => call.fn === "platform_permanent_delete_tenant")).toBe(true));
    const call = state.rpcCalls.find((item) => item.fn === "platform_permanent_delete_tenant");
    expect(call?.args).toEqual({ p_tenant_id: "tenant-1", p_confirm_slug: "nile-physio", p_reason: "duplicate trial" });
  });

  it("shows the receipt it was given and refreshes the directory", async () => {
    await openDeletable();
    fireEvent.change(confirmInput(), { target: { value: "nile-physio" } });
    fireEvent.click(deleteButton()!);

    expect(await screen.findByText("Deletion receipt")).toBeInTheDocument();
    expect(screen.getByText("receipt-9")).toBeInTheDocument();
    expect(screen.getByText("change-log rows kept")).toBeInTheDocument();
    expect(screen.getByText("Will be erased")).toBeInTheDocument();
    expect(screen.getByText("Branding")).toBeInTheDocument();
    expect(deleteButton()).not.toBeInTheDocument();
    expect(events.toast).toHaveBeenCalledWith({ title: "Workspace permanently deleted" });
    expect(events.deleted).toHaveBeenCalledOnce();
    // A receipt is a record, not a dismissal: the dialog stays open until it is closed.
    expect(events.close).not.toHaveBeenCalled();
    // The stock dialog contributes its own icon-only "Close"; the footer's is the first.
    const closes = screen.getAllByRole("button", { name: "Close" });
    expect(closes.length).toBeGreaterThan(0);
    fireEvent.click(closes[0]);
    expect(events.close).toHaveBeenCalledWith(false);
  });

  it("translates the four refusals the engine raises", async () => {
    const cases: Array<[string, string]> = [
      ["PERMANENT_DELETE_SLUG_MISMATCH: type the slug", "The slug you typed does not match this workspace. Type it exactly as shown."],
      ["PERMANENT_DELETE_ARCHIVE_FIRST: archive first", "Permanent deletion is available for archived workspaces only. Archive it first."],
      ["PERMANENT_DELETE_DRIFT: measured 1 removed 0", "The data changed during deletion, so the whole operation was rolled back and no row was deleted. Assess again, then retry."],
    ];

    for (const [message, expected] of cases) {
      state.responses.platform_permanent_delete_tenant = { data: null, error: { code: "23514", message } };
      const view = renderDialog();
      await screen.findByText("This workspace can be permanently deleted");
      fireEvent.change(confirmInput(), { target: { value: "nile-physio" } });
      fireEvent.click(deleteButton()!);
      await waitFor(() => expect(screen.getByText(expected)).toBeInTheDocument());
      expect(screen.queryByText(new RegExp(message.split(":")[0]))).not.toBeInTheDocument();
      view.unmount();
    }
    expect(events.deleted).not.toHaveBeenCalled();
    expect(events.toast).not.toHaveBeenCalled();
  });

  it("re-assesses when the engine reports the workspace changed under it", async () => {
    state.responses.platform_permanent_delete_tenant = {
      data: null,
      error: { code: "40001", message: "PERMANENT_DELETE_BLOCKED: the workspace changed during deletion" },
    };
    await openDeletable();
    expect(assessCalls()).toHaveLength(1);

    fireEvent.change(confirmInput(), { target: { value: "nile-physio" } });
    fireEvent.click(deleteButton()!);

    await waitFor(() => expect(assessCalls()).toHaveLength(2));
    expect(screen.getByText("Permanent deletion is not possible")).toBeInTheDocument();
    expect(events.deleted).not.toHaveBeenCalled();
  });

  it("treats a response without a confirmed deletion as a failure", async () => {
    state.responses.platform_permanent_delete_tenant = { data: { deleted: false, receipt_id: "" }, error: null };
    await openDeletable();
    fireEvent.change(confirmInput(), { target: { value: "nile-physio" } });
    fireEvent.click(deleteButton()!);

    await waitFor(() => expect(events.toast).not.toHaveBeenCalled());
    expect(screen.queryByText("Deletion receipt")).not.toBeInTheDocument();
    expect(events.deleted).not.toHaveBeenCalled();
  });

  it("suppresses a duplicate delete while the first is in flight", async () => {
    let resolve!: (value: unknown) => void;
    state.responses.platform_permanent_delete_tenant = { data: null, error: null, pending: new Promise((done) => { resolve = done; }) };
    await openDeletable();
    fireEvent.change(confirmInput(), { target: { value: "nile-physio" } });

    const button = deleteButton()!;
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(state.rpcCalls.filter((call) => call.fn === "platform_permanent_delete_tenant")).toHaveLength(1);
    resolve({ data: receipt, error: null });
    await waitFor(() => expect(events.deleted).toHaveBeenCalledOnce());
  });
});
