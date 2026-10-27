import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// C16 + A21 on the scheduled-reminder screen. The row's clock used to be edited
// through `prompt("New time (YYYY-MM-DD HH:MM)")`: one English-only label on an
// Arabic desk, a free-text format the browser never validated, and a
// "Invalid date" toast that said nothing about what it wanted. The create form
// beside it had the quieter half of the same defect — its default was
// `toISOString().slice(0, 16)`, a UTC string handed to an input that reads
// wall-clock local time, so "one hour from now" arrived three hours early.

const state = vi.hoisted(() => ({
  lang: "en",
  branch: "branch-a",
  actor: "actor-a",
}));

const events = vi.hoisted(() => ({
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  filter: vi.fn(),
  read: vi.fn(),
  toast: vi.fn(),
}));

// What PostgREST reports back for the reschedule write. Batch 13 made this
// screen check it, so the dialog's happy path needs a row to be told it is
// really saved — and the zero-row path needs to stay honest about RLS.
const writeOutcome = vi.hoisted(() => ({ rows: 1 as number, message: null as string | null }));

// 2026-07-15T11:30Z is 14:30 in Cairo and 04:30 in Los Angeles.
const STORED_UTC = Date.UTC(2026, 6, 15, 11, 30, 0, 0);

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: events.toast }) }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: state.lang, t: (key: string) => key }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: state.actor } }) }));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ currentBranchId: state.branch, branchSelectionReady: !!state.branch, branches: [] }),
}));
vi.mock("@/lib/dataSync", () => ({ useDataSync: () => undefined }));
vi.mock("@/components/Can", () => ({ Can: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/integrations/supabase/client", () => {
  const rowsFor = (table: string) => {
    if (table === "reminders") {
      return [{ id: "rm-1", appointment_id: null, patient_id: "pt-1", branch_id: "branch-a", reminder_type: "sms", scheduled_time: new Date(STORED_UTC).toISOString(), message_en: "Your appointment is tomorrow", message_ar: "موعدك غدا", status: "pending", sent_at: null, error_message: null }];
    }
    if (table === "patients") return [{ id: "pt-1", first_name_en: "Testa", last_name_en: "Patient", first_name_ar: "تستة", last_name_ar: "مريض", name_language: "en", phone: "+201000000000" }];
    return [];
  };
  return {
    supabase: {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const name of ["select", "eq", "in", "is", "order", "limit", "gte", "lte", "lt", "neq"]) {
          chain[name] = (...args: unknown[]) => {
            if (name === "eq" || name === "in") events.filter(table, name, ...args);
            return chain;
          };
        }
        chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          events.read(table);
          return Promise.resolve({ data: rowsFor(table), error: null }).then(resolve, reject);
        };
        chain.update = (payload: unknown) => {
          events.update(table, payload);
          const write: Record<string, unknown> = {
            then: (r: (value: unknown) => unknown, j: (reason: unknown) => unknown) =>
              Promise.resolve(
                writeOutcome.message
                  ? { data: null, error: { message: writeOutcome.message } }
                  : { data: Array.from({ length: writeOutcome.rows }, (_, i) => ({ id: `rm-${i + 1}` })), error: null }
              ).then(r, j),
          };
          write.eq = (...args: unknown[]) => { events.filter(table, "eq", ...args); return write; };
          write.select = () => write;
          return write;
        };
        return chain;
      },
    },
  };
});

import ScheduledReminders from "./ScheduledReminders";

const promptSpy = vi.fn(() => null);
const originalTz = process.env.TZ;

const setTz = (tz: string) => { process.env.TZ = tz; };
const restoreTz = () => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
};

beforeEach(() => {
  state.lang = "en";
  state.branch = "branch-a";
  state.actor = "actor-a";
  writeOutcome.rows = 1;
  writeOutcome.message = null;
  vi.clearAllMocks();
  vi.stubGlobal("prompt", promptSpy);
  restoreTz();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  restoreTz();
});

const openReschedule = async () => {
  render(<ScheduledReminders />);
  const trigger = await screen.findByRole("button", { name: "Reschedule" });
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  return screen.getByLabelText("scheduledTime") as HTMLInputElement;
};

// Every case mounts the screen in jsdom, which on a loaded runner goes past the
// 5 s default. This is a budget, not a wait — same reading as CalendarPage's suite.
describe("reschedule dialog", { timeout: 30_000 }, () => {
  it("opens the app's own dialog and never reaches for the browser box", async () => {
    await openReschedule();
    expect(promptSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Reschedule reminder")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("Testa Patient");
  });

  it("prefills the row's own wall clock, whatever the desk's timezone is", async () => {
    const field = await openReschedule();
    // Read back as local time — the way datetime-local works — it must be the
    // stored instant again, not the instant shifted by the offset.
    expect(new Date(field.value).getTime()).toBe(STORED_UTC);
  });

  // The A21 receipt in the browser's terms rather than the helper's.
  it("prefills 14:30 on a Cairo clock and 04:30 on a Los Angeles clock", async () => {
    setTz("Africa/Cairo");
    const cairen = await openReschedule();
    expect(cairen.value).toBe("2026-07-15T14:30");
    // What the old default handed the same input: the UTC string, three hours
    // into the past on this clock, so the reminder was filed already overdue.
    expect(new Date(STORED_UTC).toISOString().slice(0, 16)).toBe("2026-07-15T11:30");
    cleanup();
    vi.clearAllMocks();

    setTz("America/Los_Angeles");
    const west = await openReschedule();
    expect(west.value).toBe("2026-07-15T04:30");
    restoreTz();
  });

  it("writes nothing while the dialog is open", async () => {
    await openReschedule();
    expect(events.update).not.toHaveBeenCalled();
  });

  it("Cancel writes nothing", async () => {
    const field = await openReschedule();
    fireEvent.change(field, { target: { value: "2026-07-20T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(events.update).not.toHaveBeenCalled();
    expect(events.toast).not.toHaveBeenCalled();
  });

  it("Escape writes nothing", async () => {
    const field = await openReschedule();
    fireEvent.keyDown(field, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(events.update).not.toHaveBeenCalled();
  });

  it("saves the picked wall clock as the instant it means locally, and re-arms the send", async () => {
    const field = await openReschedule();
    fireEvent.change(field, { target: { value: "2026-07-20T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(events.update).toHaveBeenCalled());
    const [table, payload] = events.update.mock.calls[0] as [string, Record<string, string>];
    expect(table).toBe("reminders");
    expect(new Date(payload.scheduled_time).getTime()).toBe(new Date("2026-07-20T09:00").getTime());
    expect(payload.status).toBe("pending");
    expect(events.filter).toHaveBeenCalledWith("reminders", "eq", "id", "rm-1");
    expect(events.toast).not.toHaveBeenCalled();
  });

  // The dialog closes as soon as the write is asked for, so a refusal has to
  // speak up — an empty table after a reschedule is otherwise read as success.
  it("a reschedule RLS filtered away says so instead of looking saved", async () => {
    writeOutcome.rows = 0;
    const field = await openReschedule();
    fireEvent.change(field, { target: { value: "2026-07-20T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(events.update).toHaveBeenCalled());
    await waitFor(() => expect(events.toast).toHaveBeenCalled());
    expect(events.toast.mock.calls[0][0]).toMatchObject({
      title: "Nothing was saved — the record is no longer available in this branch, or another user changed it.",
      variant: "destructive",
    });
  });

  it("a rejected write reports the server's reason", async () => {
    writeOutcome.message = "new row violates row-level security policy";
    const field = await openReschedule();
    fireEvent.change(field, { target: { value: "2026-07-20T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(events.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "new row violates row-level security policy" })
    ));
  });

  it("an empty field is refused without a write", async () => {
    const field = await openReschedule();
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(events.toast).toHaveBeenCalled());
    expect(events.update).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("says the same thing in Arabic", async () => {
    state.lang = "ar";
    render(<ScheduledReminders />);
    fireEvent.click(await screen.findByRole("button", { name: "إعادة جدولة" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByText("إعادة جدولة التذكير")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("بأي وقت تختاره هنا");
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(events.update).not.toHaveBeenCalled();
  });
});
