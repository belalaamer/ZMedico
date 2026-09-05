// Provider-agnostic AI abstraction for the ZMedico AI agent.
//
// The rest of the AI architecture (tool dispatch, prompt assembly, conversation
// handling in ai-agent-respond) only ever talks to the `AIProvider` interface
// below. `getAIProvider()` is the SINGLE place that decides which concrete
// provider implementation is used -- swap Gemini for OpenAI/Anthropic later by
// changing only this function (and adding a new class), without touching
// anything else in the codebase.
//
// SECURITY: the API key is passed in as a constructor parameter (resolved by
// the caller from Supabase Vault via ai_provider_config / get_ai_provider_secret,
// see ai-agent-respond/index.ts and ai-admin-settings/index.ts) -- this file
// never reads GEMINI_API_KEY (or any other secret) from Deno.env itself. That
// keeps this module swappable to a DB-resolved key and avoids a second place
// where the raw key could leak into logs.

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type ToolCall = { name: string; args: Record<string, unknown> };

export type ProviderMessage = {
  role: "user" | "model";
  text?: string;
  toolCall?: ToolCall;
  toolResponse?: { name: string; response: unknown };
};

export interface AIProvider {
  generate(input: {
    systemInstruction: string;
    history: ProviderMessage[];
    tools: ToolDefinition[];
  }): Promise<{ text: string | null; toolCalls: ToolCall[] }>;

  // Minimal connectivity check used by Settings > AI's "Test connection"
  // action. Must never include the API key in its returned error message,
  // even if the provider's error body happens to echo request details.
  testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }>;
}

// ---------------------------------------------------------------------------
// Gemini provider (Google AI Studio / generativelanguage.googleapis.com)
// ---------------------------------------------------------------------------

function mapHistoryToGeminiContents(history: ProviderMessage[]): unknown[] {
  const contents: unknown[] = [];
  for (const msg of history) {
    if (msg.toolCall) {
      contents.push({
        role: "model",
        parts: [{ functionCall: { name: msg.toolCall.name, args: msg.toolCall.args } }],
      });
    } else if (msg.toolResponse) {
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: msg.toolResponse.name, response: msg.toolResponse.response } }],
      });
    } else {
      contents.push({
        role: msg.role,
        parts: [{ text: msg.text ?? "" }],
      });
    }
  }
  return contents;
}

// Strip anything that looks like it could contain the API key from an error
// message before it is ever logged or returned to a caller. Gemini keys are
// passed as a `?key=...` query param, and some error bodies echo back the
// request URL -- so in addition to redacting the literal key value, also
// redact any `key=...` query-param pattern defensively.
function sanitizeGeminiError(raw: string, apiKey: string): string {
  let cleaned = raw;
  if (apiKey) {
    cleaned = cleaned.split(apiKey).join("[REDACTED]");
  }
  cleaned = cleaned.replace(/key=[^&\s"']+/gi, "key=[REDACTED]");
  cleaned = cleaned.replace(/[\x00-\x1f\x7f]+/g, " ").trim();
  return cleaned.length > 300 ? cleaned.slice(0, 300) + "…" : cleaned;
}

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    if (!apiKey) {
      throw new Error("GeminiProvider requires a non-empty apiKey.");
    }
    this.apiKey = apiKey;
    this.model = model || "gemini-2.0-flash";
  }

  async generate(input: {
    systemInstruction: string;
    history: ProviderMessage[];
    tools: ToolDefinition[];
  }): Promise<{ text: string | null; toolCalls: ToolCall[] }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const body: Record<string, unknown> = {
      system_instruction: { parts: [{ text: input.systemInstruction }] },
      contents: mapHistoryToGeminiContents(input.history),
    };

    if (input.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: input.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const rawText = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Gemini API error ${res.status}: ${sanitizeGeminiError(rawText, this.apiKey).slice(0, 500)}`);
    }

    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`Gemini API returned non-JSON response: ${sanitizeGeminiError(rawText, this.apiKey).slice(0, 300)}`);
    }

    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    const toolCalls: ToolCall[] = [];
    let textParts: string[] = [];

    for (const part of parts) {
      if (part?.functionCall?.name) {
        toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
      } else if (typeof part?.text === "string") {
        textParts.push(part.text);
      }
    }

    return {
      text: textParts.length > 0 ? textParts.join("") : null,
      toolCalls,
    };
  }

  async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: "Reply with OK" }] }],
    };

    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const latencyMs = Date.now() - startedAt;
      const rawText = await res.text().catch(() => "");

      if (!res.ok) {
        return {
          success: false,
          latencyMs,
          error: `Gemini API error ${res.status}: ${sanitizeGeminiError(rawText, this.apiKey)}`,
        };
      }

      // Confirm the response actually parses and contains a candidate --
      // a 200 with an unexpected shape should still surface as a failure.
      try {
        const data = JSON.parse(rawText);
        if (!data?.candidates) {
          return { success: false, latencyMs, error: "Gemini API returned no candidates" };
        }
      } catch {
        return { success: false, latencyMs, error: "Gemini API returned non-JSON response" };
      }

      return { success: true, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, latencyMs, error: sanitizeGeminiError(message, this.apiKey) };
    }
  }
}

// The one place that decides which provider implementation is active.
// Change this function (and only this function) to swap providers later.
// apiKey/model are resolved by the caller from ai_provider_config + Vault
// (see ai-agent-respond/index.ts) -- this factory never reads env vars.
export function getAIProvider(apiKey: string, model?: string): AIProvider {
  return new GeminiProvider(apiKey, model);
}
