import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({ signIn: vi.fn(), nav: vi.fn(), error: vi.fn() }));

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", setLang: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
vi.mock("react-router-dom", () => ({ Link: ({ children }: { children: ReactNode }) => <span>{children}</span>, useNavigate: () => api.nav }));
vi.mock("sonner", () => ({ toast: { error: api.error, success: vi.fn() } }));
vi.mock("@/lib/signInWithIdentifier", () => ({ signInWithIdentifier: api.signIn }));

import PatientPortalLogin from "./PatientPortalLogin";

beforeEach(() => {
  vi.clearAllMocks();
  api.signIn.mockResolvedValue({ data: { session: { user: { id: "p" } } }, error: null });
});
afterEach(cleanup);

describe("patient portal sign-in", () => {
  it("sends a short password to the server instead of refusing it in the browser", async () => {
    // A 6-7 character password is exactly what the recovery screen used to allow,
    // and the old client-side >= 8 gate turned it into a permanent lockout with a
    // message that never mentioned length.
    render(<PatientPortalLogin />);
    fireEvent.change(screen.getByLabelText("Email or username"), { target: { value: "salma@example.invalid" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "sixsix" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to portal" }));
    await waitFor(() => expect(api.signIn).toHaveBeenCalledWith("salma@example.invalid", "sixsix"));
    expect(api.error).not.toHaveBeenCalled();
  });

  it("still refuses a blank identifier without calling the provider", async () => {
    // `required` cannot cover this: a spaces-only value is non-empty as far as the
    // browser is concerned, so only the handler's trim() keeps it off the wire.
    render(<PatientPortalLogin />);
    fireEvent.change(screen.getByLabelText("Email or username"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "someone" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to portal" }));
    await waitFor(() => expect(api.error).toHaveBeenCalledWith("Enter your email or username and password"));
    expect(api.signIn).not.toHaveBeenCalled();
  });
});
