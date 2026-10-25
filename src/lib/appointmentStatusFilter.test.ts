import { describe, expect, it } from "vitest";
import { matchesStatusFilter, nextStatusFilter, STATUS_GROUPS } from "./appointmentStatusFilter";

const ALL: Array<"scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show" | "departed"> = [
  "scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show", "departed",
];

describe("calendar status filter tokens", () => {
  it("keeps every group token out of the single-status namespace", () => {
    for (const token of Object.keys(STATUS_GROUPS)) {
      expect(ALL).not.toContain(token);
    }
  });

  it("matches a group over all of its statuses", () => {
    for (const s of ALL) {
      expect(matchesStatusFilter("upcoming", s)).toBe(s === "scheduled" || s === "confirmed");
      expect(matchesStatusFilter("missed", s)).toBe(s === "cancelled" || s === "no_show");
    }
  });

  it("still matches a plain status picked from the select", () => {
    for (const s of ALL) {
      expect(matchesStatusFilter(s, s)).toBe(true);
      expect(matchesStatusFilter("completed", s)).toBe(s === "completed");
    }
  });

  it("shows everything for 'all' and nothing for an unknown token", () => {
    expect(ALL.every((s) => matchesStatusFilter("all", s))).toBe(true);
    expect(ALL.some((s) => matchesStatusFilter("__none__", s))).toBe(false);
  });

  it("groups only the statuses the card claims to count", () => {
    expect(matchesStatusFilter("upcoming", "in_progress")).toBe(false);
    expect(matchesStatusFilter("upcoming", "departed")).toBe(false);
    expect(matchesStatusFilter("missed", "cancelled")).toBe(true);
    expect(matchesStatusFilter("missed", "no_show")).toBe(true);
    expect(matchesStatusFilter("missed", "completed")).toBe(false);
  });

  it("toggles a card off on the second click", () => {
    expect(nextStatusFilter("all", "upcoming")).toBe("upcoming");
    expect(nextStatusFilter("upcoming", "upcoming")).toBe("all");
    expect(nextStatusFilter("completed", "upcoming")).toBe("upcoming");
    expect(nextStatusFilter("all", "all")).toBe("all");
  });
});
