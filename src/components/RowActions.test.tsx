import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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

const kebab = () => screen.queryByRole("button", { name: "actions" });

beforeEach(() => { state.lang = "en"; });
afterEach(cleanup);

it("renders no control at all when every action is permission-gated away", () => {
  // The Expenses shape: a category row has no edit affordance and delete rights are off.
  render(<RowActions canEdit={false} onDelete={undefined} />);
  expect(kebab()).toBeNull();

  // The MedicalRecords shape: handlers exist but authz hides both.
  render(<RowActions onEdit={() => {}} onDelete={async () => {}} canEdit={false} canDelete={false} />);
  expect(kebab()).toBeNull();
});

it("keeps the menu when only the surviving action is delete", () => {
  const onDelete = vi.fn();
  render(<RowActions onEdit={() => {}} onDelete={onDelete} canEdit={false} />);
  expect(kebab()).not.toBeNull();
  expect(screen.getByRole("button", { name: "delete" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "edit" })).toBeNull();
});

it("keeps the menu when only a caller-supplied extra item is left", () => {
  const onOpen = vi.fn();
  render(<RowActions extraItems={[{ label: "Open chart", onClick: onOpen }]} />);
  expect(kebab()).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open chart" }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it("treats an empty extraItems array as no action", () => {
  render(<RowActions extraItems={[]} />);
  expect(kebab()).toBeNull();
});
