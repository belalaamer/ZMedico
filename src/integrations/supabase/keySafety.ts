export function assertSafeBrowserSupabaseKey(value: string | undefined): string {
  const key = value?.trim();

  if (!key) {
    throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY is required.");
  }

  // Supabase secret keys carry elevated server-side privileges and must never
  // be bundled into Vite/browser code. Fail closed if CI or local config ever
  // points the public client variable at one by mistake.
  if (key.startsWith("sb_secret_")) {
    throw new Error(
      "Refusing to expose a Supabase secret key in the browser. Use a publishable/anon key for VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return key;
}

export function isOpaquePublishableSupabaseKey(value: string): boolean {
  return value.startsWith("sb_publishable_");
}
