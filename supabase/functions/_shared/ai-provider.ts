// Provider-agnostic AI abstraction for the ZMedico AI agent.
//
// The rest of the AI architecture (tool dispatch, prompt assembly, conversation
// handling in ai-agent-respond) only ever talks to the `AIProvider` interface
// below. `getAIProvider()` is the SINGLE place that decides which concrete
// provider implementation is used -- swap Gemini for OpenAI/Anthropic later by
// changing only this function (and adding a new class), without touching
// anything else in the codebase.

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

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured (Deno.env). Cannot use GeminiProvider.");
    }
    this.apiKey = apiKey;
    this.model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
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
      throw new Error(`Gemini API error ${res.status}: ${rawText.slice(0, 500)}`);
    }

    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`Gemini API returned non-JSON response: ${rawText.slice(0, 300)}`);
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
}

// The one place that decides which provider implementation is active.
// Change this function (and only this function) to swap providers later.
export function getAIProvider(): AIProvider {
  return new GeminiProvider();
}
