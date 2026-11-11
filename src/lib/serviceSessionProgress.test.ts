import { describe, expect, it } from "vitest";
import { planProgress, summariseByService } from "./serviceSessionProgress";

// `PatientTreatmentPlans` pre-generates exactly `total_sessions` rows when a plan
// is created, so the healthy case is `planned === total`. Everything else here is
// the drift and edge cases that arithmetic in JSX usually gets wrong.

const plan = (over: Partial<{ id: string; service_id: string | null; total_sessions: number; status: string }> = {}) => ({
  id: "plan-1",
  service_id: "svc-pt" as string | null,
  total_sessions: 10,
  status: "active",
  ...over,
});

const done = (n: number) => Array.from({ length: n }, () => ({ status: "completed" }));

describe("a single plan's progress", () => {
  it("counts the three statuses and leaves the rest pending", () => {
    const sessions = [...done(3), { status: "missed" }, { status: "pending" }, { status: "pending" }];
    const p = planProgress(plan(), sessions);
    expect(p).toMatchObject({ total: 10, planned: 6, completed: 3, missed: 1, pending: 2, remaining: 7 });
    expect(p.percent).toBe(30);
  });

  it("never reports a negative remainder when more sessions completed than bought", () => {
    // Only reachable by edited data, but the desk must never read "-2 sessions left".
    const p = planProgress(plan({ total_sessions: 2 }), done(4));
    expect(p.completed).toBe(4);
    expect(p.remaining).toBe(0);
    expect(p.percent).toBe(100);
  });

  it("reports drift instead of hiding it", () => {
    const p = planProgress(plan({ total_sessions: 10 }), done(4));
    expect(p.planned).toBe(4);
    expect(p.drifted).toBe(true);
    const consistent = planProgress(plan({ total_sessions: 4 }), done(4));
    expect(consistent.drifted).toBe(false);
  });

  it("treats a plan with no sessions as having no percentage rather than 0%", () => {
    const p = planProgress(plan({ total_sessions: 0 }), []);
    expect(p.percent).toBeNull();
    expect(p.remaining).toBe(0);
    expect(p.total).toBe(0);
  });

  it("picks the soonest pending session, not the latest", () => {
    const p = planProgress(plan({ total_sessions: 3 }), [
      { status: "pending", scheduled_date: "2026-11-20" },
      { status: "pending", scheduled_date: "2026-11-13" },
      { status: "completed", scheduled_date: "2026-11-06" },
    ]);
    expect(p.nextSessionDate).toBe("2026-11-13");
  });

  it("does not offer a completed or missed session as the next one", () => {
    const p = planProgress(plan({ total_sessions: 2 }), [
      { status: "completed", scheduled_date: "2026-11-06" },
      { status: "missed", scheduled_date: "2026-11-13" },
    ]);
    expect(p.nextSessionDate).toBeNull();
  });

  it("survives a plan whose total is missing or not a number", () => {
    expect(planProgress({ id: "p", total_sessions: null }, done(1)).total).toBe(0);
    expect(planProgress({ id: "p", total_sessions: Number.NaN }, done(1)).total).toBe(0);
  });
});

describe("the per-service roll-up", () => {
  const sessions = {
    "plan-a": done(2),
    "plan-b": done(1),
    "plan-c": done(5),
    "plan-null": done(1),
  };

  it("adds up every live plan of the same service", () => {
    const rollup = summariseByService(
      [
        plan({ id: "plan-a", service_id: "svc-pt", total_sessions: 6 }),
        plan({ id: "plan-b", service_id: "svc-pt", total_sessions: 6 }),
        plan({ id: "plan-c", service_id: "svc-msg", total_sessions: 8 }),
      ],
      sessions,
    );
    expect(rollup).toEqual([
      { serviceId: "svc-pt", plans: 2, total: 12, completed: 3, remaining: 9 },
      { serviceId: "svc-msg", plans: 1, total: 8, completed: 5, remaining: 3 },
    ]);
    // Sorted by what is still owed, not by name.
    expect(rollup[0].serviceId).toBe("svc-pt");
  });

  it("leaves out cancelled plans so released sessions are not promised", () => {
    const rollup = summariseByService(
      [
        plan({ id: "plan-a", service_id: "svc-pt", total_sessions: 6 }),
        plan({ id: "plan-b", service_id: "svc-pt", total_sessions: 6, status: "cancelled" }),
      ],
      sessions,
    );
    expect(rollup).toEqual([{ serviceId: "svc-pt", plans: 1, total: 6, completed: 2, remaining: 4 }]);
  });

  it("keeps a plan that has no service under its own unlabelled group", () => {
    const rollup = summariseByService([plan({ id: "plan-null", service_id: null, total_sessions: 4 })], sessions);
    expect(rollup).toEqual([{ serviceId: null, plans: 1, total: 4, completed: 1, remaining: 3 }]);
  });

  it("returns nothing for a patient with no plans", () => {
    expect(summariseByService([], {})).toEqual([]);
  });
});
