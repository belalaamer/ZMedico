import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReceptionGuide } from "./ReceptionGuide";

const state = vi.hoisted(() => ({ loading: false, permissions: new Set<string>(), lang: "ar" }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: state.lang }) }));
vi.mock("@/contexts/BranchContext", () => ({ useBranch: () => ({ currentBranchId: "test-branch" }) }));
vi.mock("@/lib/authz/useAuthorization", () => ({ useAuthorization: () => ({ loading: state.loading, authz: { can: (p: string) => state.permissions.has(p) } }) }));
afterEach(() => { cleanup(); state.loading = false; state.permissions.clear(); state.lang = "ar"; });
const mount = () => render(<MemoryRouter><ReceptionGuide /></MemoryRouter>);
describe("ReceptionGuide", () => {
  it("hides when there are no relevant permissions", () => { mount(); expect(screen.queryByRole("button")).toBeNull(); });
  it("hides while authorization loads", () => { state.loading = true; state.permissions.add("patients.view"); mount(); expect(screen.queryByRole("button")).toBeNull(); });
  it("shows only allowed steps and preserves branch", () => {
    state.permissions.add("patients.view"); mount(); fireEvent.click(screen.getByRole("button", { name: "دليل الاستقبال" }));
    expect(screen.getByRole("link")).toHaveAttribute("href", "/patients?branch=test-branch");
    expect(screen.queryByText("٤. راجع التحصيل")).toBeNull();
  });
  it("supports English and queue navigation", () => {
    state.lang = "en"; state.permissions.add("appointments.view"); mount(); fireEvent.click(screen.getByRole("button", { name: "Reception guide" }));
    expect(screen.getByText("3. Follow the queue")).toBeInTheDocument();
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/calendar?branch=test-branch", "/queue?branch=test-branch"]);
  });
});
