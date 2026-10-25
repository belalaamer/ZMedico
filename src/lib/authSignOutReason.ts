export type SignOutReason = "user" | "idle" | "password-change" | "account-closed";

// `onAuthStateChange` fires for every sign-out in this tab, including the ones the
// app asked for, so the handler alone cannot tell an explained logout from a lost
// session. Whoever starts the sign-out records the reason here and owns the copy
// that goes with it. Call sites live outside the provider (a direct
// `supabase.auth.signOut()` after a password change, or the deleted-account path
// inside it), so this has to be module state rather than a ref.
//
// A reason that no SIGNED_OUT event consumed must not swallow a later, genuine
// session loss, so it expires.
const TTL_MS = 10_000;

let recorded: { reason: SignOutReason; at: number } | null = null;

export function markSignOutReason(reason: SignOutReason): void {
  recorded = { reason, at: Date.now() };
}

/** Read once: the consumer decides, so a reason can never fire two notices. */
export function takeSignOutReason(): SignOutReason | null {
  const entry = recorded;
  recorded = null;
  if (!entry) return null;
  return Date.now() - entry.at <= TTL_MS ? entry.reason : null;
}
