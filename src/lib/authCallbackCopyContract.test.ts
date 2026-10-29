import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dict } from "./i18n";

/**
 * Batch 25 (P5): the sign-in callback used to print whatever the provider or the
 * incoming link handed it, so a patient saw English GoTrue text inside the clinic's
 * own card, and a link carrying `?error_description=…` could put the sender's words
 * on the screen. The screen now picks between two dictionary sentences and routes
 * every technical detail through `reportAuthFailure`, which forwards a registered
 * code and nothing else.
 *
 * The runtime suite proves a patient reads the right words in the right language.
 * This file freezes the shape that makes that true: nothing in the component can
 * still carry a message string, and every failure it can hit has a name the
 * telemetry union accepts. Source is read, not remembered, so a future edit that
 * reintroduces the leak fails here instead of being described correctly by this file.
 */

const sourceAt = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), "utf8");
const callback = sourceAt("src/pages/auth/AuthCallback.tsx");
const telemetry = sourceAt("src/lib/authFailureTelemetry.ts");
const staffLogin = sourceAt("src/pages/auth/Auth.tsx");
const callbackSpec = sourceAt("src/pages/auth/AuthCallback.test.tsx");

const CALLBACK_OPERATIONS = [
  "callback-code-exchange",
  "callback-completion",
  "callback-provider-error",
  "callback-session-restore",
  "callback-token-verify",
  "callback-transport",
] as const;

describe("the callback card cannot print a message it did not write (P5)", () => {
  it("has no state that could hold a provider sentence", () => {
    // The old screen kept `error: string | null`; the new one keeps a two-value tag,
    // so a message has nowhere to live even if a future branch tried to pass one.
    expect(callback).not.toMatch(/\bsetError\b/);
    expect(callback).toContain('type CallbackFailure = "link" | "connection";');
    expect(callback).toContain("useState<CallbackFailure | null>(null)");
    const args = [...callback.matchAll(/setFailure\(([^)]*)\)/g)].map((m) => m[1]);
    expect(args.sort()).toEqual([
      '"connection"', '"connection"', '"link"', '"link"', '"link"', '"link"', '"link"',
    ]);
  });

  it("speaks the failure card entirely from the dictionary", () => {
    const open = callback.indexOf("{failure ? (");
    const close = callback.indexOf(") : confirmed ? (");
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    const card = callback.slice(open, close);
    // Self-probe: without this the slice could go empty and every assertion below
    // would pass by matching nothing.
    expect(card).toContain('t("callbackLinkFailed")');
    // The sentence that tells a patient what to do next is dictionary copy on both
    // sides; the card's heading is the one line still written inline (C19 family,
    // Arabic first), so it is pinned here rather than wished away.
    expect(card).toContain('lang === "ar" ? "تعذر إكمال تسجيل الدخول" : "Sign-in could not be completed"');
    const body = card.match(/<p className="text-sm text-muted-foreground">(\{[^<]*\})<\/p>/);
    expect(body, "the failure card's body line changed shape").toBeTruthy();
    expect(body![1]).not.toContain("lang ===");
    expect([...new Set([...card.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]))].sort()).toEqual([
      "backToSignIn", "callbackLinkFailed", "callbackTryAgain",
    ]);
  });

  it("uses the link's own error text three times and never lets it out of the effect", () => {
    // The declaration, the `hasProviderError` boolean in the debug line, and the guard.
    expect((callback.match(/\bproviderError\b/g) ?? []).length).toBe(3);
    expect(callback).not.toContain("{providerError}");
    expect(callback).not.toContain("error: providerError");
    expect(callback).not.toContain("message: providerError");
    // The parameter name is read once and then dropped; nothing else may spell it.
    expect((callback.match(/"error_description"/g) ?? []).length).toBe(2);
    expect(callback.match(/reportAuthFailure\(\s*"callback-provider-error",\s*"rejected"\)/g)?.length).toBe(1);
  });

  it("logs a code where it used to log a message", () => {
    expect(callback).not.toContain("error?.message");
    expect(callback.match(/code: error\?\.code \?\? null/g)?.length).toBe(4);
    expect(callback).not.toContain("console.warn");
  });

  it("names every failure it can hit with an operation the telemetry declares", () => {
    const used = [...callback.matchAll(/reportAuthFailure\(\s*"([^"]+)",\s*"([^"]+)"/g)];
    expect(used.length).toBe(7);
    expect([...new Set(used.map((m) => m[1]))].sort()).toEqual([...CALLBACK_OPERATIONS]);
    for (const [, operation, outcome] of used) {
      expect(["rejected", "transport", "identity-mismatch"], `${operation} reports ${outcome}`).toContain(outcome);
    }
    expect([...new Set(used.map((m) => m[2]))].sort()).toEqual(["identity-mismatch", "rejected", "transport"]);
    const union = telemetry.slice(telemetry.indexOf("operation:"), telemetry.indexOf("outcome:"));
    expect([...union.matchAll(/"(callback-[a-z-]+)"/g)].map((m) => m[1]).sort()).toEqual([...CALLBACK_OPERATIONS]);
  });

  it("keeps the redaction in the reporter, not in the caller", () => {
    expect(telemetry).toContain("message: `auth.${operation}.${outcome}:${safeCode}`");
    expect(telemetry).not.toMatch(/error\.(message|stack|name)/);
    expect(telemetry).not.toMatch(/JSON\.stringify\(/);
    // An unregistered code is reported as `unknown`, so a GoTrue message can ride out
    // only by being added to this set — which is a deliberate, reviewable edit.
    expect(telemetry).toContain('const safeCode = typeof code === "string" && safeCodes.has(code) ? code : "unknown";');
  });

  it("holds both new sentences in both dictionaries, distinct and Arabic", () => {
    const copies = [
      ["callbackLinkFailed", "This sign-in link did not work. It may have expired or already been used — ask your clinic for a new one."],
      ["callbackTryAgain", "The connection could not be completed. Check your internet connection and try again."],
      ["invalidSignInFields", "Enter a valid email or username, and a password of 6 to 128 characters."],
    ] as const;
    for (const [key, en] of copies) {
      expect(dict.en[key], `${key} no longer says what this file pins`).toBe(en);
      expect(dict.ar[key], `${key} still holds its English text`).not.toBe(dict.en[key]);
    }
    // The two sentences a patient can be shown here must stay different, because the
    // action they suggest differs: one asks for a new link, the other for a retry.
    expect(dict.ar.callbackLinkFailed).not.toBe(dict.ar.callbackTryAgain);
    expect(dict.en.callbackLinkFailed).not.toBe(dict.en.callbackTryAgain);
  });

  it("retires the English-only staff toast without touching the deferred recovery copy", () => {
    expect(staffLogin).not.toContain('"Invalid email or password"');
    expect(staffLogin).toContain('toast.error(t("invalidSignInFields"))');
    // Batch 24 froze the three recovery sentences still inline in Auth.tsx; P5 must
    // not have quietly rewritten them into something this suite no longer checks.
    expect(staffLogin).toContain('lang === "ar" ? "تعذر إرسال رابط الاستعادة. تحقق من الاتصال وحاول لاحقًا." : "Unable to send the recovery link. Check your connection and try again later."');
  });

  it("keeps the success handoff the patient already relies on, and still tested", () => {
    expect(callback).toContain("const CONFIRMATION_DWELL_MS = 1400;");
    expect(callback).toContain('const isInvite = redirectType === "invite" || (!redirectType && next.startsWith("/patient-portal"));');
    expect(callback).toContain("setConfirmed({ message, next });");
    expect(callback).toContain("window.location.replace(next)");
    expect(callback.match(/window\.location\.replace/g)?.length).toBe(2);
    for (const copy of [
      "تم تأكيد دعوة البوابة. جارٍ فتح صفحة المريض…",
      "تم تأكيد إعادة تعيين كلمة المرور. جارٍ المتابعة…",
      "تم تسجيل الدخول بنجاح. جارٍ المتابعة…",
      "Portal invitation confirmed. Opening the patient portal…",
      "Password reset confirmed. Continuing…",
      "Signed in successfully. Continuing…",
    ]) {
      expect(callback, `the confirmation stopped saying "${copy}"`).toContain(copy);
    }
    expect(callbackSpec).toContain('it("names the patient invitation when the session arrives without a type"');
    expect(callbackSpec).toContain('it("names a password reset when the link carries recovery type"');
  });

  it("records that the old leak was frozen by requirement, and is now forbidden", () => {
    // Batch 24's suite asked for the provider text on screen. Batch 25 turned that
    // assertion into its opposite; if someone restores the original, this fails.
    expect(callbackSpec).not.toMatch(/(get|find)ByText\("Email link is invalid or has expired"\)/);
    expect(callbackSpec).toContain('expect(document.body.textContent).not.toContain("Email link is invalid or has expired")');
    expect(callbackSpec).toContain('vi.mock("@/lib/observability/reportError", () => ({ reportClientError: api.report }))');
  });
});
