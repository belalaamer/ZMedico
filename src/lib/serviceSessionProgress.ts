/**
 * Session progress for treatment plans, and its roll-up per service.
 *
 * Why this is a separate, pure module. A treatment plan is created with
 * `total_sessions` and `PatientTreatmentPlans` pre-generates exactly that many
 * `treatment_sessions` rows spaced a week apart (`Array.from({ length: total })`).
 * Two things follow from that design, and both are easy to get wrong in JSX:
 *
 *   1. the plan's own count (`total_sessions`) and the rows that actually exist can
 *      drift — a plan edited after creation keeps its old rows;
 *   2. "remaining" must never read negative, and a completed session must never be
 *      counted twice.
 *
 * The screen renders what this returns, so the arithmetic is asserted directly
 * instead of being re-derived inline in three places.
 */

export type SessionLike = { status?: string | null; scheduled_date?: string | null; performed_at?: string | null };

export type PlanLike = {
  id: string;
  service_id?: string | null;
  total_sessions?: number | null;
  status?: string | null;
};

export type PlanProgress = {
  /** The number the plan says it bought. */
  total: number;
  /** Rows that actually exist for it — differs from `total` when the plan was edited. */
  planned: number;
  completed: number;
  missed: number;
  pending: number;
  /** Never negative: a plan cannot owe sessions it never had. */
  remaining: number;
  /** 0-100, and undefined when the plan has no sessions at all. */
  percent: number | null;
  nextSessionDate: string | null;
  /** True when the plan's own count and the rows disagree. */
  drifted: boolean;
};

const DONE = "completed";
const MISSED = "missed";

export function planProgress(plan: PlanLike, sessions: readonly SessionLike[] = []): PlanProgress {
  let completed = 0;
  let missed = 0;
  let pending = 0;
  let nextSessionDate: string | null = null;

  for (const session of sessions) {
    if (session.status === DONE) completed += 1;
    else if (session.status === MISSED) missed += 1;
    else pending += 1;

    // The soonest still-pending session is what reception books against next.
    if (session.status !== DONE && session.status !== MISSED && session.scheduled_date) {
      if (!nextSessionDate || session.scheduled_date < nextSessionDate) nextSessionDate = session.scheduled_date;
    }
  }

  const total = Math.max(0, Number(plan.total_sessions ?? 0) || 0);
  const planned = sessions.length;
  const remaining = Math.max(0, total - completed);

  return {
    total,
    planned,
    completed,
    missed,
    pending,
    remaining,
    percent: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : null,
    nextSessionDate,
    drifted: planned !== total,
  };
}

export type ServiceRollup = {
  /** null groups plans that predate the service link, or were never given one. */
  serviceId: string | null;
  plans: number;
  total: number;
  completed: number;
  remaining: number;
};

/**
 * Totals per service across every live plan for one patient.
 *
 * Cancelled plans are excluded: their sessions were released on cancellation, so
 * counting them would tell reception the patient still owns sessions they do not.
 * A plan with no `service_id` is grouped under `null` and labelled by the caller,
 * which keeps pre-migration plans visible instead of dropping them.
 */
export function summariseByService(
  plans: readonly PlanLike[],
  sessionsByPlan: Record<string, readonly SessionLike[] | undefined>,
): ServiceRollup[] {
  const byService = new Map<string | null, ServiceRollup>();

  for (const plan of plans) {
    if (plan.status === "cancelled") continue;
    const key = plan.service_id ?? null;
    const progress = planProgress(plan, sessionsByPlan[plan.id] ?? []);
    const entry = byService.get(key) ?? { serviceId: key, plans: 0, total: 0, completed: 0, remaining: 0 };
    entry.plans += 1;
    entry.total += progress.total;
    entry.completed += progress.completed;
    entry.remaining += progress.remaining;
    byService.set(key, entry);
  }

  // Most sessions still owed first: that is the order a desk works through.
  return [...byService.values()].sort((a, b) => b.remaining - a.remaining || b.total - a.total);
}
