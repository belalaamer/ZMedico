import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ permissions: new Set<string>(), admin: false }));

vi.mock("@/lib/authz/useAuthorization", () => ({
  useAuthorization: () => ({
    loading: false,
    authz: {
      can: (key: string) => state.admin || state.permissions.has(key),
      isSuperAdmin: () => state.admin,
      holdsAnyRole: () => false,
    },
  }),
}));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", t: (key: string) => key }) }));
vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ currentBranchId: "branch-1", branchSelectionReady: true, modulesLoading: false, isModuleEnabled: () => true }),
}));
// PermissionRoute pulls in the five shadow probes; none of them may reach a
// client from this test, and none of them run on a /treasury path.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async () => ({ data: [], error: null })), from: () => ({ select: () => ({ then: async () => ({ data: [], error: null }) }) }) },
}));

import { PermissionRoute } from "@/components/PermissionRoute";

function Desk() {
  return <div data-testid="desk">the till shift desk</div>;
}

function at(path: string, permission?: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PermissionRoute permission={permission}>
        <Desk />
      </PermissionRoute>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.permissions = new Set<string>();
  state.admin = false;
});

afterEach(() => cleanup());

const opened = () => screen.queryByTestId("desk") !== null;

describe("a route that asks for a narrower duty than <module>.view", () => {
  it("opens /treasury/shift for the person holding treasury.shift.use and not treasury.view", () => {
    // The receptionist is the reason this prop exists: moduleForPath maps
    // /treasury/shift to "treasury", the default gate demands treasury.view, and
    // the matrix never grants that to a receptionist — so the till the SQL
    // handed them sat behind an Access Denied card.
    state.permissions.add("treasury.shift.use");
    at("/treasury/shift", "treasury.shift.use");
    expect(opened()).toBe(true);
  });

  it("still denies that person the treasury screen, which keeps its module gate", () => {
    // Non-vacuity: the narrower duty must be what opened the desk, not a
    // blanket pass over the treasury module.
    state.permissions.add("treasury.shift.use");
    at("/treasury");
    expect(opened()).toBe(false);
    expect(screen.getByText("accessDenied")).toBeInTheDocument();
  });

  it("denies the desk to someone who holds neither key", () => {
    state.permissions.add("patients.view");
    at("/treasury/shift", "treasury.shift.use");
    expect(opened()).toBe(false);
  });

  it("changes nothing for a route that declares no permission", () => {
    // Without the prop the gate is the module default, byte-identical to every
    // other route in App.tsx.
    state.permissions.add("treasury.shift.use");
    at("/treasury/shift");
    expect(opened()).toBe(false);
  });

  it("keeps the owner above both gates", () => {
    state.admin = true;
    at("/treasury/shift", "treasury.shift.use");
    expect(opened()).toBe(true);
  });
});
