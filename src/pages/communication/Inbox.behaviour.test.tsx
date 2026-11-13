// Behavioural proof for the inbox fixes S1-S4. Drives the real component against
// a recording Supabase stub, so the assertions are about what the screen actually
// writes and what the operator actually sees -- not about source text.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  updates: [] as { table: string; patch: Record<string, unknown> }[],
  inserts: [] as { table: string; payload: Record<string, unknown> }[],
  invoke: vi.fn(),
  rpc: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("@/contexts/BranchContext", () => ({ useBranch: () => ({ currentBranchId: "branch-1", branchSelectionReady: true }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "staff-1" } }) }));
vi.mock("@/lib/authz/useAuthorization", () => ({ useAuthorization: () => ({ authz: { can: () => true }, loading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: api.toast }) }));

const conversations = [
  {
    id: "c-ai", tenant_id: "t1", branch_id: "branch-1", channel: "whatsapp",
    external_contact_id: "201000000001", patient_id: null, status: "ai_active",
    state: null, assigned_staff_id: null, handoff_reason: null, handoff_at: null,
    last_message_at: "2026-11-12T09:00:00.000Z",
  },
  {
    id: "c-human", tenant_id: "t1", branch_id: "branch-1", channel: "whatsapp",
    external_contact_id: "201000000002", patient_id: null, status: "human_active",
    state: null, assigned_staff_id: null, handoff_reason: "patient asked for a person",
    handoff_at: "2026-11-12T08:00:00.000Z", last_message_at: "2026-11-12T08:30:00.000Z",
  },
];

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const st = { table, op: "select", patch: undefined as Record<string, unknown> | undefined, payload: undefined as Record<string, unknown> | undefined };
    const run = () => {
      if (st.op === "select") {
        if (table === "conversations") return { data: conversations, error: null };
        if (table === "messages") return { data: [], error: null };
        return { data: [], error: null };
      }
      if (st.op === "update") { api.updates.push({ table, patch: st.patch ?? {} }); return { data: [{ id: "x" }], error: null }; }
      if (st.op === "insert") { api.inserts.push({ table, payload: st.payload ?? {} }); return { data: [{ id: "m-new" }], error: null }; }
      return { data: [], error: null };
    };
    const b: any = {
      then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
      select: () => b,
      update: (p: Record<string, unknown>) => { st.op = "update"; st.patch = p; return b; },
      insert: (p: Record<string, unknown>) => { st.op = "insert"; st.payload = p; return b; },
      eq: () => b, neq: () => b, is: () => b, in: () => b, order: () => b, limit: () => b,
      single: () => Promise.resolve(run()),
      maybeSingle: () => Promise.resolve(run()),
    };
    return b;
  };
  return {
    supabase: {
      from: builder,
      rpc: (...args: unknown[]) => { api.rpc(...args); return Promise.resolve({ data: true, error: null }); },
      functions: { invoke: (...args: unknown[]) => api.invoke(...args) },
    },
  };
});

import Inbox from "./Inbox";

beforeEach(() => {
  api.updates = []; api.inserts = []; api.toast.mockReset(); api.rpc.mockReset();
  api.invoke.mockReset();
});
afterEach(cleanup);

async function openConversation(contact: string) {
  render(<Inbox />);
  // The inbox defaults to the "needs a human" filter; show every bucket so both
  // an ai_active and a human_active thread are visible.
  fireEvent.click(await screen.findByRole("button", { name: /^All/ }));
  // The contact number appears twice in a row (name + subtitle); click the row button.
  const row = (await screen.findAllByText(contact))[0].closest("button");
  fireEvent.click(row as HTMLElement);
}

// Mounting the whole inbox costs a full render; under a full-suite run the
// default 5s budget is too tight, so the timeouts are raised rather than the
// assertions weakened.
describe("inbox behaviour", { timeout: 20000 }, () => {
describe("S1 — taking over preserves the escalation time", () => {
  it("does not overwrite handoff_at, and records the assignee", async () => {
    await openConversation("201000000001");
    fireEvent.click(await screen.findByRole("button", { name: "Take over" }));
    await waitFor(() => expect(api.updates.some((u) => u.table === "conversations")).toBe(true));
    const patch = api.updates.find((u) => u.table === "conversations")!.patch;
    expect(patch.status).toBe("human_active");
    expect(patch.assigned_staff_id).toBe("staff-1");
    expect(patch).not.toHaveProperty("handoff_at");
  });
});

describe("S2 — handing back keeps the escalation reason", () => {
  it("does not clear handoff_reason or handoff_at", async () => {
    await openConversation("201000000002");
    fireEvent.click(await screen.findByRole("button", { name: "Hand back to assistant" }));
    await waitFor(() => expect(api.updates.some((u) => u.table === "conversations")).toBe(true));
    const patch = api.updates.find((u) => u.table === "conversations")!.patch;
    expect(patch.status).toBe("ai_active");
    expect(patch).not.toHaveProperty("handoff_reason");
    expect(patch).not.toHaveProperty("handoff_at");
  });
});

describe("S3 + S4 — a refused send keeps the draft and explains itself", () => {
  it("keeps the typed reply and maps the function's real error code", async () => {
    // `supabase.functions.invoke` puts a non-2xx body on `error.context`; the code
    // is only reachable there. The old code read `data.code` and always missed it.
    const context = new Response(JSON.stringify({ code: "NOT_HUMAN_HELD", error: "raw" }), { status: 409 });
    api.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context }) });

    await openConversation("201000000002");
    const box = await screen.findByPlaceholderText(/write a reply|reply/i);
    fireEvent.change(box, { target: { value: "We can move you to 4pm." } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(api.toast).toHaveBeenCalled());
    const title = String(api.toast.mock.calls.at(-1)?.[0]?.title ?? "");
    expect(title).toContain("went back to the assistant");
    // S3: the paragraph is still in the box, not lost.
    expect((box as HTMLTextAreaElement).value).toBe("We can move you to 4pm.");
  });

  it("says so when the failure itself could not be recorded", async () => {
    const context = new Response(JSON.stringify({ code: "PROVIDER_REJECTED", error: "boom", recorded: false }), { status: 400 });
    api.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error("non-2xx"), { context }) });

    await openConversation("201000000002");
    const box = await screen.findByPlaceholderText(/write a reply|reply/i);
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(api.toast).toHaveBeenCalled());
    const last = api.toast.mock.calls.at(-1)?.[0] ?? {};
    expect(String(last.description)).toContain("could not be recorded");
  });
});
});
