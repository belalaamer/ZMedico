import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachGlobalRefreshListeners } from "@/lib/dataSync";
import { resetAuthzStore } from "@/lib/authz/sharedAuthzStore";

// A fake Supabase that can hold authz / branch / subscription responses, so a
// revalidation stays observable instead of resolving in the same tick. The
// counter map is the proof that a navigation did (or did not) re-query.
const sb = vi.hoisted(() => {
  type Query = { table: string; columns: string; single: boolean };
  type QueryResult = { data: unknown; error: null };
  type Session = ReturnType<typeof makeSession>;
  type Builder = {
    eq: () => Builder;
    neq: () => Builder;
    in: () => Builder;
    limit: () => Builder;
    order: () => Builder;
    maybeSingle: () => Builder;
    then: PromiseLike<QueryResult>["then"];
  };
  type Counts = {
    user_roles: number;
    staff: number;
    canonical: number;
    branches: number;
    subscription: number;
    modules: number;
    role_permissions: number;
  };

  const state = {
    eventCb: null as null | ((event: string, session: Session) => void),
    userId: "user-1",
    holdAuth: false,
    holdBranches: false,
    holdSubscription: false,
    held: [] as Array<() => void>,
    counts: {
      user_roles: 0,
      staff: 0,
      canonical: 0,
      branches: 0,
      subscription: 0,
      modules: 0,
      role_permissions: 0,
    } as Counts,
    branches: [
      { id: "branch-a", name_en: "Branch A", name_ar: "فرع أ" },
      { id: "branch-b", name_en: "Branch B", name_ar: "فرع ب" },
    ],
    subscription: {
      tenant_id: "tenant-1",
      tenant_name: "Tenant",
      tenant_name_en: "Tenant",
      tenant_name_ar: "مستأجر",
      tenant_slug: "tenant",
      plan_id: "plan-1",
      plan_name_ar: "خطة",
      plan_name_en: "Plan",
      plan_features: {},
      max_branches: 3,
      max_staff: 20,
      max_patients: 1000,
      max_invoices_monthly: 1000,
      subscription_status: "active",
      billing_cycle: "monthly",
      trial_ends_at: null,
      subscription_ends_at: null,
      current_period_start: null,
      current_period_end: null,
      is_active: true,
      access_allowed: true,
      access_reason: "active",
    },
    permissions(userId: string) {
      return ["patients.view", "appointments.view", "invoices.view", "settings.view"].map((permission_key) => ({
        user_id: userId,
        permission_key,
      }));
    },
  };

  function makeSession(id: string, token = "token-1") {
    return {
      access_token: token,
      refresh_token: `refresh-${token}`,
      expires_at: 9_999_999_999,
      user: {
        id,
        email: `${id}@example.test`,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "2026-01-01T00:00:00Z",
      },
    };
  }

  function deferred<T>(hold: boolean, make: () => T): Promise<T> {
    if (!hold) return Promise.resolve().then(make);
    return new Promise<T>((resolve) => {
      state.held.push(() => resolve(make()));
    });
  }

  function execute(query: Query): Promise<{ data: unknown; error: null }> {
    switch (query.table) {
      case "user_roles":
        state.counts.user_roles += 1;
        return deferred(state.holdAuth, () => ({ data: [{ role: "receptionist" }], error: null }));
      case "staff_profiles_self":
        state.counts.staff += 1;
        return deferred(state.holdAuth, () => ({ data: { status: "active" }, error: null }));
      case "branches":
        if (query.columns === "tenant_id") {
          return Promise.resolve({ data: { tenant_id: "tenant-1" }, error: null });
        }
        state.counts.branches += 1;
        return deferred(state.holdBranches, () => ({ data: state.branches, error: null }));
      case "tenant_module_settings":
        state.counts.modules += 1;
        return Promise.resolve({ data: [], error: null });
      case "role_permissions":
        state.counts.role_permissions += 1;
        return Promise.resolve({ data: [], error: null });
      default:
        return Promise.resolve({ data: [], error: null });
    }
  }

  function makeBuilder(table: string, columns: string): Builder {
    const query: Query = { table, columns, single: false };
    const builder: Builder = {
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      limit: () => builder,
      order: () => builder,
      maybeSingle: () => {
        query.single = true;
        return builder;
      },
      then: (onFulfilled, onRejected) => execute(query).then(onFulfilled, onRejected),
    };
    return builder;
  }

  const supabase = {
    from(table: string) {
      return {
        select(columns: string) {
          return makeBuilder(table, columns);
        },
        insert() {
          return makeBuilder(table, "*");
        },
        update() {
          return makeBuilder(table, "*");
        },
        delete() {
          return makeBuilder(table, "*");
        },
        upsert() {
          return makeBuilder(table, "*");
        },
      };
    },
    rpc(name: string) {
      switch (name) {
        case "current_user_effective_permissions":
          state.counts.canonical += 1;
          return deferred(state.holdAuth, () => ({ data: state.permissions(state.userId), error: null }));
        case "tenant_subscription_for_branch":
          state.counts.subscription += 1;
          return deferred(state.holdSubscription, () => ({ data: state.subscription, error: null }));
        case "resolve_active_tenant_domain":
          return Promise.resolve({ data: [], error: null });
        case "patient_portal_password_state":
          return Promise.resolve({ data: { active: false }, error: null });
        default:
          return Promise.resolve({ data: null, error: null });
      }
    },
    auth: {
      onAuthStateChange(cb: (event: string, session: Session) => void) {
        state.eventCb = cb;
        queueMicrotask(() => cb("INITIAL_SESSION", makeSession(state.userId)));
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession: () => Promise.resolve({ data: { session: makeSession(state.userId) }, error: null }),
      getUser: () => Promise.resolve({ data: { user: makeSession(state.userId).user }, error: null }),
      setSession: () => Promise.resolve({ data: { session: makeSession(state.userId) }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
  };

  return { state, supabase, makeSession };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: sb.supabase }));

vi.mock("@/contexts/I18nContext", () => ({
  I18nProvider: ({ children }: { children: ReactNode }) => children,
  useI18n: () => ({
    lang: "en",
    t: (key: string) => (key === "loadingPermissions" ? "Checking permissions…" : key),
  }),
}));

vi.mock("@/components/layout/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/layout/Topbar", () => ({ Topbar: () => null }));
vi.mock("@/components/MobileBottomNav", () => ({ MobileBottomNav: () => null }));
vi.mock("@/components/ErrorBoundary", () => ({ ErrorBoundary: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/hooks/use-toast", () => ({ toast: () => undefined, useToast: () => ({ toast: () => undefined }) }));

vi.mock("@/lib/authSessionPersistence", () => ({
  clearPersistedAuthSessions: () => undefined,
  getAuthStorageSnapshot: () => ({}),
  hasArrivingAuthRedirect: () => false,
  hasPersistedAuthSession: () => false,
  persistAuthSessionForPreview: () => undefined,
  readPersistedAuthSession: () => null,
}));

vi.mock("@/lib/authz/settingsShadowProbe", () => ({ useSettingsShadowProbe: () => undefined }));
vi.mock("@/lib/authz/patientsShadowProbe", () => ({ usePatientsShadowProbe: () => undefined }));
vi.mock("@/lib/authz/medicalRecordsShadowProbe", () => ({ useMedicalRecordsShadowProbe: () => undefined }));
vi.mock("@/lib/authz/hrShadowProbe", () => ({ useHrShadowProbe: () => undefined }));
vi.mock("@/lib/authz/invoicesShadowProbe", () => ({ useInvoicesShadowProbe: () => undefined }));

import { AuthProvider } from "@/contexts/AuthContext";
import { BranchProvider } from "@/contexts/BranchContext";
import { I18nProvider } from "@/contexts/I18nContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { PermissionRoute } from "@/components/PermissionRoute";
import AppShell from "@/components/layout/AppShell";

const mounts = { workspace: 0, patients: 0, calendar: 0 };

// The real /workspace dashboard route is not wrapped in PermissionRoute, so
// entering any guarded page from the dashboard mounts a fresh PermissionRoute.
function WorkspacePage() {
  useEffect(() => {
    mounts.workspace += 1;
  }, []);
  return <div data-testid="page-workspace">workspace page</div>;
}

function PatientsPage() {
  useEffect(() => {
    mounts.patients += 1;
  }, []);
  return <div data-testid="page-patients">patients page</div>;
}

function CalendarPage() {
  useEffect(() => {
    mounts.calendar += 1;
  }, []);
  return <div data-testid="page-calendar">calendar page</div>;
}

function Nav() {
  const navigate = useNavigate();
  return (
    <div>
      <button data-testid="nav-calendar" onClick={() => navigate("/calendar")}>
        open calendar
      </button>
      <button data-testid="nav-patients" onClick={() => navigate("/patients")}>
        open patients
      </button>
      <button data-testid="nav-patients-same-branch" onClick={() => navigate("/patients?branch=branch-a")}>
        open patients on the current branch
      </button>
    </div>
  );
}

function AppTree({ initialEntry }: { initialEntry: string }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <BranchProvider>
            <Nav />
            <Routes>
              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/workspace" element={<WorkspacePage />} />
                <Route
                  path="/patients"
                  element={
                    <PermissionRoute>
                      <PatientsPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/calendar"
                  element={
                    <PermissionRoute>
                      <CalendarPage />
                    </PermissionRoute>
                  }
                />
              </Route>
              <Route path="/auth" element={<div data-testid="auth-page">auth</div>} />
            </Routes>
          </BranchProvider>
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>
  );
}

async function bootToPatients() {
  render(<AppTree initialEntry="/patients" />);
  await waitFor(() => expect(screen.getByTestId("page-patients")).toBeInTheDocument(), { timeout: 4000 });
}

async function releaseHeldWork() {
  sb.state.holdAuth = false;
  sb.state.holdBranches = false;
  sb.state.holdSubscription = false;
  for (let round = 0; round < 20 && sb.state.held.length > 0; round += 1) {
    const pending = sb.state.held.splice(0);
    await act(async () => {
      pending.forEach((release) => release());
      await Promise.resolve();
      await Promise.resolve();
    });
  }
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  Element.prototype.scrollTo = () => undefined;
  sb.state.userId = "user-1";
  sb.state.holdAuth = false;
  sb.state.holdBranches = false;
  sb.state.holdSubscription = false;
  sb.state.held.length = 0;
  sb.state.counts = {
    user_roles: 0,
    staff: 0,
    canonical: 0,
    branches: 0,
    subscription: 0,
    modules: 0,
    role_permissions: 0,
  };
  mounts.workspace = 0;
  mounts.patients = 0;
  mounts.calendar = 0;
  localStorage.clear();
  sessionStorage.clear();
  resetAuthzStore();
  attachGlobalRefreshListeners();
});

afterEach(() => {
  cleanup();
});

describe("protected route gates are cold-boot only", () => {
  it("renders a protected page from the unguarded dashboard without re-gating or re-querying", async () => {
    render(<AppTree initialEntry="/workspace" />);
    await waitFor(() => expect(screen.getByTestId("page-workspace")).toBeInTheDocument(), { timeout: 4000 });
    const before = { ...sb.state.counts };

    // Hold every authz response so a fresh PermissionRoute cannot accidentally
    // resolve itself before the assertion observes the gate.
    sb.state.holdAuth = true;
    fireEvent.click(screen.getByTestId("nav-patients"));

    await waitFor(() => expect(screen.getByTestId("page-patients")).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.queryByText("Checking permissions…")).not.toBeInTheDocument();
    expect(screen.queryByText("Checking subscription…")).not.toBeInTheDocument();
    expect(sb.state.counts.user_roles).toBe(before.user_roles);
    expect(sb.state.counts.canonical).toBe(before.canonical);
  });

  it("keeps the page mounted when the URL gains the current branch query", async () => {
    await bootToPatients();
    expect(mounts.patients).toBe(1);

    sb.state.holdBranches = true;
    sb.state.holdSubscription = true;
    fireEvent.click(screen.getByTestId("nav-patients-same-branch"));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("page-patients")).toBeInTheDocument();
    expect(screen.queryByText("Checking subscription…")).not.toBeInTheDocument();
    expect(screen.queryByText("Checking permissions…")).not.toBeInTheDocument();

    await releaseHeldWork();

    expect(screen.getByTestId("page-patients")).toBeInTheDocument();
    expect(mounts.patients).toBe(1);
    expect(screen.queryByText("Checking subscription…")).not.toBeInTheDocument();
    expect(screen.queryByText("Checking permissions…")).not.toBeInTheDocument();
  });

  it("revalidates silently on focus/visibility without re-gating", async () => {
    await bootToPatients();
    const branchesBefore = sb.state.counts.branches;

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((resolve) => setTimeout(resolve, 900));
    });

    await waitFor(() => expect(sb.state.counts.branches).toBeGreaterThan(branchesBefore), { timeout: 2000 });
    expect(screen.getByTestId("page-patients")).toBeInTheDocument();
    expect(screen.queryByText("Checking subscription…")).not.toBeInTheDocument();
    expect(screen.queryByText("Checking permissions…")).not.toBeInTheDocument();
    expect(mounts.patients).toBe(1);
  });

  it("does not re-gate or re-query on TOKEN_REFRESHED with a new user object for the same id", async () => {
    await bootToPatients();
    const before = { ...sb.state.counts };

    await act(async () => {
      sb.state.eventCb?.("TOKEN_REFRESHED", sb.makeSession("user-1", "token-2"));
    });

    expect(screen.getByTestId("page-patients")).toBeInTheDocument();
    expect(screen.queryByText("Checking subscription…")).not.toBeInTheDocument();
    expect(screen.queryByText("Checking permissions…")).not.toBeInTheDocument();
    expect(sb.state.counts.user_roles).toBe(before.user_roles);
    expect(sb.state.counts.canonical).toBe(before.canonical);
    expect(sb.state.counts.branches).toBe(before.branches);
    expect(mounts.patients).toBe(1);
  });

  it("still gates and refetches when the identity actually changes", async () => {
    await bootToPatients();

    sb.state.userId = "user-2";
    sb.state.holdAuth = true;
    await act(async () => {
      sb.state.eventCb?.("SIGNED_IN", sb.makeSession("user-2", "token-3"));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.queryByTestId("page-patients")).not.toBeInTheDocument(), { timeout: 2000 });

    await releaseHeldWork();

    await waitFor(() => expect(screen.getByTestId("page-patients")).toBeInTheDocument(), { timeout: 2000 });
    expect(sb.state.counts.user_roles).toBeGreaterThan(1);
  });
});
