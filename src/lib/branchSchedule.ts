// Shared branch schedule helpers.
//
// Source of truth: `branches.working_days` (integer[] where 0=Sun ... 6=Sat)
// and `branches.working_hours_start` / `branches.working_hours_end`.
//
// Every screen that renders branch availability (Calendar, Appointments,
// Queue, summary cards, etc.) should consume these helpers so the display
// and logic stay in sync across the app.

import { supabase } from "@/integrations/supabase/client";
import type { Lang } from "@/lib/i18n";

export const ALL_DAYS: number[] = [0, 1, 2, 3, 4, 5, 6];

// Short labels, index = JS Date.getDay() (0=Sun ... 6=Sat)
const SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_AR = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];
const LONG_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function dayShort(d: number, lang: Lang = "en") {
  return (lang === "ar" ? SHORT_AR : SHORT_EN)[((d % 7) + 7) % 7];
}
export function dayLong(d: number, lang: Lang = "en") {
  return (lang === "ar" ? LONG_AR : LONG_EN)[((d % 7) + 7) % 7];
}

export type BranchSchedule = {
  working_days: number[];
  working_hours_start: string | null;
  working_hours_end: string | null;
};

/** Normalize a raw working_days value (could be null/undefined) to a sorted unique array. */
export function normalizeDays(days: unknown): number[] {
  if (!Array.isArray(days)) return [...ALL_DAYS];
  const set = new Set<number>();
  for (const v of days) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 6) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

export function isBranchOpenOn(day: number, workingDays: number[] | null | undefined) {
  return normalizeDays(workingDays).includes(((day % 7) + 7) % 7);
}

/**
 * Human-readable summary of active days, collapsing runs into ranges.
 * e.g. [1,2,3,4,5] -> "Mon–Fri", [0,6] -> "Sun, Sat"
 * Returns a "Closed" string when there are no active days.
 */
export function formatWorkingDays(
  days: number[] | null | undefined,
  lang: Lang = "en",
  closedLabel?: string,
): string {
  const list = normalizeDays(days);
  if (list.length === 0) return closedLabel ?? (lang === "ar" ? "مغلق" : "Closed");
  if (list.length === 7) return lang === "ar" ? "كل الأيام" : "Every day";
  // Group consecutive runs
  const runs: [number, number][] = [];
  let start = list[0], prev = list[0];
  for (let i = 1; i < list.length; i++) {
    const d = list[i];
    if (d === prev + 1) { prev = d; continue; }
    runs.push([start, prev]);
    start = d; prev = d;
  }
  runs.push([start, prev]);
  const sep = lang === "ar" ? "، " : ", ";
  return runs
    .map(([a, b]) => (a === b ? dayShort(a, lang) : `${dayShort(a, lang)}–${dayShort(b, lang)}`))
    .join(sep);
}

/** HH:MM slice helper (branches store time as "HH:MM:SS"). */
export function fmtTime(t: string | null | undefined) {
  if (!t) return "—";
  return t.slice(0, 5);
}

/** One-line summary combining days + hours for a branch. */
export function formatBranchAvailability(s: BranchSchedule | null | undefined, lang: Lang = "en") {
  if (!s) return lang === "ar" ? "غير محدد" : "Not set";
  const days = formatWorkingDays(s.working_days, lang);
  const start = fmtTime(s.working_hours_start);
  const end = fmtTime(s.working_hours_end);
  if (!s.working_hours_start || !s.working_hours_end) return days;
  return `${days} · ${start}–${end}`;
}

/** Fetch schedule for one branch. Returns null if not found. */
export async function fetchBranchSchedule(branchId: string): Promise<BranchSchedule | null> {
  const { data } = await supabase
    .from("branches")
    .select("working_days,working_hours_start,working_hours_end")
    .eq("id", branchId)
    .maybeSingle();
  if (!data) return null;
  return {
    working_days: normalizeDays((data as any).working_days),
    working_hours_start: (data as any).working_hours_start ?? null,
    working_hours_end: (data as any).working_hours_end ?? null,
  };
}