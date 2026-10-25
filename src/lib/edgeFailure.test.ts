import { describe, expect, it } from "vitest";
import { describeEdgeFailure, edgeCode, edgeCount, invokeFailureReason } from "./edgeFailure";

function httpError(status: number, body: unknown) {
  return {
    name: "FunctionsHttpError",
    message: "Edge Function returned a non-2xx status code",
    context: { status, json: async () => body },
  };
}

const FALLBACK = "The request could not be completed.";

describe("edge failure unwrapping", () => {
  it("surfaces the function's own reason instead of the generic sentence", async () => {
    const r = await describeEdgeFailure(httpError(429, { error: "Too many attempts. Try again later." }), FALLBACK);
    expect(r.message).toBe("Too many attempts. Try again later.");
    expect(r.status).toBe(429);
    expect(JSON.stringify(r)).not.toContain("non-2xx");
  });

  it("exposes numeric counters and machine codes without leaking prose", async () => {
    const r = await describeEdgeFailure(
      httpError(413, { error: "Batch too large", max_batch: 200, hint: "split it" }),
      FALLBACK,
    );
    expect(r.message).toBe("Batch too large");
    expect(edgeCount(r.body, "max_batch")).toBe(200);
    expect(edgeCode({ error: "patient_email_required" })).toBe("patient_email_required");
  });

  it("keeps a bare code out of the message so the caller can translate it", async () => {
    const r = await describeEdgeFailure(httpError(400, { error: "patient_email_required" }), FALLBACK);
    expect(r.message).toBe(FALLBACK);
    expect(r.code).toBe("patient_email_required");
  });

  it.each([
    'Portal account provisioning failed: new row violates row-level security policy for table "patient_portal_accounts"',
    "Connection terminated due to connection timeout (SQLSTATE 08006)",
    "TypeError: Failed to fetch at Object.fetch (deno:core:1:1)",
    "JWT could not be decoded: {\"code\":\"401\"}",
    "see https://docs.example.com/troubleshoot for the internal cause",
  ])("refuses to render internals: %s", async (leak) => {
    const r = await describeEdgeFailure(httpError(500, { error: leak }), FALLBACK);
    expect(r.message).toBe(FALLBACK);
    expect(JSON.stringify(r.message)).not.toMatch(/SQLSTATE|deno|docs\.example|row-level|decoded/);
  });

  it("falls back when the body is unreadable or the transport itself failed", async () => {
    expect((await describeEdgeFailure({ message: "Edge Function returned a non-2xx status code", context: { json: async () => { throw new Error("body already consumed"); } } }, FALLBACK)).message).toBe(FALLBACK);
    expect((await describeEdgeFailure({ message: "Failed to send a request to the Edge Function" }, FALLBACK)).message).toBe(FALLBACK);
    expect((await describeEdgeFailure({ message: "Relay Error invoking the Edge Function" }, FALLBACK)).message).toBe(FALLBACK);
    expect((await describeEdgeFailure("Edge Function returned a non-2xx status code", FALLBACK)).message).toBe(FALLBACK);
    expect((await describeEdgeFailure(undefined, FALLBACK)).message).toBe(FALLBACK);
  });

  it("never renders the transport error's own message", async () => {
    const r = await describeEdgeFailure(new Error("sensitive provider details"), FALLBACK);
    expect(r.message).toBe(FALLBACK);
    expect(JSON.stringify(r)).not.toContain("sensitive");
  });

  it("reads a status from the body or the generic message", async () => {
    expect((await describeEdgeFailure({ message: "Edge Function returned a non-2xx status code" }, FALLBACK)).status).toBeNull();
    expect((await describeEdgeFailure({ message: "FunctionsHttpError: 503 raised", context: { json: async () => ({ error: "Authentication service temporarily unavailable" }) } }, FALLBACK)).status).toBeNull();
    expect((await describeEdgeFailure({ message: "non-2xx status code 503", context: { json: async () => ({ error: "Authentication service temporarily unavailable" }) } }, FALLBACK)).status).toBe(503);
  });

  it("does not invent a status when none is present", async () => {
    const r = await describeEdgeFailure(httpError(401, { error: "Invalid credentials" }), FALLBACK);
    expect(r.message).toBe("Invalid credentials");
    expect(r.status).toBe(401);
  });
});

describe("invoke failure reason", () => {
  it("prefers the withheld body over a 200-level reason", async () => {
    expect(await invokeFailureReason(httpError(403, { error: "Forbidden: admin only" }), "ignored", FALLBACK)).toBe("Forbidden: admin only");
  });

  it("reads the reason off an HTTP 200 that carries one", async () => {
    expect(await invokeFailureReason(null, "Only the System Owner may create another System Owner", FALLBACK))
      .toBe("Only the System Owner may create another System Owner");
  });

  it.each([[null, "not_configured"], [null, undefined], [{ message: "Failed to send a request to the Edge Function" }, undefined], [new Error("sensitive provider details"), ""]])(
    "degrades to the caller copy for %o / %o",
    async (error, bodyError) => {
      expect(await invokeFailureReason(error, bodyError, FALLBACK)).toBe(FALLBACK);
    },
  );
});
