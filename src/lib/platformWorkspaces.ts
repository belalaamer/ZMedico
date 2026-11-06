import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

export type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
export type WorkspaceView = "live" | "archived";
export type WorkspaceStatusFilter = "all" | "active" | "needs_review";

export const WORKSPACE_PAGE_SIZE = 20;
export const ARCHIVE_COLUMNS = "is_archived,archived_at,archived_by,archive_reason,archive_snapshot";
const ARCHIVED_STATUSES = ["cancelled", "expired"];
const REVIEW_WINDOW_DAYS = 7;

export type WorkspacePlan = {
  id: string;
  name_ar: string;
  name_en: string;
  max_branches: number;
  max_staff: number;
  features?: Record<string, boolean> | null;
};

export type Workspace = {
  id: string;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  slug: string;
  subscription_status: SubscriptionStatus;
  is_active: boolean;
  is_archived: boolean;
  plan_id: string | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  archive_snapshot: ArchiveSnapshot | null;
  subscription_plans: WorkspacePlan | null;
};

export type WorkspaceBranch = {
  id: string;
  name_en: string;
  name_ar: string;
  is_active: boolean;
  tenant_id: string | null;
};

export type ArchiveSnapshot = {
  version?: number;
  tenant?: {
    is_active?: boolean;
    subscription_status?: string;
    trial_ends_at?: string | null;
    subscription_ends_at?: string | null;
    plan_id?: string | null;
  };
  branches?: { id: string; is_active: boolean; name_en?: string; name_ar?: string }[];
  domains?: { id: string; is_enabled: boolean; status: string | null; hostname: string }[];
  subscriptions?: { id: string; status: string; billing_cycle: string; current_period_end: string | null }[];
};

export type WorkspaceCounts = { live: number; active: number; needsReview: number; archived: number };

export type DeleteBlocker = {
  table: string;
  rows: number | null;
  code: string;
  reason: string;
  action: string;
  depth?: number;
};

export type DeleteStep = { table: string; rows: number; rank: number; depth?: number };
export type DeleteSurvivor = { table: string; rows: number | null; depth?: number };
export type DeleteVerdict = "DELETABLE" | "BLOCKED" | "NEEDS_ARCHIVE";

export type DeleteAssessment = {
  tenant_id: string;
  slug: string;
  name: string;
  is_archived: boolean;
  archived_at: string | null;
  subscription_status: string;
  branch_count: number;
  verdict: DeleteVerdict;
  walk_levels: number;
  walk_stopped: boolean;
  tables_measured: number;
  edges_walked: number;
  blockers: DeleteBlocker[];
  erased: DeleteStep[];
  survivors: DeleteSurvivor[];
  confirm_value: string;
};

export type DeleteReceipt = {
  deleted: boolean;
  tenant_id: string;
  slug: string;
  receipt_id: string;
  branch_count: number;
  erased: DeleteStep[];
  survivors: DeleteSurvivor[];
  change_log_rows_kept: number;
  reason: string | null;
};

export type RestoreResult = {
  restored: boolean;
  already_active: boolean;
  tenant_id: string;
  subscription_status?: string;
  branch_ids?: string[];
  domains_replayed?: number;
  subscriptions_replayed?: number;
  replayed_from_snapshot?: boolean;
};

/**
 * The archive ledger arrives with 20261106120000. Until it is applied the console must
 * still list workspaces, so the same boolean is expressed against the columns that
 * already exist: inactive AND cancelled/expired. One definition, two spellings.
 */
export function archivedTree(archiveColumns: boolean): string {
  return archiveColumns
    ? "is_archived.eq.true"
    : `and(is_active.eq.false,subscription_status.in.(${ARCHIVED_STATUSES.join(",")}))`;
}

export function liveTree(archiveColumns: boolean): string {
  return archiveColumns
    ? "is_archived.eq.false"
    : `or(is_active.eq.true,subscription_status.not.in.(${ARCHIVED_STATUSES.join(",")}))`;
}

/** Past due, no plan, or a term/trial ending inside the review window. Never an archived row. */
export function reviewTree(reviewBefore: string): string {
  return [
    "subscription_status.eq.past_due",
    "plan_id.is.null",
    `subscription_ends_at.lte.${reviewBefore}`,
    `and(subscription_status.eq.trial,trial_ends_at.lte.${reviewBefore})`,
  ].join(",");
}

export function activeTree(archiveColumns: boolean): string {
  return `and(${liveTree(archiveColumns)},is_active.eq.true,subscription_status.not.in.(${ARCHIVED_STATUSES.join(",")}))`;
}

export function needsReviewTree(archiveColumns: boolean, reviewBefore: string): string {
  return `and(${liveTree(archiveColumns)},or(${reviewTree(reviewBefore)}))`;
}

export function reviewWindowEnd(now = Date.now()): string {
  return new Date(now + REVIEW_WINDOW_DAYS * 86_400_000).toISOString();
}

export type DirectoryQuery = {
  view: WorkspaceView;
  status: WorkspaceStatusFilter;
  search: string;
  planId: string;
  page: number;
  archiveColumns: boolean;
  reviewBefore: string;
};

/** One PostgREST logic tree per request: view, status and search are ANDed inside it. */
export function directoryTree(query: DirectoryQuery): string {
  const parts = [query.view === "archived" ? archivedTree(query.archiveColumns) : liveTree(query.archiveColumns)];
  if (query.view === "live" && query.status === "active") {
    parts.push(`is_active.eq.true`, `subscription_status.not.in.(${ARCHIVED_STATUSES.join(",")})`);
  }
  if (query.view === "live" && query.status === "needs_review") parts.push(`or(${reviewTree(query.reviewBefore)})`);
  if (query.search) {
    const term = `%${query.search}%`;
    parts.push(
      `or(name.ilike.${term},name_en.ilike.${term},name_ar.ilike.${term},slug.ilike.${term},subscription_status.ilike.${term})`,
    );
  }
  return parts.length === 1 ? parts[0] : `and(${parts.join(",")})`;
}

const DIRECTORY_SELECT = `id,name,name_en,name_ar,slug,subscription_status,is_active,plan_id,trial_ends_at,subscription_ends_at,subscription_plans(id,name_ar,name_en,max_branches,max_staff,features)`;

export function isMissingArchiveColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "42703" || /is_archived|archived_at|archive_snapshot|archive_reason|archived_by/.test(message);
}

export async function fetchWorkspaces(query: DirectoryQuery) {
  let builder = supabase
    .from("tenants")
    .select(query.archiveColumns ? `${DIRECTORY_SELECT},${ARCHIVE_COLUMNS}` : DIRECTORY_SELECT, { count: "exact" })
    .or(directoryTree(query))
    .order(query.archiveColumns && query.view === "archived" ? "archived_at" : "created_at", {
      ascending: false,
      nullsFirst: false,
    })
    .range(query.page * WORKSPACE_PAGE_SIZE, (query.page + 1) * WORKSPACE_PAGE_SIZE - 1);
  if (query.planId !== "all") builder = builder.eq("plan_id", query.planId);
  const { data, error, count } = await builder;
  const rows = (data ?? []) as unknown as Workspace[];
  return {
    // On the legacy spelling the generated column does not exist, so the same boolean is
    // derived here once. Every consumer then reads a real `is_archived`, never undefined.
    rows: query.archiveColumns
      ? rows
      : rows.map((row) => ({
          ...row,
          is_archived: !row.is_active && ARCHIVED_STATUSES.includes(row.subscription_status),
          archived_at: null,
          archived_by: null,
          archive_reason: null,
          archive_snapshot: null,
        })),
    total: count ?? 0,
    error,
  };
}

export async function fetchWorkspaceCounts(archiveColumns: boolean, reviewBefore: string) {
  const head = { count: "exact", head: true } as const;
  const [live, active, needsReview, archived] = await Promise.all([
    supabase.from("tenants").select("id", head).or(liveTree(archiveColumns)),
    supabase.from("tenants").select("id", head).or(activeTree(archiveColumns)),
    supabase.from("tenants").select("id", head).or(needsReviewTree(archiveColumns, reviewBefore)),
    supabase.from("tenants").select("id", head).or(archivedTree(archiveColumns)),
  ]);
  const error = live.error ?? active.error ?? needsReview.error ?? archived.error;
  return {
    counts: {
      live: live.count ?? 0,
      active: active.count ?? 0,
      needsReview: needsReview.count ?? 0,
      archived: archived.count ?? 0,
    } satisfies WorkspaceCounts,
    error,
  };
}

export async function fetchWorkspaceBranches() {
  const { data, error } = await supabase
    .from("branches")
    .select("id,name_en,name_ar,is_active,tenant_id")
    .order("name_en");
  return { branches: (data ?? []) as WorkspaceBranch[], error };
}

function asRecord(value: Json | null): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json | undefined>) : {};
}

function asArray(value: Json | undefined): Record<string, Json | undefined>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asNumber(value: Json | undefined): number {
  return typeof value === "number" ? value : 0;
}

function asText(value: Json | undefined): string {
  return typeof value === "string" ? value : "";
}

export function parseAssessment(value: Json | null): DeleteAssessment {
  const root = asRecord(value);
  const verdict = asText(root.verdict);
  return {
    tenant_id: asText(root.tenant_id),
    slug: asText(root.slug),
    name: asText(root.name),
    is_archived: root.is_archived === true,
    archived_at: typeof root.archived_at === "string" ? root.archived_at : null,
    subscription_status: asText(root.subscription_status),
    branch_count: asNumber(root.branch_count),
    verdict: verdict === "DELETABLE" || verdict === "BLOCKED" ? verdict : "NEEDS_ARCHIVE",
    walk_levels: asNumber(root.walk_levels),
    walk_stopped: root.walk_stopped === true,
    tables_measured: asNumber(root.tables_measured),
    edges_walked: asNumber(root.edges_walked),
    blockers: asArray(root.blockers).map((row) => ({
      table: asText(row.table),
      rows: typeof row.rows === "number" ? row.rows : null,
      code: asText(row.code),
      reason: asText(row.reason),
      action: asText(row.action),
      depth: asNumber(row.depth),
    })),
    erased: asArray(root.erased).map((row) => ({
      table: asText(row.table),
      rows: asNumber(row.rows),
      rank: asNumber(row.rank),
      depth: asNumber(row.depth),
    })),
    survivors: asArray(root.survivors).map((row) => ({
      table: asText(row.table),
      rows: typeof row.rows === "number" ? row.rows : null,
      depth: asNumber(row.depth),
    })),
    confirm_value: asText(root.confirm_value),
  };
}

export function parseReceipt(value: Json | null): DeleteReceipt {
  const root = asRecord(value);
  return {
    deleted: root.deleted === true,
    tenant_id: asText(root.tenant_id),
    slug: asText(root.slug),
    receipt_id: asText(root.receipt_id),
    branch_count: asNumber(root.branch_count),
    erased: asArray(root.erased).map((row) => ({ table: asText(row.table), rows: asNumber(row.rows), rank: asNumber(row.rank) })),
    survivors: asArray(root.survivors).map((row) => ({
      table: asText(row.table),
      rows: typeof row.rows === "number" ? row.rows : null,
    })),
    change_log_rows_kept: asNumber(root.change_log_rows_kept),
    reason: typeof root.reason === "string" ? root.reason : null,
  };
}

export function parseRestoreResult(value: Json | null): RestoreResult {
  const root = asRecord(value);
  return {
    restored: root.restored === true,
    already_active: root.already_active === true,
    tenant_id: asText(root.tenant_id),
    subscription_status: typeof root.subscription_status === "string" ? root.subscription_status : undefined,
    branch_ids: Array.isArray(root.branch_ids) ? root.branch_ids.filter((id): id is string => typeof id === "string") : undefined,
    domains_replayed: asNumber(root.domains_replayed),
    subscriptions_replayed: asNumber(root.subscriptions_replayed),
    replayed_from_snapshot: root.replayed_from_snapshot === true,
  };
}

export async function assessWorkspaceDelete(tenantId: string) {
  const { data, error } = await supabase.rpc("platform_workspace_delete_assess", { p_tenant_id: tenantId });
  return { assessment: error ? null : parseAssessment(data), error };
}

export async function restoreWorkspace(input: {
  tenantId: string;
  reason: string;
  branchIds: string[];
  subscriptionStatus: SubscriptionStatus;
}) {
  const { data, error } = await supabase.rpc("platform_restore_tenant", {
    p_tenant_id: input.tenantId,
    p_reason: input.reason || null,
    // An empty array is an explicit "none of these branches" and the server refuses it;
    // null lets the server replay the snapshot or use its single-branch shortcut.
    p_branch_ids: input.branchIds.length ? input.branchIds : null,
    p_subscription_status: input.subscriptionStatus,
  });
  return { result: error ? null : parseRestoreResult(data), error };
}

export async function permanentlyDeleteWorkspace(input: { tenantId: string; confirmSlug: string; reason: string }) {
  const { data, error } = await supabase.rpc("platform_permanent_delete_tenant", {
    p_tenant_id: input.tenantId,
    p_confirm_slug: input.confirmSlug,
    p_reason: input.reason || null,
  });
  return { receipt: error ? null : parseReceipt(data), error };
}

/** Mirrors the server gate: lower(btrim(p_confirm_slug)) = lower(slug). */
export function slugConfirmed(input: string, slug: string): boolean {
  return input.trim().toLowerCase() === slug.trim().toLowerCase() && slug.trim().length > 0;
}

export const RESTORE_STATUSES = ["trial", "active", "past_due"] as const satisfies readonly SubscriptionStatus[];

/** Every status an operator may set on the plan & term dialog, in ledger order. */
export const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "cancelled", "expired"] as const satisfies readonly SubscriptionStatus[];

export function snapshotOf(workspace: Workspace): ArchiveSnapshot | null {
  const snapshot = workspace.archive_snapshot;
  // Same shape test `asRecord` uses: an array is valid JSON but never a snapshot, and
  // treating one as a snapshot would silence the "no recorded before-state" caution.
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : null;
}

/** Branches the snapshot recorded as active; empty when the archive predates the ledger. */
export function recordedActiveBranchIds(workspace: Workspace, branches: WorkspaceBranch[]): string[] {
  const snapshot = snapshotOf(workspace);
  const owned = new Set(branches.filter((branch) => branch.tenant_id === workspace.id).map((branch) => branch.id));
  if (!snapshot?.branches?.length) return [];
  return snapshot.branches.filter((branch) => branch.is_active && owned.has(branch.id)).map((branch) => branch.id);
}

export function recordedSubscriptionStatus(workspace: Workspace): SubscriptionStatus | null {
  const status = snapshotOf(workspace)?.tenant?.subscription_status;
  return RESTORE_STATUSES.includes(status as (typeof RESTORE_STATUSES)[number]) ? (status as SubscriptionStatus) : null;
}
