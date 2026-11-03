import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => {
  const state = {
    lang: "en",
    code: "MAIN" as string | null,
    tables: [] as string[],
    from: vi.fn(),
    upsert: vi.fn(),
  };
  state.from.mockImplementation((table: string) => {
    state.tables.push(table);
    const builder: any = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.maybeSingle = () => Promise.resolve({ data: { code: state.code }, error: null });
    builder.upsert = (...args: unknown[]) => { state.upsert(...args); return builder; };
    return builder;
  });
  return state;
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: api.from } }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (key: string) => key, lang: api.lang, setLang: vi.fn() }) }));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({
    branches: [{ id: "11111111-2222-3333-4444-555555555555", name_en: "Main branch", name_ar: "الفرع الرئيسي" }],
    currentBranchId: "11111111-2222-3333-4444-555555555555",
  }),
}));
vi.mock("@/lib/authz/useAuthorization", () => ({
  useAuthorization: () => ({ authz: { isSuperAdmin: () => false, holdsAnyRole: () => false } }),
}));
vi.mock("@/lib/authz/settingsShadowProbe", () => ({ useSettingsShadowProbe: () => undefined }));

import InvoiceSettings, { invoiceBranchCode } from "./InvoiceSettings";

function renderPage() {
  return render(<MemoryRouter><InvoiceSettings /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.lang = "en";
  api.code = "MAIN";
  api.tables.length = 0;
});

afterEach(() => cleanup());

const year = new Date().getFullYear();

describe("invoice settings are read-only", () => {
  it("shows the format the database actually generates, with this branch's code", async () => {
    renderPage();
    expect(await screen.findByText("INV-<BRANCH>-<YEAR>-<SEQ>")).toBeInTheDocument();
    expect(await screen.findByText(`INV-MAIN-${year}-0001`)).toBeInTheDocument();
    expect(screen.getByText(/this branch: MAIN/)).toBeInTheDocument();
  });

  it("offers no editable control and no save path", async () => {
    const { container } = renderPage();
    await screen.findByText("INV-<BRANCH>-<YEAR>-<SEQ>");
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
    expect(api.upsert).not.toHaveBeenCalled();
  });

  it("never reads or writes the inert invoice_settings table", async () => {
    renderPage();
    await screen.findByText("INV-<BRANCH>-<YEAR>-<SEQ>");
    expect(api.tables.length).toBeGreaterThan(0);
    expect(api.tables.every((table) => table === "branches")).toBe(true);
    expect(api.upsert).not.toHaveBeenCalled();
  });

  it("explains in Arabic why the page carries no fields", async () => {
    api.lang = "ar";
    renderPage();
    expect(await screen.findByText("الترقيم والتسلسل")).toBeInTheDocument();
    expect(screen.getByText("صفحة للقراءة فقط")).toBeInTheDocument();
    expect(screen.getByText(/يبدأ التسلسل من 0001/)).toBeInTheDocument();
  });

  it("names the automatic fallback code when a branch has none", async () => {
    api.code = null;
    renderPage();
    expect(await screen.findByText(`INV-B1111-${year}-0001`)).toBeInTheDocument();
    expect(screen.getByText(/assigned automatically/)).toBeInTheDocument();
  });
});

describe("invoiceBranchCode", () => {
  it("mirrors the database sanitisation and fallback", () => {
    expect(invoiceBranchCode("Main-1", "11111111-2222-3333-4444-555555555555")).toBe("MAIN1");
    expect(invoiceBranchCode("  ", "11111111-2222-3333-4444-555555555555")).toBe("B1111");
    expect(invoiceBranchCode(null, "abcdef12-0000-0000-0000-000000000000")).toBe("BABCD");
    // The generator drops non-ASCII before upper-casing, so an umlaut is not a letter to it.
    expect(invoiceBranchCode("ß", "11111111-2222-3333-4444-555555555555")).toBe("B1111");
  });

  it("stays pinned to the generator in the migration", () => {
    const sql = readFileSync("supabase/migrations/20260803210000_system_owner_and_per_branch_invoice_numbering.sql", "utf8");
    expect(sql).toContain("RETURN 'INV-' || code || '-' || y::text || '-' || lpad(n::text, 4, '0');");
    expect(sql).toContain("NULLIF(upper(regexp_replace(b.code, '[^A-Za-z0-9]', '', 'g')), '')");
    expect(sql).toContain("'B' || upper(left(replace(_branch::text, '-', ''), 4))");
  });
});
