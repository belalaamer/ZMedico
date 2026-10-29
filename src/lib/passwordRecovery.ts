import { supabase } from "@/integrations/supabase/client";

/**
 * Which desk asked for the link. `from` is only a display decision on the
 * recovery screen — it chooses where its buttons go back to. It grants nothing:
 * `updateUser` still requires the session the link itself carries.
 */
export type RecoverySurface = "staff" | "patient";

export function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 255;
}

export function recoveryRedirectTo(surface: RecoverySurface): string {
  const target = `${window.location.origin}/reset-password`;
  return surface === "patient" ? `${target}?from=patient` : target;
}

export type RecoveryOutcome =
  | { kind: "sent"; email: string }
  | { kind: "invalid"; email: string }
  | { kind: "rejected"; email: string; error: unknown }
  | { kind: "transport"; email: string };

/**
 * One request, one normalization, one destination for both login screens. The
 * caller keeps ownership of its own toasts: the words are the screen's, the
 * address the link points at is not allowed to differ between them.
 */
export async function requestPasswordRecovery(rawEmail: string, surface: RecoverySurface): Promise<RecoveryOutcome> {
  const email = rawEmail.trim().toLowerCase();
  if (!isValidEmailAddress(email)) return { kind: "invalid", email };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirectTo(surface) });
    if (error) return { kind: "rejected", email, error };
    return { kind: "sent", email };
  } catch {
    return { kind: "transport", email };
  }
}
