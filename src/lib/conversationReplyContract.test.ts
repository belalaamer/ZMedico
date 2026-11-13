// Structural guard for the staff-reply function. Behavioural tests cannot import
// a `Deno.serve` module from Vitest, so the invariants that caused the open
// defects are asserted against the real source text. Each assertion names the
// defect it prevents from coming back.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/send-conversation-reply/index.ts"),
  "utf8",
);
const SHARED = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/whatsapp-send.ts"),
  "utf8",
);
const MIGRATION = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261112093000_communication_inbox_and_human_handoff.sql"),
  "utf8",
);

describe("B1 — authorisation runs as the caller, not the service role", () => {
  it("checks branch access on the caller's client", () => {
    expect(SRC).toMatch(/caller\.rpc\("user_has_branch_access"/);
    expect(SRC).not.toMatch(/service\.rpc\("user_has_branch_access"/);
  });

  it("does not treat a NULL branch as blanket permission", () => {
    // A branch-less conversation must be scoped by tenant, never by "null is ok".
    expect(SRC).toMatch(/caller\.rpc\("user_has_tenant_access"/);
    expect(SRC).toMatch(/conversation\.branch_id\s*\n?\s*\?/);
  });

  it("still checks the permission against the caller's own id", () => {
    expect(SRC).toMatch(/caller\.rpc\("has_permission",\s*\{[\s\S]*?userData\.user\.id/);
  });
});

describe("S5 — no silent platform-wide credential fallback", () => {
  it("never reads a platform WhatsApp token or phone id from the environment", () => {
    expect(SRC).not.toMatch(/META_ACCESS_TOKEN/);
    expect(SRC).not.toMatch(/META_PHONE_NUMBER_ID/);
    expect(SHARED).not.toMatch(/META_ACCESS_TOKEN/);
    expect(SHARED).not.toMatch(/META_PHONE_NUMBER_ID/);
  });

  it("sends through the shared branch-aware provider module", () => {
    expect(SRC).toMatch(/from "\.\.\/_shared\/whatsapp-send\.ts"/);
    expect(SRC).toMatch(/sendConversationReply\(/);
  });
});

describe("B4 — every outcome is recorded, and sends are claimed once", () => {
  it("claims the send atomically before contacting a provider", () => {
    expect(SRC).toMatch(/claim_conversation_reply/);
    expect(SRC).toMatch(/already being sent/);
  });

  it("does not write when the caller is not authorised", () => {
    // A refusal must be a no-op: `fail()` runs with the service role, so calling
    // it on an authorisation failure would let a staff member from another branch
    // flip the delivery status of a row they may not touch.
    const start = SRC.indexOf("const { data: permitted }");
    const end = SRC.indexOf("if (conversation.status !==");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(SRC.slice(start, end)).not.toMatch(/\bfail\(/);
  });

  it("routes post-authorisation refusals through fail(), so no row is left queued", () => {
    // Everything after `const fail` must not return a bare error without first
    // marking the message failed. The allowed bare errors are: an authorisation
    // refusal (deliberately a no-op), and the two "already sent / in flight"
    // answers, which are terminal states rather than stuck ones.
    const tail = SRC.slice(SRC.indexOf("const fail ="));
    const bare = [...tail.matchAll(/return jsonResponse\(\{ error:[^\n]*\n?/g)].map((m) => m[0]);
    for (const line of bare) {
      expect(line).toMatch(/FORBIDDEN|ALREADY_SENT|IN_FLIGHT/);
    }
    expect(tail).toMatch(/delivery_status: "failed"/);
  });

  it("marks a failed send with the provider's reason", () => {
    expect(SRC).toMatch(/raw_payload: \{ provider_error: \{ code, message: error \} \}/);
  });

  it("checks the outcome write and reports whether it landed", () => {
    // A failed send and a failed *recording* of that send are different facts. If
    // the outcome UPDATE is ignored, the caller is told `failed` was saved while
    // the row is still `queued`.
    const block = SRC.slice(SRC.indexOf("const fail ="), SRC.indexOf("if (message.delivery_status === \"sent\")"));
    expect(block).toMatch(/\.select\("id"\)/);
    expect(block).toMatch(/const recorded = !patchError/);
    expect(block).toMatch(/jsonResponse\(\{ error, code, recorded \}/);
  });

  it("rejects a message the browser did not attribute to staff", () => {
    expect(SRC).toMatch(/message\.sender_type !== "staff"/);
  });

  it("only advances a claimed row that is not already sent", () => {
    expect(SRC).toMatch(/\.neq\("delivery_status", "sent"\)/);
  });
});

describe("review point 3 — the claim can recover from a crash", () => {
  it("bounds the claim in time so a dead attempt cannot wedge the row", () => {
    expect(MIGRATION).toMatch(/p_stale_after_seconds/);
    expect(MIGRATION).toMatch(/make_interval\(secs =>/);
  });

  it("counts attempts so a recovery is visible, and never reclaims a sent row", () => {
    expect(MIGRATION).toMatch(/send_attempt/);
    expect(MIGRATION).toMatch(/delivery_status = 'queued'/);
  });

  it("distinguishes 'already sent' from 'in flight' instead of assuming success", () => {
    expect(SRC).toMatch(/current\?\.delivery_status === "sent"/);
    expect(SRC).toMatch(/IN_FLIGHT/);
  });

  it("does not claim exactly-once delivery at the provider", () => {
    expect(MIGRATION).toMatch(/does NOT[\s\S]{0,80}exactly-once/i);
  });
});
