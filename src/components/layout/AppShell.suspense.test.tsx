import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense, lazy, type ComponentType } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const i18n = vi.hoisted(() => ({ lang: "en" as "ar" | "en" }));

vi.mock("@/contexts/I18nContext", () => ({
  useI18n: () => ({ lang: i18n.lang }),
}));

vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({
    currentBranchId: "branch-a",
    branchSelectionReady: true,
    subscription: { access_allowed: true },
    subscriptionLoading: false,
  }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ roles: [{ role: "receptionist" }], loading: false }),
}));

vi.mock("@/lib/authz/useAuthorization", () => ({
  useAuthorization: () => ({ authz: { holdsAnyRole: () => false, has: () => true }, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: () => Promise.resolve({ data: { active: false }, error: null }) },
}));

vi.mock("@/components/layout/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/layout/Topbar", () => ({ Topbar: () => null }));
vi.mock("@/components/MobileBottomNav", () => ({ MobileBottomNav: () => null }));
vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

import AppShell from "@/components/layout/AppShell";

function LazyPageView() {
  return <div data-testid="lazy-page">lazy page</div>;
}

function makeLazyPage() {
  let release: () => void = () => undefined;
  const module = new Promise<{ default: ComponentType }>((resolve) => {
    release = () => resolve({ default: LazyPageView });
  });
  return { Component: lazy(() => module), release };
}

function Nav() {
  const navigate = useNavigate();
  return (
    <div>
      <button data-testid="nav-lazy" onClick={() => navigate("/lazy")}>
        open lazy page
      </button>
      <button data-testid="nav-public" onClick={() => navigate("/public-lazy")}>
        open public lazy page
      </button>
    </div>
  );
}

// Mirrors src/App.tsx: one route-level Suspense wraps the shell route, and the
// shell is itself a lazy chunk. A page chunk that suspends must be caught by
// the boundary inside AppShell, not by this full-screen one.
function ShellTree({ lazyPage }: { lazyPage: ComponentType }) {
  const LazyRoute = lazyPage;
  return (
    <MemoryRouter initialEntries={["/workspace"]}>
      <Nav />
      <Suspense fallback={<div data-testid="full-screen-loader">Loading page…</div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/workspace" element={<div data-testid="workspace-page">workspace page</div>} />
            <Route path="/lazy" element={<LazyRoute />} />
          </Route>
          <Route path="/public-lazy" element={<LazyRoute />} />
        </Routes>
      </Suspense>
    </MemoryRouter>
  );
}

beforeEach(() => {
  Element.prototype.scrollTo = () => undefined;
  i18n.lang = "en";
});

afterEach(() => {
  cleanup();
});

describe("AppShell keeps its chrome while a lazy page chunk loads", () => {
  it("suspends the page area only, never the shell", async () => {
    const { Component, release } = makeLazyPage();
    render(<ShellTree lazyPage={Component} />);

    const shellMain = screen.getByTestId("workspace-page").closest("main");
    expect(shellMain).not.toBeNull();

    fireEvent.click(screen.getByTestId("nav-lazy"));

    expect(screen.getByText("Loading page…")).toBeInTheDocument();
    // React keeps the suspended tree mounted but hidden.
    expect(screen.queryByTestId("workspace-page")).not.toBeVisible();
    // The full-screen route loader belongs to App.tsx's top-level boundary.
    // If the shell had been unmounted, this is what the user would see.
    expect(screen.queryByTestId("full-screen-loader")).not.toBeInTheDocument();
    expect(document.querySelector("main")).toBe(shellMain);

    await act(async () => {
      release();
    });

    await waitFor(() => expect(screen.getByTestId("lazy-page")).toBeInTheDocument());
    expect(screen.queryByTestId("full-screen-loader")).not.toBeInTheDocument();
    expect(document.querySelector("main")).toBe(shellMain);
  });

  it("keeps the in-content loader bilingual for the Arabic desk", async () => {
    i18n.lang = "ar";
    const { Component, release } = makeLazyPage();
    render(<ShellTree lazyPage={Component} />);

    fireEvent.click(screen.getByTestId("nav-lazy"));

    expect(screen.getByText("جارٍ تحميل الصفحة…")).toBeInTheDocument();
    expect(screen.queryByTestId("full-screen-loader")).not.toBeInTheDocument();

    await act(async () => {
      release();
    });
    await waitFor(() => expect(screen.getByTestId("lazy-page")).toBeInTheDocument());
  });

  it("still lets the top-level boundary handle routes with no shell", async () => {
    const { Component, release } = makeLazyPage();
    render(<ShellTree lazyPage={Component} />);

    fireEvent.click(screen.getByTestId("nav-public"));

    expect(screen.getByTestId("full-screen-loader")).toBeInTheDocument();
    expect(document.querySelector("main")).not.toBeVisible();

    await act(async () => {
      release();
    });

    await waitFor(() => expect(screen.getByTestId("lazy-page")).toBeInTheDocument());
  });
});
