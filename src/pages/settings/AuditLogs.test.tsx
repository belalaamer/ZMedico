import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  lang: "ar" as "ar" | "en",
  rows: [
    {
      id: "a1", branch_id: "b1", action: "admin_delete_user", entity_type: "auth_user",
      entity_id: "u-2", created_at: "2026-11-01T10:00:00Z", user_id: "u-1",
      old_values: null, new_values: { reason: "cleanup" },
    },
    {
      id: "a2", branch_id: "b1", action: "custom_domain_status", entity_type: "tenant_domain",
      entity_id: "dom-1", created_at: "2026-11-01T09:00:00Z", user_id: "u-1",
      old_values: null, new_values: { status: "active" },
    },
    {
      id: "a3", branch_id: "b1", action: "appointment_created", entity_type: "appointment",
      entity_id: "apt-1", created_at: "2026-11-01T08:00:00Z", user_id: null,
      old_values: null, new_values: {},
    },
    {
      id: "a4", branch_id: "b1", action: "update", entity_type: "tenant_domain",
      entity_id: "dom-1", created_at: "2026-11-01T07:00:00Z", user_id: "u-1",
      old_values: null, new_values: {},
    },
    {
      id: "a5", branch_id: "b1", action: "mystery_action_v9", entity_type: "profile",
      entity_id: "u-3", created_at: "2026-11-01T06:00:00Z", user_id: null,
      old_values: null, new_values: {},
    },
  ],
}));

vi.mock("@/contexts/I18nContext", () => ({
  useI18n: () => ({ t: (key: string) => key, lang: h.lang }),
}));

vi.mock("./SettingsLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ currentBranchId: "b1", branchSelectionReady: true }),
}));

// Radix Select does not open under jsdom; the repo's established pattern is
// to render the same primitives as native selects so the option set (which is
// what this screen got wrong) is directly assertable.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <option value="" disabled>{placeholder}</option>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "audit_logs") {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                eq: () => Promise.resolve({ data: h.rows, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [{ id: "u-1", full_name: "مستخدم الاختبار", email: "qa@example.com" }],
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected lookup table in this fixture: ${table}`);
    },
  },
}));

import AuditLogs from "./AuditLogs";

beforeEach(() => { h.lang = "ar"; });
afterEach(() => cleanup());

const combos = () => screen.getAllByRole("combobox");

describe("audit log action vocabulary", () => {
  it("shows human Arabic labels while keeping the raw token as the title", async () => {
    render(<AuditLogs />);
    const t = await screen.findByRole("table");

    expect(within(t).getByText("حذف حساب بواسطة الإدارة")).toHaveAttribute("title", "admin_delete_user");
    expect(within(t).getByText("تغيير حالة نطاق مخصص")).toHaveAttribute("title", "custom_domain_status");
    expect(within(t).getByText("إنشاء موعد")).toHaveAttribute("title", "appointment_created");
    expect(within(t).queryByText("admin_delete_user")).toBeNull();
  });

  it("prettifies an action token it has never seen instead of hiding the row", async () => {
    render(<AuditLogs />);
    const t = await screen.findByRole("table");
    expect(within(t).getByText("mystery action v9")).toHaveAttribute("title", "mystery_action_v9");
  });

  it("names the entity types it previously left raw", async () => {
    render(<AuditLogs />);
    const t = await screen.findByRole("table");
    expect(within(t).getAllByText("نطاق مخصص")).toHaveLength(2);
    expect(within(t).getByText("حساب مستخدم")).toBeInTheDocument();
    expect(within(t).getByText("موعد")).toBeInTheDocument();
    expect(within(t).getByText("ملف مستخدم")).toBeInTheDocument();
  });

  it("builds the action filter from the rows on screen, not a fixed five-item list", async () => {
    render(<AuditLogs />);
    await screen.findByRole("table");

    const actionSelect = combos()[0];
    const options = within(actionSelect).getAllByRole("option")
      .filter(o => !o.hasAttribute("disabled"));
    expect(options[0]).toHaveValue("all");
    expect(options.slice(1).map(o => o.getAttribute("value")).sort()).toEqual([
      "admin_delete_user",
      "appointment_created",
      "custom_domain_status",
      "mystery_action_v9",
      "update",
    ].sort());
    expect(within(actionSelect).getByRole("option", { name: "حذف حساب بواسطة الإدارة" }))
      .toHaveAttribute("value", "admin_delete_user");
  });

  it("filters by a real action, including ones the old hardcoded list could not select", async () => {
    render(<AuditLogs />);
    const t = await screen.findByRole("table");

    fireEvent.change(combos()[0], { target: { value: "admin_delete_user" } });

    await waitFor(() => {
      expect(within(t).getByText("حذف حساب بواسطة الإدارة")).toBeInTheDocument();
      expect(within(t).queryByText("تغيير حالة نطاق مخصص")).toBeNull();
      expect(within(t).queryByText("إنشاء موعد")).toBeNull();
      expect(within(t).queryByText("mystery action v9")).toBeNull();
    });
  });

  it("searches the visible Arabic labels, not only the raw tokens", async () => {
    render(<AuditLogs />);
    const t = await screen.findByRole("table");

    fireEvent.change(screen.getByPlaceholderText("search"), { target: { value: "تغيير حالة" } });

    await waitFor(() => {
      expect(within(t).getByText("تغيير حالة نطاق مخصص")).toBeInTheDocument();
      expect(within(t).queryByText("حذف حساب بواسطة الإدارة")).toBeNull();
    });
  });

  it("localizes the filter placeholders too", async () => {
    render(<AuditLogs />);
    await screen.findByRole("table");

    expect(within(combos()[0]).getByRole("option", { name: "الإجراء" })).toBeInTheDocument();
    expect(within(combos()[0]).queryByRole("option", { name: "Action" })).toBeNull();
    expect(within(combos()[1]).getByRole("option", { name: "الكيان" })).toBeInTheDocument();
    expect(within(combos()[1]).queryByRole("option", { name: "Entity" })).toBeNull();
  });

  it("renders the English vocabulary when the UI is English", async () => {
    h.lang = "en";
    render(<AuditLogs />);
    const t = await screen.findByRole("table");

    expect(within(t).getByText("Account deleted by admin")).toHaveAttribute("title", "admin_delete_user");
    expect(within(t).getByText("Custom domain status change")).toBeInTheDocument();
    expect(within(t).getByText("Appointment created")).toBeInTheDocument();
    expect(within(t).getByText("Update")).toBeInTheDocument();
    expect(within(combos()[0]).getByRole("option", { name: "Action" })).toBeInTheDocument();
    expect(within(combos()[1]).getByRole("option", { name: "Entity" })).toBeInTheDocument();
  });
});
