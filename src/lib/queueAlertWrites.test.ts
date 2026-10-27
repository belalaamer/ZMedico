import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  visibleIds: [] as string[],
  error: null as null | { message: string },
}));

// Models the PostgREST shape that the screens keep getting wrong: a write whose
// filter matches nothing answers 2xx, error null, and no representation, so the
// only evidence a row changed is the representation asked for with .select().
function makeQuery() {
  const q: any = {
    _patch: null as Record<string, any> | null,
    _filter: null as { column: string; value: unknown } | null,
    _selected: false,
    update: (patch: Record<string, any>) => { q._patch = patch; return q; },
    eq: (column: string, value: unknown) => { q._filter = { column, value }; return q; },
    select: () => { q._selected = true; return q; },
    then: (resolve: any, reject: any) => settle(q).then(resolve, reject),
  };
  return q;
}

async function settle(q: any) {
  if (state.error) return { data: null, error: state.error };
  const match = state.rows.find((r) => q._filter
    && r[q._filter.column] === q._filter.value
    && state.visibleIds.includes(r.id));
  if (match) Object.assign(match, q._patch);
  return { data: q._selected ? (match ? [{ id: match.id }] : []) : null, error: null };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => makeQuery() },
}));

import { acknowledgeAlert, resolveAlertNow, snoozeAlert, unsnoozeAlert } from "./queueAlerts";

const actions = [
  { name: "snoozeAlert", run: () => snoozeAlert("alert-1", "2026-10-27T12:00:00.000Z", "user-1") },
  { name: "acknowledgeAlert", run: () => acknowledgeAlert("alert-1", "user-1") },
  { name: "unsnoozeAlert", run: () => unsnoozeAlert("alert-1") },
  { name: "resolveAlertNow", run: () => resolveAlertNow("alert-1") },
];

describe("queue alert row-count proof (batch 16)", () => {
  beforeEach(() => {
    state.error = null;
    state.rows = [{ id: "alert-1", branch_id: "branch-a", state: "active", detail: {}, snoozed_until: null, snoozed_by: null, acknowledged_at: null, acknowledged_by: null, resolved_at: null }];
    state.visibleIds = ["alert-1"];
  });

  for (const action of actions) {
    it(`${action.name} reports failure when the write filtered to zero rows`, async () => {
      state.visibleIds = ["someone-else's-alert"];
      const before = { ...state.rows[0] };
      expect(await action.run()).toMatchObject({ ok: false });
      expect(state.rows[0]).toEqual(before);
    });

    it(`${action.name} reports success only when the row comes back`, async () => {
      expect(await action.run()).toMatchObject({ ok: true, error: undefined });
    });
  }

  it("passes a PostgREST error through as a failure", async () => {
    state.error = { message: "permission denied for table queue_alerts" };
    expect(await snoozeAlert("alert-1", "2026-10-27T12:00:00.000Z", "user-1"))
      .toMatchObject({ ok: false, error: "permission denied for table queue_alerts" });
  });
});
