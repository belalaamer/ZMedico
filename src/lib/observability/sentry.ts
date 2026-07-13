/**
 * Opt-in Sentry initialization for the frontend.
 *
 * ZERO runtime impact when `VITE_SENTRY_DSN` is not set — the module
 * short-circuits before touching the network or importing the SDK.
 *
 * When the env var is present, the SDK is loaded lazily via dynamic
 * import from an ESM CDN so no new npm dependency is required. Teams
 * that later prefer a pinned dependency can swap the dynamic import for
 * `import * as Sentry from "@sentry/browser"` without touching callers.
 *
 * Consumed once by `src/main.tsx`. Safe to call multiple times.
 */

import { getSessionCorrelationId } from "./correlationId";

let initialized = false;

function readEnv(name: string): string | undefined {
  try {
    return (import.meta as any)?.env?.[name];
  } catch {
    return undefined;
  }
}

export async function initSentry(): Promise<void> {
  if (initialized) return;
  const dsn = readEnv("VITE_SENTRY_DSN");
  if (!dsn) return; // Feature off by default.
  initialized = true;

  try {
    // Loaded from esm.sh so no build-time dependency is required.
    // If the CDN is blocked this fails silently — Sentry is not on the
    // critical UX path.
    const mod: any = await import(
      /* @vite-ignore */ "https://esm.sh/@sentry/browser@7?bundle"
    );
    mod.init({
      dsn,
      environment: readEnv("VITE_SENTRY_ENV") ?? readEnv("MODE") ?? "production",
      release: readEnv("VITE_APP_VERSION") ?? readEnv("VITE_COMMIT_SHA") ?? undefined,
      tracesSampleRate: Number(readEnv("VITE_SENTRY_TRACES_SAMPLE_RATE") ?? "0"),
      initialScope: {
        tags: { correlation_id: getSessionCorrelationId() },
      },
    });
  } catch (err) {
    // Never break the app because telemetry failed to load.
    console.debug("[sentry] init skipped", err);
  }
}

/** Test-only: reset the initialized flag. */
export function __resetSentryForTests() {
  initialized = false;
}