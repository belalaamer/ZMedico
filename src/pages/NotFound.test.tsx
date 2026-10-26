import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ lang: "en" as "ar" | "en" }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: state.lang, t: (key: string) => key }) }));

import NotFound from "@/pages/NotFound";

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <NotFound />
    </MemoryRouter>,
  );

beforeEach(() => { state.lang = "en"; });
afterEach(cleanup);

it("speaks the interface language instead of only English", () => {
  at("/clinic/typo");
  expect(screen.getByText("There is no page at this address")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Return to the workspace" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Patient portal sign in" })).toBeInTheDocument();

  cleanup();
  state.lang = "ar";
  at("/clinic/typo");
  expect(screen.getByText("لا توجد صفحة به هذا العنوان")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "دخول المرضى" })).toBeInTheDocument();
  expect(screen.queryByText("There is no page at this address")).toBeNull();
  expect(screen.queryByText("Patient portal sign in")).toBeNull();
});

it("shows the address that was actually asked for", () => {
  at("/patien-protal");
  expect(screen.getByText("/patien-protal")).toBeInTheDocument();
});

it("offers a patient an exit that does not land them on the staff desk", () => {
  at("/patient-portal/typo");
  const portal = screen.getByRole("link", { name: "Patient portal sign in" });
  expect(portal).toHaveAttribute("href", "/patient-portal/login");
  expect(screen.getByRole("link", { name: "Return to the workspace" })).toHaveAttribute("href", "/");
});
