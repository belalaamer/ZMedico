import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
const store = vi.hoisted(() => ({ persisted: false }));
const state = vi.hoisted(() => ({ lang: "en" as "ar" | "en" }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: auth.user, loading: auth.loading }) }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: state.lang, t: (key: string) => key }) }));
vi.mock("@/lib/authSessionPersistence", () => ({
  hasPersistedAuthSession: () => store.persisted,
  getAuthStorageSnapshot: () => ({ origin: "https://zmedico.test", userIdPrefix: "00000000" }),
}));

import ProtectedRoute from "@/components/ProtectedRoute";

function renderGuarded(at = "/patients") {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route
          path="/patients"
          element={<ProtectedRoute><div>patient list</div></ProtectedRoute>}
        />
        <Route path="/auth" element={<div>sign in</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { auth.user = null; auth.loading = false; store.persisted = false; state.lang = "en"; });
afterEach(cleanup);

it("says what the guard is doing while the session is still loading", () => {
  auth.loading = true;
  renderGuarded();
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Checking your session…");
  expect(screen.queryByText("patient list")).toBeNull();
});

it("states the loader in Arabic when the interface is Arabic", () => {
  auth.loading = true;
  state.lang = "ar";
  renderGuarded();
  expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحقق من الجلسة…");
});

it("waits on a persisted session instead of bouncing the signed-in desk", () => {
  auth.loading = false;
  store.persisted = true;
  renderGuarded();
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.queryByText("sign in")).toBeNull();
});

it("renders the guarded page once the user is there", () => {
  auth.user = { id: "user-qa" };
  renderGuarded();
  expect(screen.getByText("patient list")).toBeInTheDocument();
  expect(screen.queryByRole("status")).toBeNull();
});

it("redirects to sign in when no session exists at all", () => {
  renderGuarded();
  expect(screen.getByText("sign in")).toBeInTheDocument();
});
