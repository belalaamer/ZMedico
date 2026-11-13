/**
 * Pure rules for the patient-conversation inbox.
 *
 * The inbox exists for one reason: `ai-agent-respond` moves a conversation to
 * `human_active` when it hands the patient to a person (or when its own turn
 * failed), and from that moment the AI refuses to answer (`ai-agent-respond`
 * bails unless `status = 'ai_active'`). A conversation in that state is a patient
 * waiting with nobody listening, so the queue order, the "needs a human" count
 * and the action set are decided here, in one testable place, instead of being
 * re-derived inside the screen.
 *
 * Kept free of React and of Supabase so the rules can be asserted directly.
 */

/** The three values the backend writes today (`ai-agent-respond`, `whatsapp-webhook`). */
export type ConversationStatus = "ai_active" | "human_active" | "closed";

export type InboxBucket = "needs_human" | "ai" | "closed";

export type ConversationRow = {
  id: string;
  status: string;
  last_message_at?: string | null;
  handoff_at?: string | null;
  [key: string]: unknown;
};

/** Anything the backend has not taught us yet is treated as needing a human. */
export function conversationBucket(status: string): InboxBucket {
  if (status === "ai_active") return "ai";
  if (status === "closed") return "closed";
  return "needs_human";
}

/**
 * A patient the AI handed over outranks a conversation the AI is still holding,
 * and both outrank closed history. Within a bucket the longest wait comes first:
 * `last_message_at` is the last thing the patient said, so the oldest one has
 * been unattended the longest.
 */
export function sortForDesk<T extends ConversationRow>(rows: readonly T[]): T[] {
  const rank = (bucket: InboxBucket) => (bucket === "needs_human" ? 0 : bucket === "ai" ? 1 : 2);
  return [...rows].sort((a, b) => {
    const byBucket = rank(conversationBucket(a.status)) - rank(conversationBucket(b.status));
    if (byBucket !== 0) return byBucket;
    const aAt = a.handoff_at ?? a.last_message_at ?? "";
    const bAt = b.handoff_at ?? b.last_message_at ?? "";
    if (aAt === bAt) return 0;
    if (!aAt) return 1;
    if (!bAt) return -1;
    return aAt < bAt ? -1 : 1;
  });
}

export function countByBucket(rows: readonly ConversationRow[]): Record<InboxBucket, number> {
  const counts: Record<InboxBucket, number> = { needs_human: 0, ai: 0, closed: 0 };
  for (const row of rows) counts[conversationBucket(row.status)] += 1;
  return counts;
}

/**
 * A human can only speak where a human holds the conversation. Letting a reply
 * be typed into an `ai_active` thread would produce two answers to one message,
 * and into a `closed` thread would resurrect it silently.
 */
export function canReply(status: string): boolean {
  return conversationBucket(status) === "needs_human";
}

/**
 * Taking over is stepping in front of the assistant, so it only makes sense on a
 * thread the assistant still owns. A closed thread has nobody to take over from:
 * the next inbound message starts a new conversation (`whatsapp-webhook` only
 * reuses a conversation whose status is not 'closed').
 */
export function canTakeOver(status: string): boolean {
  return conversationBucket(status) === "ai";
}

/** Handing back is the undo of taking over, and requires a human to hold it. */
export function canHandBack(status: string): boolean {
  return conversationBucket(status) === "needs_human";
}

export function canClose(status: string): boolean {
  return conversationBucket(status) !== "closed";
}

/** What the status word reads as on screen. */
export function bucketLabel(bucket: InboxBucket, lang: "ar" | "en"): string {
  if (lang === "ar") {
    return bucket === "needs_human" ? "بانتظار موظف" : bucket === "ai" ? "المساعد يردّ" : "مغلقة";
  }
  return bucket === "needs_human" ? "Waiting for staff" : bucket === "ai" ? "Assistant replying" : "Closed";
}

/**
 * One-line preview of a message body for the queue list. Collapses whitespace so
 * a message that is mostly newlines does not render as an empty row, and clips on
 * the code-unit boundary without splitting a surrogate pair.
 */
export function previewOf(content: string | null | undefined, max = 90): string {
  const flat = String(content ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const clipped = flat.slice(0, Math.max(0, max - 1));
  // Do not cut a surrogate pair in half: an emoji would render as a replacement glyph.
  const lastCode = clipped.charCodeAt(clipped.length - 1);
  const safe = lastCode >= 0xd800 && lastCode <= 0xdbff ? clipped.slice(0, -1) : clipped;
  return `${safe}…`;
}

/**
 * How long a patient has been waiting, as a short phrase. Minutes below an hour,
 * hours below a day, days above it — the granularity a receptionist triages on.
 */
export function waitedFor(since: string | null | undefined, now: Date): { unit: "minutes" | "hours" | "days"; value: number } | null {
  if (!since) return null;
  const at = new Date(since).getTime();
  if (Number.isNaN(at)) return null;
  const minutes = Math.floor(Math.max(0, now.getTime() - at) / 60_000);
  if (minutes < 60) return { unit: "minutes", value: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hours", value: hours };
  return { unit: "days", value: Math.floor(hours / 24) };
}

export function waitedLabel(since: string | null | undefined, now: Date, lang: "ar" | "en"): string {
  const waited = waitedFor(since, now);
  if (!waited) return "";
  const { unit, value } = waited;
  if (lang === "ar") {
    if (unit === "minutes") return value <= 1 ? "الآن" : `منتظر ${value} دقيقة`;
    if (unit === "hours") return `منتظر ${value} ساعة`;
    return `منتظر ${value} يوم`;
  }
  if (unit === "minutes") return value <= 1 ? "just now" : `waiting ${value} min`;
  if (unit === "hours") return `waiting ${value} h`;
  return `waiting ${value} d`;
}

/**
 * The status a staff action writes. `take_over` and `hand_back` are the two halves
 * of the human handoff; `close` ends the thread so the next inbound message starts
 * a new one (`whatsapp-webhook` only reuses a conversation whose status is not
 * 'closed').
 */
export type InboxAction = "take_over" | "hand_back" | "close";

export function statusForAction(action: InboxAction): ConversationStatus {
  if (action === "take_over") return "human_active";
  if (action === "hand_back") return "ai_active";
  return "closed";
}

/** Whether the action is legal for the conversation's current status. */
export function actionAllowed(action: InboxAction, status: string): boolean {
  if (action === "take_over") return canTakeOver(status);
  if (action === "hand_back") return canHandBack(status);
  return canClose(status);
}
