import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock("@/lib/authSessionPersistence", () => ({
  hasPersistedAuthSession: () => true,
  getAuthStorageSnapshot: () => ({
    origin: "https://zmedico.test",
    canonicalStorageKey: "sb-test-auth-token",
    hasCanonicalSession: true,
    storageKeys: ["sb-test-auth-token"],
    hasAnyPersistedSession: true,
    userIdPrefix: null,
  }),
}));

describe("ProtectedRoute", () => {
  it("redirects a stale persisted session instead of waiting forever", async () => {
    render(
      <MemoryRouter initialEntries={["/patients"]}>
        <Routes>
          <Route
            path="/patients"
            element={
              <ProtectedRoute>
                <div>protected content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<div>auth page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("auth page")).toBeInTheDocument();
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });
});
