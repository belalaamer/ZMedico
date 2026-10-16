import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  appointment: { id: "visit", branch_id: "branch-a", status: "no_show", priority: null as number | null },
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> = {};
      const query = {
        update: (value: Record<string, unknown>) => { patch = value; return query; },
        eq: (column: string, value: unknown) => { filters[column] = value; return query; },
        is: (column: string, value: unknown) => { filters[column] = value; return query; },
        select: () => query,
        maybeSingle: async () => {
          state.updates.push({ ...filters });
          if (Object.entries(filters).some(([column, value]) => state.appointment[column as keyof typeof state.appointment] !== value)) {
            return { data: null, error: null };
          }
          Object.assign(state.appointment, patch);
          return { data: { id: state.appointment.id }, error: null };
        },
      };
      return query;
    },
  },
}));

import { updateQueueAppointment } from "./queueMutation";

beforeEach(() => {
  state.appointment = { id: "visit", branch_id: "branch-a", status: "no_show", priority: null };
  state.updates.length = 0;
});

describe("queue compare-and-set", () => {
  it("permits only one of two concurrent recalls from the same snapshot", async () => {
    const input = { appointmentId: "visit", branchId: "branch-a", expectedStatus: "no_show" as const, patch: { status: "confirmed" } };
    const results = await Promise.all([updateQueueAppointment(input), updateQueueAppointment(input)]);
    expect(results.sort()).toEqual([false, true]);
    expect(state.appointment.status).toBe("confirmed");
    expect(state.updates[0]).toMatchObject({ id: "visit", branch_id: "branch-a", status: "no_show" });
  });

  it("rejects a branch-mismatched update", async () => {
    expect(await updateQueueAppointment({ appointmentId: "visit", branchId: "branch-b", expectedStatus: "no_show", patch: { status: "confirmed" } })).toBe(false);
    expect(state.appointment.status).toBe("no_show");
  });

  it("rejects a stale priority change while preserving another user's update", async () => {
    const input = { appointmentId: "visit", branchId: "branch-a", expectedStatus: "no_show" as const, expectedPriority: null, patch: { priority: 1 } };
    expect(await updateQueueAppointment(input)).toBe(true);
    expect(await updateQueueAppointment(input)).toBe(false);
    expect(state.appointment.priority).toBe(1);
    expect(state.updates[0]).toMatchObject({ priority: null });
  });

  it("fails closed without a branch", async () => {
    await expect(updateQueueAppointment({ appointmentId: "visit", branchId: "", expectedStatus: "no_show", patch: { status: "confirmed" } })).rejects.toThrow("branch_required");
    expect(state.updates).toHaveLength(0);
  });
});
