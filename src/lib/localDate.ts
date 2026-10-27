/** Returns a calendar date in the browser's local timezone as YYYY-MM-DD. */
export function localDateOnly(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns a date-time in the browser's local timezone as YYYY-MM-DDTHH:MM, the
 * value format an <input type="datetime-local"> reads back as *wall-clock* time.
 * `toISOString().slice(0, 16)` looks equivalent and is not: it is UTC, so a
 * Cairo clock shows a time three hours early and `new Date(value)` then parses
 * that back as local, shifting the stored instant by the whole offset.
 */
export function localDateTimeInput(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
