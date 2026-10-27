import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ lang: "en" as "ar" | "en" }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: state.lang, t: (key: string) => key }) }));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => null,
}));

import { RowActions } from "./RowActions";

// A14: twelve screens reach this default. Every one of their handlers only sets
// deleted_at (or calls delete_purchase_order_draft, whose body is an UPDATE), so the
// old "cannot be undone" sentence described a delete the application never performs.
function openDefaultDialog(props?: { deleteDescription?: string }) {
  render(<RowActions onDelete={async () => {}} deleteDescription={props?.deleteDescription} />);
  fireEvent.click(screen.getByRole("button", { name: "delete" }));
}

beforeEach(() => { state.lang = "en"; });
afterEach(cleanup);

describe("A14: the default delete confirmation tells the truth about a soft delete", () => {
  it("says the record is marked deleted, not erased, in English", () => {
    openDefaultDialog();
    expect(screen.getByText(/marked deleted in the database, not erased/)).toBeInTheDocument();
    expect(screen.queryByText(/cannot be undone/i)).toBeNull();
  });

  it("says the same thing in Arabic", () => {
    state.lang = "ar";
    openDefaultDialog();
    expect(screen.getByText("سيُخفى هذا السجل من القوائم — أي يُعلَّم كمحذوف في قاعدة البيانات ولا يُمحى منها.")).toBeInTheDocument();
    expect(screen.queryByText(/لا يمكن التراجع/)).toBeNull();
  });

  it("still lets a screen that really does destroy rows describe its own action", () => {
    openDefaultDialog({ deleteDescription: "This voids the invoice permanently." });
    expect(screen.getByText("This voids the invoice permanently.")).toBeInTheDocument();
    expect(screen.queryByText(/marked deleted in the database/)).toBeNull();
  });
});
