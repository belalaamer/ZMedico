import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Archiving is reversible, so the gate is a typed slug rather than a scare — but it is
// still a gate: the button must not be reachable until the operator has named the
// workspace, the reason must reach the server verbatim, and a refusal must never put
// Postgres' own sentence in front of the operator.

const state = vi.hoisted(() => ({
  lang: "en",
  rpc: { data: { archived: true } as unknown, error: null as unknown },
  pending: null as Promise<unknown> | null,
  rpcCalls: [] as { fn: string; args: unknown }[],
}));
const events = vi.hoisted(() => ({ toast: vi.fn(), close: vi.fn(), archived: vi.fn() }));

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

import { ArchiveWorkspaceDialog } from "./ArchiveWorkspaceDialog";
import type { Workspace } from "@/lib/platformWorkspaces";

const workspace = {
  id: "tenant-1",
  name: "Nile Physio",
  name_en: "Nile Physio",
  name_ar: "النيل للعلاج الطبيعي",
  slug: "nile-physio",
  subscription_status: "active",
  is_active: true,
  is_archived: false,
  plan_id: "plan-1",
  trial_ends_at: null,
  subscription_ends_at: "2026-12-01T00:00:00.000Z",
  archived_at: null,
  archived_by: null,
  archive_reason: null,
  archive_snapshot: null,
  subscription_plans: null,
} as unknown as Workspace;

const renderDialog = (open = true) =>
  render(
    <ArchiveWorkspaceDialog
      workspace={workspace}
      open={open}
      onOpenChange={events.close}
      onArchived={events.archived}
    />,
  );

const confirmButton = () => screen.getByRole("button", { name: "Confirm archive" });
const slugInput = () => screen.getByLabelText(/Type the workspace slug to confirm/);
const reasonInput = () => screen.getByLabelText(/Archive reason/);

beforeEach(() => {
  state.lang = "en";
  state.rpc = { data: { archived: true }, error: null };
  state.pending = null;
  state.rpcCalls = [];
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("archiving a workspace", () => {
  it("will not fire until the slug is typed exactly", () => {
    renderDialog();
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(slugInput(), { target: { value: "nile" } });
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(slugInput(), { target: { value: "nile-physio" } });
    expect(confirmButton()).toBeEnabled();
  });

  it("accepts the slug the way the server does — trimmed and case-insensitive", () => {
    renderDialog();
    fireEvent.change(slugInput(), { target: { value: "  NILE-PHYSIO " } });
    expect(confirmButton()).toBeEnabled();
  });

  it("sends the tenant and the trimmed reason, and nothing else", async () => {
    renderDialog();
    fireEvent.change(reasonInput(), { target: { value: "  contract ended  " } });
    fireEvent.change(slugInput(), { target: { value: "nile-physio" } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(state.rpcCalls).toHaveLength(1));
    expect(state.rpcCalls[0]).toEqual({
      fn: "platform_archive_tenant",
      args: { p_tenant_id: "tenant-1", p_reason: "contract ended" },
    });
  });

  it("sends null rather than an empty string when no reason was given", async () => {
    renderDialog();
    fireEvent.change(slugInput(), { target: { value: "nile-physio" } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(state.rpcCalls).toHaveLength(1));
    expect(state.rpcCalls[0].args).toEqual({ p_tenant_id: "tenant-1", p_reason: null });
  });

  it("confirms, closes and refreshes the directory on success", async () => {
    renderDialog();
    fireEvent.change(slugInput(), { target: { value: "nile-physio" } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(events.toast).toHaveBeenCalledWith({ title: "Workspace archived" }));
    expect(events.close).toHaveBeenCalledWith(false);
    expect(events.archived).toHaveBeenCalledOnce();
  });

  it("translates a refusal and never repeats the database's sentence", async () => {
    state.rpc = { data: null, error: { code: "42501", message: "permission denied for table tenants" } };
    renderDialog();
    fireEvent.change(slugInput(), { target: { value: "nile-physio" } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(screen.getByText("Your account is not allowed to make this change.")).toBeInTheDocument());
    expect(screen.queryByText(/permission denied for table tenants/)).not.toBeInTheDocument();
    expect(events.toast).not.toHaveBeenCalled();
    expect(events.close).not.toHaveBeenCalled();
    expect(events.archived).not.toHaveBeenCalled();
  });

  it("keeps the screen's own sentence for a failure the tables do not know", async () => {
    state.rpc = { data: null, error: { code: "XX000", message: "internal error" } };
    renderDialog();
    fireEvent.change(slugInput(), { target: { value: "nile-physio" } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(screen.getByText("Workspace could not be archived")).toBeInTheDocument());
    expect(screen.queryByText(/internal error/)).not.toBeInTheDocument();
  });

  it("suppresses a duplicate archive while the first is in flight", async () => {
    let resolve!: (value: unknown) => void;
    state.pending = new Promise((done) => { resolve = done; });
    renderDialog();
    fireEvent.change(slugInput(), { target: { value: "nile-physio" } });
    const button = confirmButton();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(state.rpcCalls).toHaveLength(1);
    await waitFor(() => expect(button).toBeDisabled());
    resolve({ data: { archived: true }, error: null });
    await waitFor(() => expect(events.archived).toHaveBeenCalledOnce());
  });

  it("forgets the previous attempt when it is reopened", () => {
    const view = renderDialog();
    fireEvent.change(reasonInput(), { target: { value: "ended" } });
    fireEvent.change(slugInput(), { target: { value: "nile-physio" } });

    view.rerender(
      <ArchiveWorkspaceDialog workspace={workspace} open={false} onOpenChange={events.close} onArchived={events.archived} />,
    );
    view.rerender(
      <ArchiveWorkspaceDialog workspace={workspace} open onOpenChange={events.close} onArchived={events.archived} />,
    );

    expect((slugInput() as HTMLInputElement).value).toBe("");
    expect((reasonInput() as HTMLTextAreaElement).value).toBe("");
    expect(confirmButton()).toBeDisabled();
  });

  it("names the workspace it is about", () => {
    renderDialog();
    expect(screen.getByText("Nile Physio")).toBeInTheDocument();
    expect(screen.getByText("nile-physio")).toBeInTheDocument();
  });
});
