import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// C6 freeze: a live board re-reads itself on realtime events and after every
// desk action, and a re-read must not blank the rows the desk is reading.
//
// The rule itself is one line and is unit-tested in quietRefresh.test.ts. This
// file is the other half, and the half that actually broke the clinic: a page
// that keeps a `{loading ?` gate reads correctly in review and flickers on the
// floor. It also freezes the pairing that makes the rule safe — quiet refresh is
// only honest once the branch-keyed effect drops the previous branch's rows.

const BOARDS = [
  { page: "Queue", file: "src/pages/queue/Queue.tsx", channel: "queue-appts" },
  { page: "PendingBookings", file: "src/pages/appointments/PendingBookings.tsx", channel: "pending-bookings" },
];

/** The board's source, for the pages that hold rows in local state. */
const source = (file: string) => readFileSync(file, "utf8");

/**
 * The lines the branch-keyed effect runs when a branch IS selected — the text
 * between its "no branch yet" guard and the subscription it opens. A row clear
 * inside this window happens on every branch change; the guard's own clear only
 * runs when nothing is selected, which was already true before this fix.
 */
function reloadWindow(file: string, channel: string): string {
  const src = source(file);
  const topic = src.indexOf(`name: \`${channel}`);
  const effect = topic === -1 ? -1 : src.lastIndexOf("useEffect(() => {", topic);
  if (effect === -1) return "";
  const body = src.slice(effect, topic);
  const guard = body.indexOf("return;");
  return guard === -1 ? "" : body.slice(guard + "return;".length);
}

describe.each(BOARDS)("$page keeps its rows through a refresh", ({ file, channel }) => {
  it("asks the rule before blanking the board", () => {
    expect(source(file)).toContain("showLoadingPlaceholder(loading, rows.length)");
  });

  it("leaves no board gated on loading alone", () => {
    expect(source(file).match(/^\s*\{loading \?/gm) ?? []).toEqual([]);
  });

  it("empties the board when the branch changes, before reading the new one", () => {
    const reloadSlice = reloadWindow(file, channel);
    expect(reloadSlice).not.toBe("");
    expect(reloadSlice).toMatch(/setRows\([\s\S]*?\[\][\s\S]*?void load\(\)/);
  });

  it("still reloads on realtime events and on reconnect", () => {
    const realtime = source(file).slice(source(file).indexOf(`name: \`${channel}`));
    expect(realtime).toMatch(/void load\(\)/);
    expect(realtime).toMatch(/onReconnect: \(\) => (?:\{ )?void load\(\)/);
  });
});

describe("Queue board placeholders", () => {
  it("counts the skeleton it owns, so a new board cannot skip the rule", () => {
    expect([...source("src/pages/queue/Queue.tsx").matchAll(/<ListSkeleton/g)].length).toBe(2);
  });
});
