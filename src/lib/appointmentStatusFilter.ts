// Shared vocabulary for the calendar's status filter.
//
// The stat cards counted groups (scheduled+confirmed, cancelled+no-show) but
// clicking a card filtered to one single status, so the card promised a number
// the list never delivered. Group tokens keep both sides answering to the same
// name, and `resolveStatusFilter` lets the cards facet-count over the rows that
// the strip itself is hiding.

import type { ApptStatus } from "./appointmentStatus";

export const STATUS_GROUPS: Record<string, readonly ApptStatus[]> = {
  upcoming: ["scheduled", "confirmed"],
  missed: ["cancelled", "no_show"],
};

export type StatusFilterToken = "all" | keyof typeof STATUS_GROUPS | ApptStatus;

export function matchesStatusFilter(filter: string, status: string): boolean {
  if (filter === "all") return true;
  const group = STATUS_GROUPS[filter];
  return group ? group.includes(status as ApptStatus) : filter === status;
}

/** Re-clicking an active card clears it; clicking another card switches to it. */
export function nextStatusFilter(current: string, cardKey: string): string {
  return current === cardKey ? "all" : cardKey;
}
