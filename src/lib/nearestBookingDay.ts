export async function nearestBookingDay<T extends { available: boolean }>(
  start: string, end: string, workingDays: number[] | null,
  load: (day: string) => Promise<T[]>, isCurrent: () => boolean,
) {
  for (let offset = 0; offset < 14; offset += 1) {
    if (!isCurrent()) return null;
    const candidate = new Date(`${start}T12:00:00Z`);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const day = candidate.toISOString().slice(0, 10);
    if (day > end) break;
    if (workingDays?.length && !workingDays.includes(candidate.getUTCDay())) continue;
    const slots = await load(day);
    if (!isCurrent()) return null;
    const available = slots.filter(slot => slot.available);
    if (available.length) return { day, slots: available };
  }
  return null;
}
