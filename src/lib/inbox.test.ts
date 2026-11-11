import { describe, expect, it } from "vitest";
import {
  actionAllowed,
  bucketLabel,
  canClose,
  canHandBack,
  canReply,
  canTakeOver,
  conversationBucket,
  countByBucket,
  previewOf,
  sortForDesk,
  statusForAction,
  waitedFor,
  waitedLabel,
} from "./inbox";

// The backend writes exactly three statuses: `ai-agent-respond` sets
// 'human_active' on handoff (and on a failed turn), `whatsapp-webhook` reuses any
// conversation whose status is not 'closed', and the AI only speaks while
// 'ai_active'. Everything below is written against those three.

describe("the inbox queue", () => {
  it("treats a handoff as needing a human", () => {
    expect(conversationBucket("human_active")).toBe("needs_human");
    expect(conversationBucket("ai_active")).toBe("ai");
    expect(conversationBucket("closed")).toBe("closed");
  });

  it("treats an unknown status as needing a human rather than hiding it", () => {
    // A status this build has never seen is either new or corrupt. Sorting it into
    // "the assistant is handling it" or "closed" would let a patient wait unseen.
    expect(conversationBucket("something_new")).toBe("needs_human");
    expect(conversationBucket("")).toBe("needs_human");
  });

  it("puts the patient handed over longest ago at the top", () => {
    const rows = [
      { id: "ai-new", status: "ai_active", last_message_at: "2026-11-12T10:00:00.000Z" },
      { id: "closed", status: "closed", last_message_at: "2026-11-01T10:00:00.000Z" },
      { id: "human-late", status: "human_active", last_message_at: "2026-11-12T09:00:00.000Z" },
      { id: "human-early", status: "human_active", last_message_at: "2026-11-12T08:00:00.000Z" },
    ];
    expect(sortForDesk(rows).map((r) => r.id)).toEqual([
      "human-early",
      "human-late",
      "ai-new",
      "closed",
    ]);
  });

  it("ranks a handed-off thread by handoff_at when the two disagree", () => {
    // handoff_at is when the AI gave up; last_message_at can be older than that if
    // the patient wrote before the handoff and nothing arrived since.
    const rows = [
      { id: "a", status: "human_active", handoff_at: "2026-11-12T11:00:00.000Z", last_message_at: "2026-11-12T07:00:00.000Z" },
      { id: "b", status: "human_active", handoff_at: "2026-11-12T09:00:00.000Z", last_message_at: "2026-11-12T09:30:00.000Z" },
    ];
    expect(sortForDesk(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("keeps a row with no timestamp but does not let it jump the queue", () => {
    const rows = [
      { id: "timed", status: "human_active", last_message_at: "2026-11-12T08:00:00.000Z" },
      { id: "untimed", status: "human_active", last_message_at: null },
    ];
    expect(sortForDesk(rows).map((r) => r.id)).toEqual(["timed", "untimed"]);
  });

  it("counts each bucket once and sums to the row count", () => {
    const counts = countByBucket([
      { id: "1", status: "human_active" },
      { id: "2", status: "human_active" },
      { id: "3", status: "ai_active" },
      { id: "4", status: "closed" },
    ]);
    expect(counts).toEqual({ needs_human: 2, ai: 1, closed: 1 });
    expect(counts.needs_human + counts.ai + counts.closed).toBe(4);
  });
});

describe("what a staff member may do", () => {
  it("only answers where a human holds the thread", () => {
    // Answering an 'ai_active' thread would put two answers on one patient message;
    // answering a 'closed' one would resurrect it behind the AI's back.
    expect(canReply("human_active")).toBe(true);
    expect(canReply("ai_active")).toBe(false);
    expect(canReply("closed")).toBe(false);
  });

  it("takes over only what the assistant still owns", () => {
    expect(canTakeOver("ai_active")).toBe(true);
    expect(canTakeOver("human_active")).toBe(false);
    expect(canTakeOver("closed")).toBe(false);
  });

  it("hands back only what a human holds", () => {
    expect(canHandBack("human_active")).toBe(true);
    expect(canHandBack("ai_active")).toBe(false);
  });

  it("cannot close what is already closed", () => {
    expect(canClose("human_active")).toBe(true);
    expect(canClose("ai_active")).toBe(true);
    expect(canClose("closed")).toBe(false);
  });

  it("maps each action to the status the backend already understands", () => {
    expect(statusForAction("take_over")).toBe("human_active");
    expect(statusForAction("hand_back")).toBe("ai_active");
    expect(statusForAction("close")).toBe("closed");
  });

  it("refuses an action on a status it does not fit", () => {
    expect(actionAllowed("take_over", "ai_active")).toBe(true);
    expect(actionAllowed("take_over", "human_active")).toBe(false);
    expect(actionAllowed("hand_back", "ai_active")).toBe(false);
    expect(actionAllowed("close", "closed")).toBe(false);
  });
});

describe("the queue row copy", () => {
  it("flattens a body to one line", () => {
    expect(previewOf("  هل\n\nعندكم  موعد\tبكرة؟  ")).toBe("هل عندكم موعد بكرة؟");
  });

  it("clips with an ellipsis and never splits a surrogate pair", () => {
    expect(previewOf("abcdef", 4)).toBe("abc…");
    // 3 code units is one complete astral character plus room for nothing else:
    // a naive slice of 2 would leave half an emoji behind.
    const emoji = "😀😀😀";
    const clipped = previewOf(emoji, 3);
    expect(clipped).toBe("😀…");
    expect(clipped).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(previewOf(emoji, 2)).toBe("…");
  });

  it("returns an empty string for a missing body", () => {
    expect(previewOf(null)).toBe("");
    expect(previewOf(undefined)).toBe("");
  });

  it("reads the three buckets in both languages", () => {
    expect(bucketLabel("needs_human", "en")).toBe("Waiting for staff");
    expect(bucketLabel("needs_human", "ar")).toBe("بانتظار موظف");
    expect(bucketLabel("ai", "en")).toBe("Assistant replying");
    expect(bucketLabel("closed", "ar")).toBe("مغلقة");
  });
});

describe("how long the patient has waited", () => {
  const now = new Date("2026-11-12T12:00:00.000Z");

  it("steps minutes, hours, then days", () => {
    expect(waitedFor("2026-11-12T11:30:00.000Z", now)).toEqual({ unit: "minutes", value: 30 });
    expect(waitedFor("2026-11-12T09:00:00.000Z", now)).toEqual({ unit: "hours", value: 3 });
    expect(waitedFor("2026-11-09T12:00:00.000Z", now)).toEqual({ unit: "days", value: 3 });
  });

  it("does not report a negative wait from a clock that is ahead", () => {
    expect(waitedFor("2026-11-12T12:05:00.000Z", now)).toEqual({ unit: "minutes", value: 0 });
  });

  it("returns nothing for a missing or unparsable timestamp", () => {
    expect(waitedFor(null, now)).toBeNull();
    expect(waitedFor("not-a-date", now)).toBeNull();
    expect(waitedLabel(undefined, now, "en")).toBe("");
  });

  it("says it in the desk's own words", () => {
    expect(waitedLabel("2026-11-12T11:30:00.000Z", now, "en")).toBe("waiting 30 min");
    expect(waitedLabel("2026-11-12T09:00:00.000Z", now, "en")).toBe("waiting 3 h");
    expect(waitedLabel("2026-11-09T12:00:00.000Z", now, "en")).toBe("waiting 3 d");
    expect(waitedLabel("2026-11-12T11:59:30.000Z", now, "en")).toBe("just now");
    expect(waitedLabel("2026-11-12T11:30:00.000Z", now, "ar")).toBe("منتظر 30 دقيقة");
  });
});
