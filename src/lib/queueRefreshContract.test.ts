import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// C6 freeze: the Queue board is refreshed by realtime events and by every desk
// action, and a refresh must not blank rows the desk is already reading.
//
// The rule lives in queueRefresh.ts so it can be unit-tested; this file is the
// other half — proof that Queue.tsx actually routes its loading states through
// it. A page that keeps the old `{loading ?` gate reads correctly in review and
// flickers in the clinic, which is exactly what this batch found.

const queue = readFileSync("src/pages/queue/Queue.tsx", "utf8");

/**
 * The lines the branch-keyed effect runs when a branch IS selected — the text
 * between the "no branch yet" guard's `return;` and the read it starts.
 */
const readyReloadPath = (() => {
  const read = queue.indexOf("void load();\n    // Realtime is also scoped");
  if (read === -1) return "";
  const effect = queue.lastIndexOf("useEffect(() => {", read);
  if (effect === -1) return "";
  const body = queue.slice(effect, read);
  const guard = body.indexOf("return;");
  return guard === -1 ? "" : body.slice(guard + "return;".length);
})();

describe("Queue refresh keeps the board it already showed", () => {
  it("asks the rule whether to blank the table", () => {
    expect(queue).toContain('showQueueSkeleton(loading, rows.length) ? (\n                <tr><td colSpan={8} className="p-0"><ListSkeleton rows={6} /></td></tr>');
  });

  it("asks the rule whether to blank the mobile cards", () => {
    expect(queue).toContain('showQueueSkeleton(loading, rows.length) ? (\n          <Card className="p-0 overflow-hidden"><ListSkeleton rows={5} /></Card>');
  });

  it("leaves no board gated on loading alone", () => {
    const bareGates = queue.match(/^\s*\{loading \?/gm) ?? [];
    expect(bareGates).toEqual([]);
  });

  it("counts the skeleton it owns, so a new board cannot skip the rule", () => {
    expect([...queue.matchAll(/<ListSkeleton/g)].length).toBe(2);
  });

  it("empties the board when the branch changes, before reading the new one", () => {
    expect(readyReloadPath).not.toBe("");
    expect(readyReloadPath).toMatch(/setRows\([\s\S]*?\[\]/);
  });

  it("still reloads on realtime events and on reconnect", () => {
    const realtime = queue.slice(queue.indexOf('name: `queue-appts'));
    expect(realtime).toContain("() => { void load(); }");
    expect(realtime).toContain("onReconnect: () => { void load(); }");
  });
});
