import { describe, expect, it } from "vitest";
import { reminderSendOutcome } from "./reminderSendOutcome";

const http = (status: number, body: unknown) => ({
  name: "FunctionsHttpError",
  message: "Edge Function returned a non-2xx status code",
  context: { status, json: async () => body },
});

describe("reminder send reporting", () => {
  it("warns about duplicate sends instead of reporting a plain failure", async () => {
    const r = await reminderSendOutcome({
      data: null,
      error: http(500, { processed: 12, sent: 11, failed: 0, results: [], sent_unconfirmed: [{ id: "a" }, { id: "b" }] }),
      lang: "en",
    });
    expect(r.tone).toBe("error");
    expect(r.title).toBe("Sent but not recorded");
    expect(r.description).toContain("delivers the message twice");
    expect(r.description).toContain("2 of 12");
  });

  it("keeps the Arabic duplicate warning in Arabic", async () => {
    const r = await reminderSendOutcome({
      data: null,
      error: http(500, { processed: 3, sent_unconfirmed: [{ id: "a" }] }),
      lang: "ar",
    });
    expect(r.title).toBe("أُرسلت دون أن تُسجَّل");
    expect(r.description).toContain("مرتين");
  });

  it("surfaces the function's own batch and rate-limit reasons", async () => {
    const big = await reminderSendOutcome({ data: null, error: http(413, { error: "Batch too large", max_batch: 200 }), lang: "en" });
    expect(big.title).toBe("Batch too large");
    expect(big.description).toContain("200");
    const limited = await reminderSendOutcome({ data: null, error: http(429, { error: "Too many reminder sends, please retry shortly" }), lang: "en" });
    expect(limited.title).toBe("Too many reminder sends, please retry shortly");
    expect(limited.description).toContain("Wait a minute");
  });

  it("never shows the generic invoke sentence", async () => {
    const r = await reminderSendOutcome({ data: null, error: new Error("Edge Function returned a non-2xx status code"), lang: "en" });
    expect(JSON.stringify(r)).not.toContain("non-2xx");
    expect(r.title).toBe("Sending reminders failed.");
  });

  it("summarises a successful batch in the active language", async () => {
    const en = await reminderSendOutcome({ data: { processed: 10, sent: 8, failed: 1, deferred: 1, results: [] }, error: null, lang: "en" });
    expect(en).toEqual({ tone: "error", title: "Sent 8, failed 1", description: "1 are not due yet and were left pending." });
    const ar = await reminderSendOutcome({ data: { processed: 4, sent: 4, failed: 0, results: [] }, error: null, lang: "ar" });
    expect(ar).toEqual({ tone: "success", title: "تم إرسال 4 وفشل 0", description: undefined });
  });

  it("reports an empty batch honestly", async () => {
    expect((await reminderSendOutcome({ data: { processed: 0, sent: 0, failed: 0, results: [] }, error: null, lang: "en" })).title).toBe("No reminders were due");
    expect((await reminderSendOutcome({ data: null, error: null, lang: "en" })).tone).toBe("error");
  });

  it("reports a single send from its result row", async () => {
    const ok = await reminderSendOutcome({ data: { processed: 1, sent: 1, failed: 0, results: [{ ok: true }] }, error: null, lang: "en", single: true });
    expect(ok).toEqual({ tone: "success", title: "Reminder sent" });
    const bad = await reminderSendOutcome({ data: { processed: 1, sent: 0, failed: 1, results: [{ ok: false, error: 'patient not found for table "x"' }] }, error: null, lang: "en", single: true });
    expect(bad.tone).toBe("error");
    expect(bad.title).toBe("The reminder was not sent.");
    const provider = await reminderSendOutcome({ data: { results: [{ ok: false, error: "Patient has no email" }] }, error: null, lang: "ar", single: true });
    expect(provider.title).toBe("Patient has no email");
  });
});
