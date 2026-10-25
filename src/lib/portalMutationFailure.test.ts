import { describe, expect, it } from "vitest";
import { portalMutationFailure } from "./portalMutationFailure";

const http = (status: number, body: unknown) => ({
  name: "FunctionsHttpError",
  message: "Edge Function returned a non-2xx status code",
  context: { status, json: async () => body },
});

const UNCONFIRMED = {
  en: "The operation could not be confirmed. Refresh the account status before retrying; the password may have changed.",
  ar: "لم يتأكد إكمال العملية. حدّث حالة الحساب قبل إعادة المحاولة؛ ربما تغيرت كلمة المرور.",
};

describe("portal mutation failure reporting", () => {
  it("translates the precondition the operator can actually fix", async () => {
    const r = await portalMutationFailure(http(400, { error: "patient_email_required" }), null, "ar", UNCONFIRMED);
    expect(r.definitive).toBe(true);
    expect(r.title).toContain("البريد الإلكتروني");
    expect(r.title).not.toContain("كلمة المرور");
  });

  it("reports an enforced precondition as a finished failure", async () => {
    const r = await portalMutationFailure(http(409, { error: "Could not allocate a unique username" }), null, "en", UNCONFIRMED);
    expect(r).toEqual({ definitive: true, title: "Could not allocate a unique username" });
  });

  it("keeps the cautious wording when the mutation may have applied", async () => {
    const cases = [
      http(500, { error: 'Portal account provisioning failed: new row violates row-level security policy for table "patient_portal_accounts"' }),
      http(502, { error: "Email provider rejected the message with an unexpected upstream exception" }),
      new Error("Failed to send a request to the Edge Function"),
      null,
    ];
    for (const error of cases) {
      const r = await portalMutationFailure(error, null, "en", UNCONFIRMED);
      expect(r.definitive).toBe(false);
      expect(r.title).toBe(UNCONFIRMED.en);
      expect(r.description).toContain("Refresh the account status");
      expect(JSON.stringify(r)).not.toMatch(/row-level|non-2xx|Failed to send/);
    }
  });

  it("uses the body error only when it is a safe sentence", async () => {
    const r = await portalMutationFailure(null, "Forbidden", "en", UNCONFIRMED);
    expect(r.definitive).toBe(false);
    expect(r.title).toBe(UNCONFIRMED.en);
  });
});
