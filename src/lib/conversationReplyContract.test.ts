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
    expect(SRC).toMatch(/already being sent or was sent/);
  });

  it("routes post-lookup refusals through fail(), so no row is left queued", () => {
    // Everything after `const fail` must not return a bare error without first
    // marking the message failed. The only allowed bare errors are the two
    // "already sent" answers, which are a terminal success state, not a stuck one.
    const tail = SRC.slice(SRC.indexOf("const fail ="));
    const bare = [...tail.matchAll(/return jsonResponse\(\{ error:[^\n]*\n?/g)].map((m) => m[0]);
    for (const line of bare) {
      expect(line).toMatch(/ALREADY_SENT/);
    }
    expect(tail).toMatch(/delivery_status: "failed"/);
  });

  it("marks a failed send with the provider's reason", () => {
    expect(SRC).toMatch(/raw_payload: \{ provider_error: \{ code, message: error \} \}/);
  });

  it("only advances a claimed row that is not already sent", () => {
    expect(SRC).toMatch(/\.neq\("delivery_status", "sent"\)/);
  });
});
