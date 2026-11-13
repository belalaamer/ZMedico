// Interactive WhatsApp sending for staff <-> patient conversations.
//
// This is deliberately NOT `send-reminder`. Reminders are business-initiated and
// must use an approved Meta template; a reply to a patient is *inside* Meta's
// customer-service window (the patient messaged us) and is free-form text. The
// two share the provider *selection*, not the message shape, so the selection is
// duplicated here in one small, testable place rather than reaching into the
// reminder pipeline.
//
// The one rule this module exists to enforce (S5): credentials and the sender
// number come from the branch that owns the conversation, never from a
// platform-wide `Deno.env` fallback. A silent fallback would let a reply leave
// from another clinic's number, which is exactly the cross-tenant leak the
// multi-tenant design must prevent.

export type BranchWhatsAppSettings = {
  whatsapp_enabled?: boolean | null;
  whatsapp_provider?: string | null;
  whatsapp_api_key?: string | null;
  whatsapp_api_url?: string | null;
  meta_phone_number_id?: string | null;
  twilio_account_sid?: string | null;
  twilio_auth_token?: string | null;
  twilio_from_whatsapp?: string | null;
} | null;

export type Provider = "twilio" | "meta" | "custom";

export type SendOutcome =
  | { ok: true; provider: Provider; providerMessageId?: string; raw?: unknown }
  | { ok: false; provider?: Provider; code: string; error: string; status?: number };

/** Egyptian numbers arrive as `01…`; the international form is `201…`. */
export function normalizeRecipient(raw: string): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `20${digits.slice(1)}`;
  return digits;
}

function has(...values: Array<string | null | undefined>): boolean {
  return values.every((v) => typeof v === "string" && v.trim().length > 0);
}

/**
 * Which provider a branch is configured for. Explicit configuration wins. When
 * the branch has no explicit provider we infer from what is actually configured,
 * but we never infer from platform-wide environment credentials.
 */
export function resolveProvider(settings: BranchWhatsAppSettings): Provider | null {
  const configured = (settings?.whatsapp_provider ?? "").trim().toLowerCase();
  if (configured === "twilio") return "twilio";
  if (configured === "meta") return "meta";
  if (configured === "custom") return "custom";
  if (configured) return null; // an unknown provider is a misconfiguration, not a guess

  // No explicit provider: infer from the branch's own credentials only.
  if (has(settings?.twilio_account_sid, settings?.twilio_auth_token, settings?.twilio_from_whatsapp)) return "twilio";
  if (has(settings?.meta_phone_number_id, settings?.whatsapp_api_key)) return "meta";
  if (has(settings?.whatsapp_api_url, settings?.whatsapp_api_key)) return "custom";
  return null;
}

function sanitize(raw: string): string {
  return raw.replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, 200);
}

function timeoutSignal(ms: number): AbortSignal {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined as unknown as AbortSignal;
  }
}

function providerTimeoutMs(): number {
  const raw = Number(readEnv("PROVIDER_TIMEOUT_MS") ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : 15000;
}

/** Reads an env var from Deno when running on Supabase, from process.env under test. */
function readEnv(key: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } }).Deno;
  if (deno?.env?.get) return deno.env.get(key);
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[key];
}

/**
 * Send a free-form text reply. Returns a discriminated result; the caller is
 * responsible for persisting it. Never throws for a provider error.
 */
export async function sendConversationReply(params: {
  settings: BranchWhatsAppSettings;
  to: string;
  body: string;
  /** `channel_accounts.external_account_id` of the account that received the thread (Meta phone_number_id). */
  fromAccountId?: string | null;
}): Promise<SendOutcome> {
  const { settings, body } = params;

  if (settings?.whatsapp_enabled === false) {
    return { ok: false, code: "WHATSAPP_DISABLED", error: "WhatsApp delivery is disabled for this branch", status: 400 };
  }

  const provider = resolveProvider(settings);
  if (!provider) {
    return { ok: false, code: "WHATSAPP_NOT_CONFIGURED", error: "No WhatsApp provider is configured for this branch", status: 503 };
  }

  const recipient = normalizeRecipient(params.to);
  if (!recipient) {
    return { ok: false, provider, code: "INVALID_RECIPIENT", error: "The contact number is not a valid WhatsApp recipient", status: 400 };
  }

  if (provider === "twilio") {
    const sid = settings?.twilio_account_sid;
    const token = settings?.twilio_auth_token;
    const from = settings?.twilio_from_whatsapp;
    if (!has(sid, token, from)) {
      return { ok: false, provider, code: "WHATSAPP_NOT_CONFIGURED", error: "Twilio WhatsApp is not fully configured for this branch", status: 503 };
    }
    const fromAddr = from!.startsWith("whatsapp:") ? from! : `whatsapp:${from}`;
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid!)}/Messages.json`, {
        method: "POST",
        signal: timeoutSignal(providerTimeoutMs()),
        headers: {
          Authorization: "Basic " + btoa(`${sid}:${token}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: `whatsapp:+${recipient}`, From: fromAddr, Body: body }).toString(),
      });
      const rawBody = await res.text().catch(() => "");
      if (!res.ok) {
        return { ok: false, provider, code: "PROVIDER_REJECTED", error: sanitize(rawBody) || `Twilio rejected the message (HTTP ${res.status})`, status: res.status >= 500 ? 502 : 400 };
      }
      let parsed: { sid?: string } = {};
      try { parsed = JSON.parse(rawBody); } catch { /* Twilio may answer with an empty body */ }
      return { ok: true, provider, providerMessageId: parsed.sid || undefined, raw: parsed };
    } catch (err) {
      return { ok: false, provider, code: "PROVIDER_UNREACHABLE", error: sanitize(String((err as Error)?.message ?? err)) || "Twilio did not answer", status: 502 };
    }
  }

  if (provider === "meta") {
    // For Meta the sender is the phone_number_id of the account that received the
    // thread; `external_account_id` on `channel_accounts` holds exactly that. The
    // branch-level id is used only when there is no channel account.
    const phoneNumberId = params.fromAccountId || settings?.meta_phone_number_id;
    const accessToken = settings?.whatsapp_api_key;
    if (!has(phoneNumberId, accessToken)) {
      return { ok: false, provider, code: "WHATSAPP_NOT_CONFIGURED", error: "Meta WhatsApp is not fully configured for this branch", status: 503 };
    }
    const version = readEnv("META_GRAPH_VERSION") ?? "v23.0";
    try {
      const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId!)}/messages`, {
        method: "POST",
        signal: timeoutSignal(providerTimeoutMs()),
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: { body, preview_url: false },
        }),
      });
      const rawBody = await res.text().catch(() => "");
      let parsed: { messages?: Array<{ id?: string }>; error?: { message?: string } } = {};
      try { parsed = JSON.parse(rawBody); } catch { /* reported below */ }
      const providerMessageId = parsed.messages?.[0]?.id ?? null;
      if (!res.ok || !providerMessageId) {
        return { ok: false, provider, code: "PROVIDER_REJECTED", error: sanitize(parsed.error?.message ?? rawBody) || `Meta rejected the message (HTTP ${res.status})`, status: res.status >= 500 ? 502 : 400 };
      }
      return { ok: true, provider, providerMessageId, raw: parsed };
    } catch (err) {
      return { ok: false, provider, code: "PROVIDER_UNREACHABLE", error: sanitize(String((err as Error)?.message ?? err)) || "Meta did not answer", status: 502 };
    }
  }

  // Custom HTTP gateway: the branch owns the URL and the key.
  const url = settings?.whatsapp_api_url;
  const key = settings?.whatsapp_api_key;
  if (!has(url, key)) {
    return { ok: false, provider, code: "WHATSAPP_NOT_CONFIGURED", error: "The custom WhatsApp gateway is not configured for this branch", status: 503 };
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url!);
  } catch {
    return { ok: false, provider, code: "PROVIDER_MISCONFIGURED", error: "The custom WhatsApp gateway URL is invalid", status: 500 };
  }
  if (parsedUrl.protocol !== "https:") {
    return { ok: false, provider, code: "PROVIDER_MISCONFIGURED", error: "The custom WhatsApp gateway URL must use https", status: 500 };
  }
  try {
    const res = await fetch(parsedUrl.toString(), {
      method: "POST",
      signal: timeoutSignal(providerTimeoutMs()),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ to: recipient, type: "text", text: { body } }),
    });
    const rawBody = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, provider, code: "PROVIDER_REJECTED", error: sanitize(rawBody) || `The gateway rejected the message (HTTP ${res.status})`, status: res.status >= 500 ? 502 : 400 };
    }
    let parsed: { id?: string; message_id?: string } = {};
    try { parsed = JSON.parse(rawBody); } catch { /* gateway may answer with an empty body */ }
    return { ok: true, provider, providerMessageId: parsed.id ?? parsed.message_id, raw: parsed };
  } catch (err) {
    return { ok: false, provider, code: "PROVIDER_UNREACHABLE", error: sanitize(String((err as Error)?.message ?? err)) || "The gateway did not answer", status: 502 };
  }
}
