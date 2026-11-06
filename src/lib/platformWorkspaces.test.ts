import { beforeEach, describe, expect, it, vi } from "vitest";

// The console's directory is one PostgREST logic tree per request, and the same
// boolean has two spellings: the archive ledger's generated column, or the legacy
// `inactive AND cancelled/expired` shape for a database that has not taken
// 20261106120000 yet. These tests pin both spellings and the derivation that makes
// the second one behave like the first, because the two must never drift.

const state = vi.hoisted(() => ({
  directory: { data: [] as unknown[], error: null as unknown, count: 0 },
  branches: { data: [] as unknown[], error: null as unknown },
  rpc: { data: null as unknown, error: null as unknown },
  counts: {} as Record<string, number>,
  calls: [] as string[],
  rpcCalls: [] as { fn: string; args: unknown }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const log: string[] = [];
    const chain: Record<string, unknown> = {};
    const record = (entry: string) => {
      log.push(entry);
      state.calls.push(`${table}:${entry}`);
    };
    chain.select = (columns: unknown) => { record(`select:${String(columns)}`); return chain; };
    chain.or = (filter: unknown) => { record(`or:${String(filter)}`); return chain; };
    chain.eq = (column: unknown, value: unknown) => { record(`eq:${String(column)}=${String(value)}`); return chain; };
    chain.order = (column: unknown) => { record(`order:${String(column)}`); return chain; };
    chain.range = (start: unknown, end: unknown) => { record(`range:${String(start)}-${String(end)}`); return chain; };
    chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
      let payload: unknown;
      if (table !== "tenants") {
        payload = state.branches;
      } else if (log.some((entry) => entry.startsWith("range:"))) {
        payload = state.directory;
      } else {
        const filter = log.find((entry) => entry.startsWith("or:"))?.slice(3) ?? "";
        payload = { count: state.counts[filter] ?? 0, error: null };
      }
      return Promise.resolve(payload).then(resolve, reject);
    };
    return chain;
  };
  const rpc = (fn: string, args: unknown) => {
    state.rpcCalls.push({ fn, args });
    return Promise.resolve(state.rpc);
  };
  return { supabase: { from, rpc } };
});

import {
  ARCHIVE_COLUMNS,
  RESTORE_STATUSES,
  SUBSCRIPTION_STATUSES,
  WORKSPACE_PAGE_SIZE,
  activeTree,
  archivedTree,
  assessWorkspaceDelete,
  directoryTree,
  fetchWorkspaceBranches,
  fetchWorkspaceCounts,
  fetchWorkspaces,
  isMissingArchiveColumn,
  liveTree,
  needsReviewTree,
  parseAssessment,
  parseReceipt,
  parseRestoreResult,
  permanentlyDeleteWorkspace,
  recordedActiveBranchIds,
  recordedSubscriptionStatus,
  restoreWorkspace,
  reviewTree,
  reviewWindowEnd,
  slugConfirmed,
  snapshotOf,
} from "./platformWorkspaces";

const LEGACY_ARCHIVED = "and(is_active.eq.false,subscription_status.in.(cancelled,expired))";
const REVIEW_BEFORE = "2026-11-13T00:00:00.000Z";

const query = (over: Partial<Parameters<typeof directoryTree>[0]> = {}) => ({
  view: "live" as const,
  status: "all" as const,
  search: "",
  planId: "all",
  page: 0,
  archiveColumns: true,
  reviewBefore: REVIEW_BEFORE,
  ...over,
});

const workspace = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  name: "Clinic",
  name_en: "Clinic",
  name_ar: "عيادة",
  slug: "clinic",
  subscription_status: "active",
  is_active: true,
  is_archived: false,
  plan_id: null,
  trial_ends_at: null,
  subscription_ends_at: null,
  archived_at: null,
  archived_by: null,
  archive_reason: null,
  archive_snapshot: null,
  subscription_plans: null,
  ...over,
});

beforeEach(() => {
  state.directory = { data: [], error: null, count: 0 };
  state.branches = { data: [], error: null };
  state.rpc = { data: null, error: null };
  state.counts = {};
  state.calls = [];
  state.rpcCalls = [];
});

describe("one archived boolean, two spellings", () => {
  it("uses the generated column when the ledger is applied", () => {
    expect(archivedTree(true)).toBe("is_archived.eq.true");
    expect(liveTree(true)).toBe("is_archived.eq.false");
  });

  it("derives the same boolean from the legacy columns when it is not", () => {
    expect(archivedTree(false)).toBe(LEGACY_ARCHIVED);
    expect(liveTree(false)).toBe("or(is_active.eq.true,subscription_status.not.in.(cancelled,expired))");
  });

  it("keeps a legacy archive out of the live tree and inside the archived one", () => {
    // A subscription that expired on its own produces exactly this row shape, so the
    // legacy spelling cannot tell it apart from an archive — which is why the ledger
    // exists. What matters here is that the two spellings agree on the same rows.
    expect(archivedTree(false)).toContain("is_active.eq.false");
    expect(liveTree(false)).not.toContain("is_active.eq.false");
    expect(liveTree(false)).toContain("subscription_status.not.in.(cancelled,expired)");
  });

  it("composes active and needs-review without repeating the archive rule", () => {
    expect(activeTree(true)).toBe(`and(${liveTree(true)},is_active.eq.true,subscription_status.not.in.(cancelled,expired))`);
    expect(needsReviewTree(true, REVIEW_BEFORE)).toBe(`and(${liveTree(true)},or(${reviewTree(REVIEW_BEFORE)}))`);
  });

  it("reviews past due, no plan, and a term ending inside the window — never an archived row", () => {
    const tree = reviewTree(REVIEW_BEFORE);
    expect(tree).toContain("subscription_status.eq.past_due");
    expect(tree).toContain("plan_id.is.null");
    expect(tree).toContain(`subscription_ends_at.lte.${REVIEW_BEFORE}`);
    expect(tree).toContain(`and(subscription_status.eq.trial,trial_ends_at.lte.${REVIEW_BEFORE})`);
    expect(needsReviewTree(true, REVIEW_BEFORE)).toContain("is_archived.eq.false");
  });

  it("puts the review window seven days out", () => {
    const now = Date.parse("2026-11-06T00:00:00.000Z");
    expect(reviewWindowEnd(now)).toBe("2026-11-13T00:00:00.000Z");
  });
});

describe("the directory is one request tree", () => {
  it("sends the live tree unchanged when no filter narrows it", () => {
    expect(directoryTree(query())).toBe("is_archived.eq.false");
  });

  it("ANDs the status filter inside the same tree, never as a second query", () => {
    expect(directoryTree(query({ status: "active" }))).toBe(activeTree(true));
    expect(directoryTree(query({ status: "needs_review" }))).toBe(needsReviewTree(true, REVIEW_BEFORE));
  });

  it("switches to the archived tree and ignores a live-only status filter", () => {
    expect(directoryTree(query({ view: "archived" }))).toBe("is_archived.eq.true");
    expect(directoryTree(query({ view: "archived", status: "active" }))).toBe("is_archived.eq.true");
    expect(directoryTree(query({ view: "archived", status: "needs_review" }))).toBe("is_archived.eq.true");
  });

  it("searches the name in both languages, the slug and the status in one OR", () => {
    expect(directoryTree(query({ search: "clinic" }))).toBe(
      "and(is_archived.eq.false,or(name.ilike.%clinic%,name_en.ilike.%clinic%,name_ar.ilike.%clinic%,slug.ilike.%clinic%,subscription_status.ilike.%clinic%))",
    );
  });

  it("keeps the plan filter out of the OR tree so it cannot widen the scope", () => {
    // `plan_id` is applied as its own `.eq()`; folding it into an `or(...)` would make
    // "plan A or archived" instead of "in plan A and archived".
    expect(directoryTree(query({ planId: "plan-1" }))).not.toContain("plan_id");
  });

  it("recognises a database that has not taken the archive migration", () => {
    expect(isMissingArchiveColumn(null)).toBe(false);
    expect(isMissingArchiveColumn(undefined)).toBe(false);
    expect(isMissingArchiveColumn({ code: "42703", message: "column does not exist" })).toBe(true);
    expect(isMissingArchiveColumn({ code: "PGRST204", message: "Could not find the 'is_archived' column" })).toBe(true);
    expect(isMissingArchiveColumn({ code: "42501", message: "permission denied for table tenants" })).toBe(false);
  });
});

describe("the directory read", () => {
  it("asks for the archive ledger only when the column exists", async () => {
    await fetchWorkspaces(query({ archiveColumns: true }));
    expect(state.calls.some((call) => call.includes(ARCHIVE_COLUMNS))).toBe(true);

    state.calls = [];
    await fetchWorkspaces(query({ archiveColumns: false }));
    expect(state.calls.some((call) => call.includes("archive_snapshot"))).toBe(false);
  });

  it("orders the archived tab by the archive time and the live tab by creation", async () => {
    await fetchWorkspaces(query({ view: "archived" }));
    expect(state.calls).toContain("tenants:order:archived_at");

    state.calls = [];
    await fetchWorkspaces(query({ view: "live" }));
    expect(state.calls).toContain("tenants:order:created_at");
  });

  it("pages by the workspace page size", async () => {
    await fetchWorkspaces(query({ page: 2 }));
    expect(state.calls).toContain(`tenants:range:${2 * WORKSPACE_PAGE_SIZE}-${3 * WORKSPACE_PAGE_SIZE - 1}`);
    expect(WORKSPACE_PAGE_SIZE).toBe(20);
  });

  it("applies the plan filter as its own equality", async () => {
    await fetchWorkspaces(query({ planId: "plan-1" }));
    expect(state.calls).toContain("tenants:eq:plan_id=plan-1");
    state.calls = [];
    await fetchWorkspaces(query({ planId: "all" }));
    expect(state.calls.some((call) => call.startsWith("tenants:eq:plan_id"))).toBe(false);
  });

  it("hands every consumer a real is_archived even on the legacy spelling", async () => {
    state.directory = {
      data: [
        workspace({ id: "archived", is_active: false, subscription_status: "cancelled" }),
        workspace({ id: "expired", is_active: false, subscription_status: "expired" }),
        workspace({ id: "stopped", is_active: false, subscription_status: "active" }),
        workspace({ id: "live", is_active: true, subscription_status: "cancelled" }),
      ],
      error: null,
      count: 4,
    };
    const { rows } = await fetchWorkspaces(query({ archiveColumns: false }));
    expect(rows.map((row) => [row.id, row.is_archived])).toEqual([
      ["archived", true],
      ["expired", true],
      ["stopped", false],
      ["live", false],
    ]);
    // The ledger columns do not exist, so they are nulled rather than left undefined:
    // a table cell reading `archived_at` must render "—", not "Invalid Date".
    expect(rows.every((row) => row.archived_at === null && row.archive_reason === null && row.archive_snapshot === null)).toBe(true);
  });

  it("passes the ledger rows through untouched when the column exists", async () => {
    const row = workspace({ is_archived: true, archived_at: "2026-11-01T00:00:00.000Z" });
    state.directory = { data: [row], error: null, count: 1 };
    const { rows, total } = await fetchWorkspaces(query({ view: "archived" }));
    expect(rows[0]).toBe(row);
    expect(total).toBe(1);
  });

  it("surfaces a failed read instead of an empty list", async () => {
    state.directory = { data: null, error: { code: "42501", message: "denied" }, count: 0 };
    const { rows, error } = await fetchWorkspaces(query());
    expect(rows).toEqual([]);
    expect(error).toEqual({ code: "42501", message: "denied" });
  });
});

describe("the KPI counts", () => {
  it("counts each figure with the same tree the list would use", async () => {
    state.counts = {
      [liveTree(true)]: 7,
      [activeTree(true)]: 5,
      [needsReviewTree(true, REVIEW_BEFORE)]: 2,
      [archivedTree(true)]: 3,
    };
    const { counts, error } = await fetchWorkspaceCounts(true, REVIEW_BEFORE);
    expect(counts).toEqual({ live: 7, active: 5, needsReview: 2, archived: 3 });
    expect(error).toBeNull();
  });

  it("keeps archived workspaces out of the live, active and review figures", async () => {
    state.counts = {
      [liveTree(true)]: 1,
      [activeTree(true)]: 1,
      [needsReviewTree(true, REVIEW_BEFORE)]: 0,
      [archivedTree(true)]: 4,
    };
    const { counts } = await fetchWorkspaceCounts(true, REVIEW_BEFORE);
    expect(counts.live + counts.archived).toBe(5);
    expect(state.calls).toContain(`tenants:or:${archivedTree(true)}`);
    expect(state.calls).toContain(`tenants:or:${liveTree(true)}`);
  });
});

describe("branch ownership", () => {
  it("reads branches with the tenant they belong to", async () => {
    state.branches = { data: [{ id: "b1", tenant_id: "t1", is_active: true, name_ar: "فرع", name_en: "Branch" }], error: null };
    const { branches } = await fetchWorkspaceBranches();
    expect(branches).toHaveLength(1);
    expect(state.calls).toContain("branches:select:id,name_en,name_ar,is_active,tenant_id");
  });
});

describe("the typed confirmation", () => {
  it("matches the server's lower(btrim(slug)) gate", () => {
    expect(slugConfirmed("clinic", "clinic")).toBe(true);
    expect(slugConfirmed("  CLINIC ", "clinic")).toBe(true);
    expect(slugConfirmed("Clinic", " clinic ")).toBe(true);
    expect(slugConfirmed("clinic-2", "clinic")).toBe(false);
    expect(slugConfirmed("", "clinic")).toBe(false);
    expect(slugConfirmed("   ", "clinic")).toBe(false);
  });

  it("never accepts anything against an empty slug", () => {
    expect(slugConfirmed("", "")).toBe(false);
    expect(slugConfirmed("   ", "   ")).toBe(false);
  });
});

describe("reading the server's json back", () => {
  it("never upgrades an unknown verdict to DELETABLE", () => {
    const verdicts = ["DELETABLE", "BLOCKED", "NEEDS_ARCHIVE", "deletable", "", undefined, null, 7];
    expect(verdicts.map((verdict) => parseAssessment({ verdict } as never).verdict)).toEqual([
      "DELETABLE",
      "BLOCKED",
      "NEEDS_ARCHIVE",
      "NEEDS_ARCHIVE",
      "NEEDS_ARCHIVE",
      "NEEDS_ARCHIVE",
      "NEEDS_ARCHIVE",
      "NEEDS_ARCHIVE",
    ]);
  });

  it("parses a full assessment and keeps an unmeasured blocker unmeasured", () => {
    const assessment = parseAssessment({
      tenant_id: "t1",
      slug: "clinic",
      name: "عيادة",
      is_archived: true,
      archived_at: "2026-11-01T00:00:00.000Z",
      subscription_status: "cancelled",
      branch_count: 2,
      verdict: "BLOCKED",
      walk_levels: 4,
      walk_stopped: false,
      tables_measured: 31,
      edges_walked: 44,
      blockers: [
        { table: "invoices", rows: 12, code: "DATA_invoices", reason: "Invoices exist", action: "archive", depth: 2 },
        { table: "mystery", rows: null, code: "SCOPE_UNMEASURABLE", reason: "not counted", action: "archive" },
      ],
      erased: [{ table: "tenant_branding", rows: 1, rank: 3, depth: 1 }],
      survivors: [{ table: "audit_logs", rows: 5, depth: 2 }],
      confirm_value: "clinic",
    } as never);
    expect(assessment.verdict).toBe("BLOCKED");
    expect(assessment.blockers[0]).toEqual({
      table: "invoices", rows: 12, code: "DATA_invoices", reason: "Invoices exist", action: "archive", depth: 2,
    });
    expect(assessment.blockers[1].rows).toBeNull();
    expect(assessment.erased).toEqual([{ table: "tenant_branding", rows: 1, rank: 3, depth: 1 }]);
    expect(assessment.survivors).toEqual([{ table: "audit_logs", rows: 5, depth: 2 }]);
    expect(assessment.confirm_value).toBe("clinic");
  });

  it("degrades a malformed assessment to an empty, non-deletable one", () => {
    for (const value of [null, "text", 42, [], { blockers: "no" }]) {
      const assessment = parseAssessment(value as never);
      expect(assessment.verdict).toBe("NEEDS_ARCHIVE");
      expect(assessment.blockers).toEqual([]);
      expect(assessment.erased).toEqual([]);
      expect(assessment.survivors).toEqual([]);
      expect(assessment.walk_stopped).toBe(false);
    }
  });

  it("reads the deletion receipt without inventing a deletion", () => {
    expect(parseReceipt(null).deleted).toBe(false);
    const receipt = parseReceipt({
      deleted: true,
      tenant_id: "t1",
      slug: "clinic",
      receipt_id: "r-1",
      branch_count: 1,
      erased: [{ table: "branches", rows: 1, rank: 9 }],
      survivors: [{ table: "audit_logs", rows: 4 }],
      change_log_rows_kept: 3,
      reason: "duplicate trial",
    } as never);
    expect(receipt).toEqual({
      deleted: true,
      tenant_id: "t1",
      slug: "clinic",
      receipt_id: "r-1",
      branch_count: 1,
      erased: [{ table: "branches", rows: 1, rank: 9 }],
      survivors: [{ table: "audit_logs", rows: 4 }],
      change_log_rows_kept: 3,
      reason: "duplicate trial",
    });
  });

  it("reads the restore result and drops non-string branch ids", () => {
    const result = parseRestoreResult({
      restored: true,
      already_active: false,
      tenant_id: "t1",
      subscription_status: "active",
      branch_ids: ["b1", 7, null, "b2"],
      domains_replayed: 1,
      subscriptions_replayed: 2,
      replayed_from_snapshot: true,
    } as never);
    expect(result.branch_ids).toEqual(["b1", "b2"]);
    expect(result.replayed_from_snapshot).toBe(true);
    expect(parseRestoreResult(null).restored).toBe(false);
    expect(parseRestoreResult({ restored: "yes" } as never).restored).toBe(false);
  });
});

describe("the snapshot decides what restore may replay", () => {
  const branches = [
    { id: "b1", tenant_id: "t1", is_active: false, name_en: "Main", name_ar: "الرئيسي" },
    { id: "b2", tenant_id: "t1", is_active: false, name_en: "Second", name_ar: "الثاني" },
    { id: "b9", tenant_id: "other", is_active: true, name_en: "Foreign", name_ar: "خارجي" },
  ];

  it("returns only the branches the snapshot recorded active and this tenant owns", () => {
    const row = workspace({
      archive_snapshot: {
        version: 2,
        branches: [
          { id: "b1", is_active: true },
          { id: "b2", is_active: false },
          { id: "b9", is_active: true },
        ],
      },
    });
    expect(recordedActiveBranchIds(row as never, branches)).toEqual(["b1"]);
  });

  it("returns nothing for an archive that predates the ledger", () => {
    expect(recordedActiveBranchIds(workspace() as never, branches)).toEqual([]);
    expect(snapshotOf(workspace() as never)).toBeNull();
    expect(snapshotOf(workspace({ archive_snapshot: [] }) as never)).toBeNull();
    expect(snapshotOf(workspace({ archive_snapshot: "text" }) as never)).toBeNull();
  });

  it("replays a recorded status only when restore may set it", () => {
    const status = (value: unknown) =>
      recordedSubscriptionStatus(workspace({ archive_snapshot: { version: 2, tenant: { subscription_status: value } } }) as never);
    expect(status("trial")).toBe("trial");
    expect(status("active")).toBe("active");
    expect(status("past_due")).toBe("past_due");
    expect(status("cancelled")).toBeNull();
    expect(status("expired")).toBeNull();
    expect(status("")).toBeNull();
    expect(status(undefined)).toBeNull();
  });

  it("offers only the three statuses a restore may set", () => {
    expect(RESTORE_STATUSES).toEqual(["trial", "active", "past_due"]);
    expect(SUBSCRIPTION_STATUSES).toEqual(["trial", "active", "past_due", "cancelled", "expired"]);
  });
});

describe("the RPC wrappers", () => {
  it("assesses through the shared read", async () => {
    state.rpc = { data: { verdict: "DELETABLE", slug: "clinic", confirm_value: "clinic" }, error: null };
    const { assessment, error } = await assessWorkspaceDelete("t1");
    expect(state.rpcCalls[0]).toEqual({ fn: "platform_workspace_delete_assess", args: { p_tenant_id: "t1" } });
    expect(assessment?.verdict).toBe("DELETABLE");
    expect(error).toBeNull();
  });

  it("restores with a null branch list rather than an empty one", async () => {
    // An empty array is an explicit "none of these branches" and the server refuses it;
    // null is what lets the server replay the snapshot or take its single-branch shortcut.
    state.rpc = { data: { restored: true, tenant_id: "t1" }, error: null };
    await restoreWorkspace({ tenantId: "t1", reason: "", branchIds: [], subscriptionStatus: "active" });
    expect(state.rpcCalls[0]).toEqual({
      fn: "platform_restore_tenant",
      args: { p_tenant_id: "t1", p_reason: null, p_branch_ids: null, p_subscription_status: "active" },
    });

    state.rpcCalls = [];
    await restoreWorkspace({ tenantId: "t1", reason: "back", branchIds: ["b1"], subscriptionStatus: "trial" });
    expect(state.rpcCalls[0].args).toEqual({
      p_tenant_id: "t1", p_reason: "back", p_branch_ids: ["b1"], p_subscription_status: "trial",
    });
  });

  it("permanently deletes through the slug the operator typed", async () => {
    state.rpc = { data: { deleted: true, receipt_id: "r-1" }, error: null };
    const { receipt } = await permanentlyDeleteWorkspace({ tenantId: "t1", confirmSlug: "clinic", reason: "" });
    expect(state.rpcCalls[0]).toEqual({
      fn: "platform_permanent_delete_tenant",
      args: { p_tenant_id: "t1", p_confirm_slug: "clinic", p_reason: null },
    });
    expect(receipt?.receipt_id).toBe("r-1");
  });

  it("never returns a parsed result next to an error", async () => {
    state.rpc = { data: { deleted: true }, error: { code: "23514", message: "PERMANENT_DELETE_BLOCKED: nope" } };
    const { receipt, error } = await permanentlyDeleteWorkspace({ tenantId: "t1", confirmSlug: "clinic", reason: "" });
    expect(receipt).toBeNull();
    expect(error).not.toBeNull();
  });
});
