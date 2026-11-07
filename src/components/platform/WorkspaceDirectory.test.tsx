import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// The directory is where "archived workspaces are hidden by default" has to be true, and
// where loading / empty / failed have to stay three different designed states: a failed
// read mistaken for an empty list is how an operator concludes a clinic was deleted.

const state = vi.hoisted(() => ({ lang: "en" as "ar" | "en" }));
const events = vi.hoisted(() => ({
  open: vi.fn(), health: vi.fn(), modules: vi.fn(), planTerm: vi.fn(), domains: vi.fn(),
  branding: vi.fn(), archive: vi.fn(), restore: vi.fn(), remove: vi.fn(),
  retry: vi.fn(), clear: vi.fn(), addClinic: vi.fn(), select: vi.fn(), changeView: vi.fn(),
}));

vi.mock("@/contexts/I18nContext", () => ({
  useI18n: () => ({ lang: state.lang, dir: state.lang === "ar" ? "rtl" : "ltr", t: (key: string) => key }),
}));
// The menu is opened by a pointer sequence jsdom does not run, so it is flattened: every
// item is a real button, which is what the assertions are about anyway.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, onClick, disabled }: { children: ReactNode; onSelect?: () => void; onClick?: () => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={onSelect ?? onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => null,
}));

import { WorkspaceKpis } from "./WorkspaceKpis";
import { WorkspaceTable, type BranchTally, type WorkspaceActions } from "./WorkspaceTable";
import { WorkspaceTabs } from "./WorkspaceTabs";
import type { Workspace, WorkspaceCounts } from "@/lib/platformWorkspaces";

const workspace = (over: Record<string, unknown> = {}) => ({
  id: "t1",
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
  subscription_plans: { id: "plan-1", name_ar: "الأساسية", name_en: "Essential", max_branches: 1, max_staff: 5 },
  ...over,
}) as unknown as Workspace;

const actions = (): WorkspaceActions => ({
  open: events.open, health: events.health, modules: events.modules, planTerm: events.planTerm,
  domains: events.domains, branding: events.branding, archive: events.archive,
  restore: events.restore, remove: events.remove,
});

const renderTable = (over: Partial<Parameters<typeof WorkspaceTable>[0]> = {}) =>
  render(
    <WorkspaceTable
      rows={[workspace()]}
      view="live"
      branches={new Map<string, BranchTally>([["t1", { total: 2, active: 1 }]])}
      actions={actions()}
      loading={false}
      failed={false}
      onRetry={events.retry}
      filtered={false}
      onClearFilters={events.clear}
      onAddClinic={events.addClinic}
      lifecycleReady
      {...over}
    />,
  );

beforeEach(() => {
  state.lang = "en";
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("the workspace ledger", () => {
  it("shows the plan, the status and the term on the live tab", () => {
    renderTable();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Term ends")).toBeInTheDocument();
    expect(screen.getByText("Essential")).toBeInTheDocument();
    expect(screen.queryByText("Archived on")).not.toBeInTheDocument();
  });

  it("swaps the live columns for the archive ledger on the archived tab", () => {
    renderTable({
      view: "archived",
      rows: [workspace({ is_archived: true, is_active: false, archived_at: "2026-11-01T00:00:00.000Z", archive_reason: "contract ended" })],
    });
    expect(screen.getByText("Archived on")).toBeInTheDocument();
    expect(screen.getByText("Archive reason")).toBeInTheDocument();
    expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    expect(screen.queryByText("Term ends")).not.toBeInTheDocument();
    expect(screen.getByText("contract ended")).toBeInTheDocument();
    // The archive ledger has one primary verb, and it is the way back.
    expect(screen.getByRole("button", { name: /Restore/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open workspace" })).not.toBeInTheDocument();
  });

  it("says a missing archive reason is missing rather than leaving the cell blank", () => {
    renderTable({
      view: "archived",
      rows: [workspace({ is_archived: true, is_active: false, archived_at: "2026-11-01T00:00:00.000Z", archive_reason: "   " })],
    });
    expect(screen.getByText("No reason recorded")).toBeInTheDocument();
  });

  it("cannot offer a restore that would fail for a workspace with no branches", () => {
    renderTable({
      view: "archived",
      rows: [workspace({ is_archived: true, is_active: false })],
      branches: new Map<string, BranchTally>(),
    });
    const restore = screen.getByRole("button", { name: /Restore/ });
    expect(restore).toBeDisabled();
    expect(restore).toHaveAttribute("title", "A workspace with no branches cannot be restored. This one has no branch on record.");
  });

  it("cannot offer to open a workspace with no active branch", () => {
    renderTable({ branches: new Map<string, BranchTally>([["t1", { total: 2, active: 0 }]]) });
    const open = screen.getByRole("button", { name: "Open workspace" });
    expect(open).toBeDisabled();
    expect(open).toHaveAttribute("title", "This workspace has no active branch");
  });

  it("withholds permanent delete until the archive ledger is applied", () => {
    renderTable({ lifecycleReady: false });
    expect(screen.getByRole("button", { name: "Permanent delete" })).toBeDisabled();
    cleanup();

    renderTable({ lifecycleReady: true });
    expect(screen.getByRole("button", { name: "Permanent delete" })).toBeEnabled();
  });

  it("never offers archiving from the archived tab", () => {
    renderTable({ view: "archived", rows: [workspace({ is_archived: true, is_active: false })] });
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plan & term" })).not.toBeInTheDocument();
    // Health, domains and branding are readable for an archived workspace, so they stay.
    expect(screen.getByRole("button", { name: "Health" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Domains" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Branding" })).toBeInTheDocument();
  });

  it("renders a failed read as a failure with a retry, never as an empty list", () => {
    renderTable({ failed: true, rows: [] });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Workspaces could not be loaded")).toBeInTheDocument();
    expect(screen.getByText(/stale/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(events.retry).toHaveBeenCalledOnce();
    expect(screen.queryByText("No workspaces yet")).not.toBeInTheDocument();
  });

  it("announces loading with the real table's geometry, not an empty state", () => {
    renderTable({ loading: true, rows: [] });
    expect(screen.getByRole("status")).toHaveTextContent("Loading workspaces");
    expect(screen.queryByText("No workspaces yet")).not.toBeInTheDocument();
  });

  it("distinguishes an empty archive, an empty filter and an empty product", () => {
    renderTable({ view: "archived", rows: [] });
    expect(screen.getByText("Nothing archived")).toBeInTheDocument();
    cleanup();

    renderTable({ rows: [], filtered: true });
    expect(screen.getByText("No workspaces match these filters")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(events.clear).toHaveBeenCalledOnce();
    cleanup();

    renderTable({ rows: [] });
    expect(screen.getByText("No workspaces yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add clinic" }));
    expect(events.addClinic).toHaveBeenCalledOnce();
  });
});

describe("the view switcher", () => {
  const counts: WorkspaceCounts = { live: 4, active: 3, needsReview: 1, archived: 2 };
  const renderTabs = (view: "live" | "archived" = "live") =>
    render(<WorkspaceTabs view={view} counts={counts} onChange={events.changeView} panelId="workspace-directory" />);

  it("marks the current view and counts both ledgers", () => {
    renderTabs();
    expect(screen.getByRole("tab", { name: /Live/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Archived/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /Live/ })).toHaveTextContent("4");
    expect(screen.getByRole("tab", { name: /Archived/ })).toHaveTextContent("2");
  });

  it("keeps the unselected tab out of the tab order", () => {
    renderTabs();
    expect(screen.getByRole("tab", { name: /Archived/ })).toHaveAttribute("tabindex", "-1");
  });

  it("moves with the arrow keys in the reading direction", () => {
    renderTabs();
    fireEvent.keyDown(screen.getByRole("tab", { name: /Live/ }), { key: "ArrowRight" });
    expect(events.changeView).toHaveBeenCalledWith("archived");
  });

  it("moves the other way in Arabic, where the reader starts on the right", () => {
    state.lang = "ar";
    renderTabs();
    fireEvent.keyDown(screen.getByRole("tab", { name: /القائمة/ }), { key: "ArrowRight" });
    expect(events.changeView).toHaveBeenCalledWith("archived");
  });
});

describe("the four figures", () => {
  const counts: WorkspaceCounts = { live: 9, active: 6, needsReview: 2, archived: 3 };
  const renderKpis = (over: Partial<Parameters<typeof WorkspaceKpis>[0]> = {}) =>
    render(
      <WorkspaceKpis counts={counts} view="live" status="all" onSelect={events.select} loading={false} {...over} />,
    );

  it("prints each measured head count once", () => {
    renderKpis();
    expect(screen.getByRole("button", { name: /Live workspaces/ })).toHaveTextContent("9");
    expect(screen.getByRole("button", { name: /Active subscription/ })).toHaveTextContent("6");
    expect(screen.getByRole("button", { name: /Needs review/ })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /Archived/ })).toHaveTextContent("3");
  });

  it("is the filter that produces its own number", () => {
    renderKpis();
    fireEvent.click(screen.getByRole("button", { name: /Needs review/ }));
    expect(events.select).toHaveBeenCalledWith("live", "needs_review");

    fireEvent.click(screen.getByRole("button", { name: /Archived/ }));
    expect(events.select).toHaveBeenCalledWith("archived", "all");
  });

  it("marks exactly the selected cell", () => {
    renderKpis({ status: "active" });
    const pressed = screen.getAllByRole("button").filter((button) => button.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent("Active subscription");
  });

  it("shows no figure at all while the counts are still unknown", () => {
    renderKpis({ loading: true });
    for (const button of screen.getAllByRole("button")) expect(button).toHaveTextContent("—");
  });
});
