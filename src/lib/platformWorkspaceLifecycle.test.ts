import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The two lifecycle migrations are the irreversible half of this batch, and neither is
// applied yet. They were proved on live Production inside BEGIN; … ROLLBACK;, so what this
// file pins is the posture that made that proof possible and the safety properties that a
// later edit must not quietly drop: fail closed, scope by constraint, measure before
// erasing, and never erase a trail.

const ARCHIVE = readFileSync("supabase/migrations/20261106120000_platform_workspace_archive_restore.sql", "utf8");
const DELETE = readFileSync("supabase/migrations/20261106121000_platform_workspace_permanent_delete.sql", "utf8");
const MODULE = readFileSync("src/lib/platformWorkspaces.ts", "utf8");
const ARCHIVE_DIALOG = readFileSync("src/components/platform/ArchiveWorkspaceDialog.tsx", "utf8");
const RESTORE_DIALOG = readFileSync("src/components/platform/RestoreWorkspaceDialog.tsx", "utf8");
const DELETE_DIALOG = readFileSync("src/components/platform/PermanentDeleteDialog.tsx", "utf8");

describe("the archive ledger (file أ)", () => {
  it("adds the ledger without dropping or re-valuing anything that exists", () => {
    for (const column of ["archived_at timestamptz", "archived_by uuid", "archive_reason text", "archive_snapshot jsonb"]) {
      expect(ARCHIVE).toContain(`add column if not exists ${column}`);
    }
    expect(ARCHIVE).toContain("is_archived boolean generated always as (");
    expect(ARCHIVE).toContain(") stored;");
  });

  it("refuses an archived row that cannot say what it looked like before", () => {
    expect(ARCHIVE).toContain("tenants_archive_ledger_coherent");
    expect(ARCHIVE).toContain("archived_at is null");
    expect(ARCHIVE).toContain("archive_snapshot is not null");
    expect(ARCHIVE).toContain("char_length(archive_reason) <= 500");
  });

  it("captures the before-state before the same statement destroys it", () => {
    // The archive clamps trial_ends_at / subscription_ends_at and cancels the subscription,
    // so a snapshot taken after the UPDATE would record the archive, not the workspace.
    expect(ARCHIVE.indexOf("INTO v_snap")).toBeGreaterThan(-1);
    expect(ARCHIVE.indexOf("INTO v_snap")).toBeLessThan(ARCHIVE.indexOf("SET is_active = false"));
    expect(ARCHIVE).toContain("FOR UPDATE");
  });

  it("writes the ledger entry server-side, in the transaction that did the work", () => {
    expect(ARCHIVE).toContain("INSERT INTO public.platform_change_log");
    expect(ARCHIVE).toContain("'archive'");
    expect(ARCHIVE).toContain("'already_archived', true");
  });

  it("lets a restore replay the term the archive shortened", () => {
    expect(ARCHIVE).toContain("current_period_end = coalesce(r.current_period_end, s.current_period_end)");
    expect(ARCHIVE).toContain("subscription_ends_at = coalesce(v_prev_ends, subscription_ends_at)");
    expect(ARCHIVE).toContain("trial_ends_at = coalesce(v_prev_trial, trial_ends_at)");
  });

  it("refuses to guess a before-state the snapshot does not have", () => {
    expect(ARCHIVE).toContain("RESTORE_BRANCH_SELECTION_REQUIRED");
    expect(ARCHIVE).toContain("RESTORE_SUBSCRIPTION_STATUS_REQUIRED");
    expect(ARCHIVE).toContain("USING ERRCODE = '23514'");
  });

  it("filters an explicit branch list against this tenant's own rows", () => {
    expect(ARCHIVE).toContain("WHERE b.tenant_id = p_tenant_id AND b.id = ANY (p_branch_ids)");
  });

  it("is System Owner only, on both halves", () => {
    expect(ARCHIVE.match(/public\.has_role\(auth\.uid\(\), 'system_owner'/g)).toHaveLength(2);
    expect(ARCHIVE).toContain("REVOKE ALL ON FUNCTION public.platform_archive_tenant(uuid, text) FROM PUBLIC, anon;");
    expect(ARCHIVE).toContain(
      "REVOKE ALL ON FUNCTION public.platform_restore_tenant(uuid, text, uuid[], public.subscription_status) FROM PUBLIC, anon;",
    );
    expect(ARCHIVE).toContain("GRANT EXECUTE ON FUNCTION public.platform_archive_tenant(uuid, text) TO authenticated;");
  });
});

describe("the permanent-delete engine (file ب)", () => {
  it("keeps the receipt in a ledger the delete cannot erase", () => {
    expect(DELETE).toContain("create table if not exists public.platform_workspace_deletions");
    const table = DELETE.slice(
      DELETE.indexOf("create table if not exists public.platform_workspace_deletions"),
      DELETE.indexOf("comment on table public.platform_workspace_deletions"),
    );
    // A foreign key to the row being deleted would cascade the receipt away with it.
    expect(table).not.toContain("references public.tenants");
    expect(DELETE).toContain("enable row level security");
    expect(DELETE).toContain("revoke all on table public.platform_workspace_deletions from anon, authenticated");
    expect(DELETE).toContain("platform_workspace_deletions_owner_read");
    expect(DELETE).toContain("before delete on public.platform_workspace_deletions");
    expect(DELETE).toContain("before update on public.platform_workspace_deletions");
  });

  it("fails closed: a table nobody classified is a blocker, not an erasure", () => {
    expect(DELETE).toContain("else 'Operational data exists in this table.'");
    expect(DELETE).toContain("SCOPE_UNMEASURABLE");
    expect(DELETE).toContain("SCOPE_TOO_BROAD");
    expect(DELETE).toContain("Nothing that was not counted is deleted.");
  });

  it("scopes by the constraint catalog instead of a hand-written column list", () => {
    expect(DELETE).toContain("from pg_constraint con");
    expect(DELETE).toContain("unnest(con.confkey::int[]) with ordinality");
    expect(DELETE).toContain("unnest(con.conkey::int[]) with ordinality");
    // The five scope columns with no foreign key at all are walked as virtual edges.
    expect(DELETE).toContain("a.attname in ('tenant_id', 'branch_id')");
    expect(DELETE).toContain("'no-fk-' || s.col");
  });

  it("stops the walk rather than walking forever", () => {
    expect(DELETE).toContain("while v_frontier <> '{}'::text[] and v_level < 12 loop");
    expect(DELETE).toContain("'walk_stopped', v_level >= 12");
  });

  it("decides in the order the console reads: archive, then blocked, then deletable", () => {
    const verdict = DELETE.slice(DELETE.indexOf("if not v_tenant.is_archived then"), DELETE.indexOf("select coalesce(jsonb_agg(v_erase_map"));
    expect(verdict.indexOf("NEEDS_ARCHIVE")).toBeLessThan(verdict.indexOf("BLOCKED"));
    expect(verdict.indexOf("BLOCKED")).toBeLessThan(verdict.indexOf("DELETABLE"));
  });

  it("orders children before parents instead of trusting CASCADE", () => {
    expect(DELETE).toContain("v_erase_map -> v_parent ->> 'rank')::int <= (v_erase_map -> v_child ->> 'rank')::int");
    expect(DELETE).toContain("while v_changed and v_pass < 16 loop");
  });

  it("requires a fresh Read Committed transaction and locks the workspace", () => {
    expect(DELETE).toContain("current_setting('transaction_isolation') <> 'read committed'");
    expect(DELETE).toContain("using errcode = '40001'");
    expect(DELETE).toContain("for update;");
    expect(DELETE).toContain("pg_advisory_xact_lock(hashtextextended('zmedico.workspace-delete:'");
  });

  it("re-checks the typed slug and the archive gate on the server", () => {
    expect(DELETE).toContain("lower(btrim(coalesce(p_confirm_slug, ''))) <> lower(v_tenant.slug)");
    expect(DELETE).toContain("PERMANENT_DELETE_SLUG_MISMATCH");
    expect(DELETE).toContain("PERMANENT_DELETE_ARCHIVE_FIRST");
    expect(DELETE).toContain("PERMANENT_DELETE_BLOCKED");
  });

  it("erases exactly the rows the assessment measured, and proves it per table", () => {
    expect(DELETE).toContain("PERMANENT_DELETE_DRIFT");
    expect(DELETE).toContain("get diagnostics v_rows = ROW_COUNT;");
    expect(DELETE).toContain("if v_rows is distinct from (v_item ->> 'rows')::bigint then");
  });

  it("re-assesses before the tenant row goes, so a concurrent write aborts the whole delete", () => {
    expect(DELETE).toContain("v_recheck := public.platform_workspace_delete_assess(p_tenant_id);");
    expect(DELETE).toContain("jsonb_array_length(v_recheck->'erased') > 0");
  });

  it("steps around exactly two triggers, for exactly those rows, and re-enables them", () => {
    expect(DELETE).toContain("alter table public.branches disable trigger branches_guard_last_tenant_branch;");
    expect(DELETE).toContain("alter table public.platform_change_log disable trigger platform_change_log_no_delete;");
    expect(DELETE.match(/enable trigger branches_guard_last_tenant_branch;/g)).toHaveLength(2);
    expect(DELETE.match(/enable trigger platform_change_log_no_delete;/g)).toHaveLength(2);
    // The third BEFORE DELETE guard on branches stays enabled on purpose.
    expect(DELETE).not.toContain("disable trigger branches_guard_last_active_tenant_branch");
  });

  it("relocates the change log the CASCADE would otherwise erase", () => {
    expect(DELETE).toContain("coalesce(v_change_log, '[]'::jsonb)");
    expect(DELETE).toContain("'change_log_rows_kept', jsonb_array_length");
  });

  it("recounts the trails it leaves behind instead of claiming they are gone", () => {
    expect(DELETE).toContain("v_survivors_after");
    expect(DELETE).toContain("'rows_before', v_before, 'rows_after'");
  });

  it("is System Owner only, on both the read and the write", () => {
    expect(DELETE.match(/raise exception 'System Owner role required'/g)).toHaveLength(2);
    expect(DELETE).toContain("REVOKE ALL ON FUNCTION public.platform_workspace_delete_assess(uuid) FROM PUBLIC, anon;");
    expect(DELETE).toContain("REVOKE ALL ON FUNCTION public.platform_permanent_delete_tenant(uuid, text, text) FROM PUBLIC, anon;");
    expect(DELETE).toContain("GRANT EXECUTE ON FUNCTION public.platform_permanent_delete_tenant(uuid, text, text) TO authenticated;");
  });

  it("depends on the archive ledger it gates on", () => {
    expect(DELETE).toContain("t.is_archived");
    expect("20261106120000".localeCompare("20261106121000")).toBeLessThan(0);
  });
});

describe("neither file has been committed to Production", () => {
  it("carries no COMMIT of its own, so the dry run stays a dry run", () => {
    for (const sql of [ARCHIVE, DELETE]) {
      expect(sql.toLowerCase()).not.toMatch(/^\s*commit\s*;/m);
      expect(sql.toLowerCase()).not.toMatch(/^\s*begin\s*;/m);
      expect(sql).toContain("NOT APPLIED");
    }
  });
});

describe("the wire contract between the console and the RPCs", () => {
  it("calls the four functions the migrations define", () => {
    const console = `${MODULE}${ARCHIVE_DIALOG}${RESTORE_DIALOG}${DELETE_DIALOG}`;
    for (const fn of [
      "platform_archive_tenant",
      "platform_restore_tenant",
      "platform_workspace_delete_assess",
      "platform_permanent_delete_tenant",
    ]) {
      expect(console).toContain(fn);
      expect(`${ARCHIVE}${DELETE}`).toContain(`FUNCTION public.${fn}`);
    }
  });

  it("spells every argument the way the SQL parameter is spelled", () => {
    const pairs: Array<[string, string]> = [
      ["p_tenant_id", "p_tenant_id uuid"],
      ["p_reason", "p_reason text"],
      ["p_branch_ids", "p_branch_ids uuid[]"],
      ["p_subscription_status", "p_subscription_status public.subscription_status"],
      ["p_confirm_slug", "p_confirm_slug text"],
    ];
    for (const [wire, sql] of pairs) {
      expect(MODULE).toContain(`${wire}:`); // the object key the wrapper sends
      expect(`${ARCHIVE}${DELETE}`).toContain(sql);
    }
  });

  it("hands every sentinel the server can raise to a dialog that names it", () => {
    const sentinels: Array<[string, string]> = [
      ["RESTORE_BRANCH_SELECTION_REQUIRED", RESTORE_DIALOG],
      ["RESTORE_SUBSCRIPTION_STATUS_REQUIRED", RESTORE_DIALOG],
      ["PERMANENT_DELETE_SLUG_MISMATCH", DELETE_DIALOG],
      ["PERMANENT_DELETE_ARCHIVE_FIRST", DELETE_DIALOG],
      ["PERMANENT_DELETE_DRIFT", DELETE_DIALOG],
      ["PERMANENT_DELETE_BLOCKED", DELETE_DIALOG],
    ];
    for (const [sentinel, dialog] of sentinels) {
      expect(`${ARCHIVE}${DELETE}`).toContain(sentinel);
      expect(dialog).toContain(sentinel);
    }
  });

  it("re-checks the typed slug in the console with the server's own rule", () => {
    expect(MODULE).toContain("input.trim().toLowerCase() === slug.trim().toLowerCase()");
    expect(ARCHIVE_DIALOG).toContain("slugConfirmed(confirmSlug, slug)");
    expect(DELETE_DIALOG).toContain("slugConfirmed(confirm, confirmValue)");
  });
});
