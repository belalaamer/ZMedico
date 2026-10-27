import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// C16 on the audit screen. "Save current" used to open the browser's own text
// box: `window.prompt(lang === "ar" ? "اسم الإعداد المسبق" : "Preset name")`.
// The label was bilingual but the box around it was not — the title, the OK and
// Cancel buttons and the whole chrome belonged to the browser, and the typed
// name went straight into a table row with no check on its length.
//
// Also pinned here: the default window. It was derived from
// `toISOString().slice(0, 10)`, i.e. the UTC calendar day, so between midnight
// and 03:00 in Cairo the audit list opened showing yesterday as "today".

const state = vi.hoisted(() => ({
  lang: "en",
  branch: "branch-a" as string | null,
  actor: "actor-a" as string | null,
}));

const events = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  filter: vi.fn(),
  read: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

const insertOutcome = vi.hoisted(() => ({ rejected: false }));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: events.error, success: events.success }) }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: state.lang, t: (key: string) => key }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.actor ? { id: state.actor } : null }) }));
vi.mock("@/contexts/BranchContext", () => ({ useBranch: () => ({ currentBranchId: state.branch, branches: [] }) }));
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("@/components/Can", () => ({ Can: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "in", "is", "order", "limit", "gte", "lte", "lt", "range"]) {
        chain[name] = (...args: unknown[]) => {
          if (name === "eq" || name === "in" || name === "gte" || name === "lte") events.filter(table, name, ...args);
          return chain;
        };
      }
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        events.read(table);
        // Presets are served an unreadable response on purpose: the local cache
        // fallback must stay out of the way so a test can tell a cache write
        // made by *saving* from one made by *loading*.
        if (table === "audit_export_presets") return Promise.resolve({ data: null, error: { message: "offline" } }).then(resolve, reject);
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      };
      chain.insert = (payload: unknown) => {
        events.insert(table, payload);
        const row = { id: "preset-1", ...(payload as Record<string, unknown>) };
        const write: Record<string, unknown> = {
          then: (r: (value: unknown) => unknown, j: (reason: unknown) => unknown) => Promise.resolve(
            insertOutcome.rejected ? { data: null, error: { message: "duplicate key value violates unique constraint" } } : { data: row, error: null }
          ).then(r, j),
        };
        write.select = () => write;
        write.single = () => write;
        write.eq = (...args: unknown[]) => { events.filter(table, "eq", ...args); return write; };
        return write;
      };
      chain.delete = () => { events.delete(table); return chain; };
      return chain;
    },
  },
}));

import QueueAudit from "./QueueAudit";
import { localDateOnly } from "@/lib/localDate";

const promptSpy = vi.fn(() => "Typed in the browser box");
const CACHE_KEY = "zmedico.auditPresets.branch-a";

beforeEach(() => {
  state.lang = "en";
  state.branch = "branch-a";
  state.actor = "actor-a";
  insertOutcome.rejected = false;
  vi.clearAllMocks();
  vi.stubGlobal("prompt", promptSpy);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const openSave = async () => {
  render(<QueueAudit />);
  const trigger = await screen.findByRole("button", { name: "Save current" });
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  return screen.getByLabelText("Preset name") as HTMLInputElement;
};

const dateFields = () => ({
  from: screen.getByLabelText("from") as HTMLInputElement,
  to: screen.getByLabelText("to") as HTMLInputElement,
});

// Same budget as the other page-mounting suites: these cases finish earlier,
// they are only allowed the time a loaded runner sometimes needs.
describe("audit preset dialog", { timeout: 30_000 }, () => {
  it("asks inside the app, not in a browser box", async () => {
    await openSave();
    expect(promptSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Save preset")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("Saves the filters as they are now");
  });

  it("will not file a nameless preset", async () => {
    const field = await openSave();
    expect(field.value).toBe("");
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
    fireEvent.change(field, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
    fireEvent.change(field, { target: { value: "Cancelled today" } });
    expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
    expect(events.insert).not.toHaveBeenCalled();
  });

  it("Cancel writes nothing anywhere", async () => {
    await openSave();
    fireEvent.change(screen.getByLabelText("Preset name"), { target: { value: "Cancelled today" } });
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(events.insert).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(screen.queryByText("Cancelled today")).toBeNull();
  });

  it("Escape writes nothing anywhere", async () => {
    const field = await openSave();
    fireEvent.change(field, { target: { value: "Cancelled today" } });
    fireEvent.keyDown(field, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(events.insert).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("saves the filters exactly as they stand, including the branch scope", async () => {
    render(<QueueAudit />);
    const reference = await screen.findByLabelText("referenceFilter");
    fireEvent.change(reference, { target: { value: "APPT-9" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(await screen.findByRole("button", { name: "Save current" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Preset name"), { target: { value: "Cancelled today" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(events.insert).toHaveBeenCalled());
    const [table, payload] = events.insert.mock.calls[0] as [string, Record<string, unknown>];
    expect(table).toBe("audit_export_presets");
    expect(payload).toMatchObject({
      branch_id: "branch-a", user_id: "actor-a", name: "Cancelled today",
      action: "all", user_filter: "all", ref: "APPT-9", scope_branch: false,
    });
    expect(await screen.findByText("Cancelled today")).toBeTruthy();
    expect(window.localStorage.getItem(CACHE_KEY)).toContain("Cancelled today");
  });

  it("Enter in the field saves, the way a desk finishes a short field", async () => {
    const field = await openSave();
    fireEvent.change(field, { target: { value: "Cancelled today" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(events.insert).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a preset the server refuses is not quietly kept as if it were saved", async () => {
    insertOutcome.rejected = true;
    const field = await openSave();
    fireEvent.change(field, { target: { value: "Cancelled today" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(events.insert).toHaveBeenCalled());
    await waitFor(() => expect(events.error).toHaveBeenCalled());
    expect(screen.queryByText("Cancelled today")).toBeNull();
    expect(window.localStorage.getItem(CACHE_KEY) ?? "").not.toContain("Cancelled today");
  });

  it("with no row to write to, it stays on the device instead of failing", async () => {
    state.branch = null;
    state.actor = null;
    vi.stubGlobal("crypto", { randomUUID: () => "preset-local-1" });
    const field = await openSave();
    fireEvent.change(field, { target: { value: "Offline preset" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(screen.getByText("Offline preset")).toBeTruthy());
    expect(events.insert).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("zmedico.auditPresets.global")).toContain("Offline preset");
  });

  it("opens the window on the desk's own calendar week", () => {
    render(<QueueAudit />);
    const { from, to } = dateFields();
    expect(to.value).toBe(localDateOnly());
    const seven = new Date(`${to.value}T00:00`);
    seven.setDate(seven.getDate() - 7);
    expect(from.value).toBe(localDateOnly(seven));
  });

  it("says the same thing in Arabic", async () => {
    state.lang = "ar";
    render(<QueueAudit />);
    fireEvent.click(await screen.findByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByText("حفظ الإعدادات المسبقة")).toBeTruthy();
    expect(screen.getByLabelText("اسم الإعداد المسبق")).toBeTruthy();
    expect(promptSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(events.insert).not.toHaveBeenCalled();
  });
});
