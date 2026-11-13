// S5: a staff reply must go out through the branch's own provider and its own
// credentials. These tests drive the real shared sender (`_shared/whatsapp-send`)
// so a regression to a platform-wide fallback fails here, not on a patient's
// phone. `fetch` is stubbed, so nothing leaves the machine.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeRecipient,
  resolveProvider,
  sendConversationReply,
} from "../../supabase/functions/_shared/whatsapp-send.ts";

// `strictNullChecks` is off in this project, which collapses `true`/`false`
// literal types and disables discriminated-union narrowing. These accessors make
// the intended variant explicit instead of relying on narrowing.
type OkOutcome = { ok: boolean; provider?: string; providerMessageId?: string };
type ErrOutcome = { ok: boolean; code?: string; error?: string; provider?: string };
const okOf = (o: unknown) => o as OkOutcome;
const errOf = (o: unknown) => o as ErrOutcome;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("provider selection (S5)", () => {
  it("honours an explicit branch provider", () => {
    expect(resolveProvider({ whatsapp_provider: "twilio" })).toBe("twilio");
    expect(resolveProvider({ whatsapp_provider: "meta" })).toBe("meta");
    expect(resolveProvider({ whatsapp_provider: "custom" })).toBe("custom");
  });

  it("treats an unknown explicit provider as misconfiguration, not a guess", () => {
    expect(resolveProvider({ whatsapp_provider: "smsmisr" })).toBeNull();
  });

  it("infers only from the branch's own credentials", () => {
    expect(resolveProvider({ twilio_account_sid: "AC", twilio_auth_token: "t", twilio_from_whatsapp: "+1" })).toBe("twilio");
    expect(resolveProvider({ meta_phone_number_id: "123", whatsapp_api_key: "k" })).toBe("meta");
    expect(resolveProvider({ whatsapp_api_url: "https://gw.example", whatsapp_api_key: "k" })).toBe("custom");
  });

  it("returns null when nothing is configured for the branch, even if platform env exists", () => {
    vi.stubGlobal("process", { env: { META_ACCESS_TOKEN: "platform-token", META_PHONE_NUMBER_ID: "999" } });
    expect(resolveProvider(null)).toBeNull();
    expect(resolveProvider({})).toBeNull();
  });
});

describe("recipient normalisation", () => {
  it("turns a local Egyptian number into its international form", () => {
    expect(normalizeRecipient("01012345678")).toBe("201012345678");
    expect(normalizeRecipient("+20 101 234 5678")).toBe("201012345678");
    expect(normalizeRecipient("00201012345678")).toBe("201012345678");
  });
});

describe("sendConversationReply (S5)", () => {
  it("refuses when WhatsApp is disabled for the branch, before any network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const out = await sendConversationReply({ settings: { whatsapp_enabled: false }, to: "01012345678", body: "hi" });
    expect(out.ok).toBe(false);
    expect(okOf(out).ok).toBe(false);
    expect(errOf(out).code).toBe("WHATSAPP_DISABLED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses when no provider is configured, and never borrows platform credentials", async () => {
    vi.stubGlobal("process", { env: { META_ACCESS_TOKEN: "platform-token", META_PHONE_NUMBER_ID: "999" } });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const out = await sendConversationReply({ settings: {}, to: "01012345678", body: "hi" });
    expect(out.ok).toBe(false);
    expect(okOf(out).ok).toBe(false);
    expect(errOf(out).code).toBe("WHATSAPP_NOT_CONFIGURED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends a Meta text through the branch token and the originating phone-number id", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const out = await sendConversationReply({
      settings: { whatsapp_provider: "meta", whatsapp_api_key: "branch-token", meta_phone_number_id: "branch-id" },
      to: "01012345678",
      body: "your appointment is confirmed",
      fromAccountId: "originating-id",
    });
    expect(okOf(out).ok).toBe(true);
    expect(okOf(out).provider).toBe("meta");
    expect(okOf(out).providerMessageId).toBe("wamid.1");
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/originating-id/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer branch-token");
    const payload = JSON.parse(String(init.body));
    expect(payload.to).toBe("201012345678");
    expect(payload.type).toBe("text");
  });

  it("sends through Twilio with the branch's sid/token/from", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ sid: "SM123", status: "queued" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchSpy);
    const out = await sendConversationReply({
      settings: { whatsapp_provider: "twilio", twilio_account_sid: "AC1", twilio_auth_token: "tok", twilio_from_whatsapp: "+15550001" },
      to: "01012345678",
      body: "hello",
    });
    expect(okOf(out).ok).toBe(true);
    expect(okOf(out).provider).toBe("twilio");
    expect(okOf(out).providerMessageId).toBe("SM123");
    const [url] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(url).toContain("/Accounts/AC1/Messages.json");
  });

  it("surfaces a provider rejection instead of claiming success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid parameter" } }), { status: 400 })));
    const out = await sendConversationReply({
      settings: { whatsapp_provider: "meta", whatsapp_api_key: "k", meta_phone_number_id: "id" },
      to: "01012345678",
      body: "hi",
    });
    expect(okOf(out).ok).toBe(false);
    expect(errOf(out).code).toBe("PROVIDER_REJECTED");
    expect(errOf(out).error).toContain("Invalid parameter");
  });

  it("rejects a custom gateway that is not https", async () => {
    const out = await sendConversationReply({
      settings: { whatsapp_provider: "custom", whatsapp_api_url: "http://insecure.example", whatsapp_api_key: "k" },
      to: "01012345678",
      body: "hi",
    });
    expect(okOf(out).ok).toBe(false);
    expect(errOf(out).code).toBe("PROVIDER_MISCONFIGURED");
  });
});
