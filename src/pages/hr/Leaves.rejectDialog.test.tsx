import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// C16 / A22 on the leave screen. Before this batch the X button ran
// `prompt(t("rejectionReason")) || ""` and then decided immediately, so a
// dismissed prompt — or a mistyped one, or Enter on an empty box — rejected the
// request with no way back. These tests hold the two halves of the fix: the
// desk gets a real Arabic/English dialog, and backing out of it writes nothing.

const state = vi.hoisted(() => ({
  lang: "en",
  branch: "branch-a",
  actor: "actor-a",
}));

const events = vi.hoisted(() => ({
  update: vi.fn(),
  insert: vi.fn(),
  filter: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  read: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: events.error, success: events.success }),
}));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: state.lang, t: (key: string) => key }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: state.actor } }) }));
vi.mock("@/contexts/BranchContext", () => ({ useBranch: () => ({ currentBranchId: state.branch, branches: [] }) }));
vi.mock("@/components/Can", () => ({ Can: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/integrations/supabase/client", () => {
  const rowsFor = (table: string) => {
    if (table === "staff_profiles") return [{ id: "staff-1", employee_id: "E-1" }];
    if (table === "leave_requests") {
      return [{ id: "lv-1", staff_id: "staff-1", status: "pending", start_date: "2026-07-01", end_date: "2026-07-03", total_days: 3, reason_en: "Family matter", leave_type: { name_en: "Annual", name_ar: "سنوي" } }];
    }
    if (table === "profiles") return [{ id: "staff-1", full_name: "Dr Fixture", email: "fixture@example.test" }];
    if (table === "leave_types") return [{ id: "lt-1", name_en: "Annual", name_ar: "سنوي" }];
    return [];
  };
  return {
    supabase: {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const name of ["select", "eq", "in", "is", "order", "limit", "or"]) {
          chain[name] = (...args: unknown[]) => {
            if (name === "eq" || name === "in") events.filter(table, name, ...args);
            return chain;
          };
        }
        chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          events.read(table);
          return Promise.resolve({ data: rowsFor(table), error: null }).then(resolve, reject);
        };
        chain.update = (payload: unknown) => { events.update(table, payload); return chain; };
        chain.insert = (payload: unknown) => { events.insert(table, payload); return chain; };
        chain.single = () => chain;
        chain.maybeSingle = () => chain;
        return chain;
      },
    },
  };
});

import Leaves from "./Leaves";

const promptSpy = vi.fn(() => null);

beforeEach(() => {
  state.lang = "en";
  state.branch = "branch-a";
  state.actor = "actor-a";
  vi.clearAllMocks();
  // If any code path still reaches for the browser box, this records the call.
  vi.stubGlobal("prompt", promptSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openReject = async () => {
  render(<Leaves />);
  const trigger = await screen.findByRole("button", { name: "Reject request" });
  fireEvent.click(trigger);
  return { trigger };
};

describe("leave rejection dialog", { timeout: 30_000 }, () => {
  it("asks inside the app, not in a browser box", async () => {
    await openReject();
    expect(promptSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Reject leave request")).toBeTruthy();
  });

  it("shows whose request it is about before it asks", async () => {
    await openReject();
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Dr Fixture");
    expect(dialog.textContent).toContain("Annual");
  });

  it("writes nothing while the dialog is still open", async () => {
    await openReject();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(events.update).not.toHaveBeenCalled();
  });

  it("Cancel writes nothing and leaves the request where it was", async () => {
    await openReject();
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(events.update).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reject request" })).toBeTruthy();
  });

  it("backing out with Escape writes nothing", async () => {
    await openReject();
    const box = await screen.findByRole("button", { name: "cancel" });
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(events.update).not.toHaveBeenCalled();
  });

  it("records the reason typed into the dialog", async () => {
    await openReject();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "No cover that week" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(events.update).toHaveBeenCalled());
    const [table, payload] = events.update.mock.calls[0];
    expect(table).toBe("leave_requests");
    expect(payload).toMatchObject({ status: "rejected", approved_by: "actor-a", rejection_reason: "No cover that week" });
    expect(typeof (payload as any).approved_at).toBe("string");
    expect(events.filter).toHaveBeenCalledWith("leave_requests", "eq", "id", "lv-1");
    expect(events.filter).toHaveBeenCalledWith("leave_requests", "in", "staff_id", ["staff-1"]);
  });

  it("an empty reason stays an empty string, as the old prompt left it", async () => {
    await openReject();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(events.update).toHaveBeenCalled());
    expect((events.update.mock.calls[0][1] as any).rejection_reason).toBe("");
  });

  it("approving is still one click and needs no dialog", async () => {
    render(<Leaves />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve request" }));
    await waitFor(() => expect(events.update).toHaveBeenCalled());
    expect((events.update.mock.calls[0][1] as any).status).toBe("approved");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says the same thing in Arabic", async () => {
    state.lang = "ar";
    render(<Leaves />);
    fireEvent.click(await screen.findByRole("button", { name: "رفض الطلب" }));
    const dialog = await screen.findByRole("dialog");
    expect(screen.getByText("رفض الطلب")).toBeTruthy();
    // A placeholder is an attribute, so it has to be read off the field itself.
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).placeholder).toBe("اختياري — سيظهر للموظف مع الطلب");
    expect(dialog.textContent).toContain("يُعلَّم الطلب مرفوضاً، وتظهر حالته في صفحة الموظف.");
    fireEvent.click(screen.getByRole("button", { name: "رفض" }));
    await waitFor(() => expect(events.update).toHaveBeenCalled());
    expect((events.update.mock.calls[0][1] as any).status).toBe("rejected");
  });
});
