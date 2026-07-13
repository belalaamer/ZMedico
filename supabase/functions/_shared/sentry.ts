/**
 * Opt-in Sentry reporter for Edge Functions.
 *
 * ZERO side effects unless `SENTRY_DSN` is set in the function's
 * environment. Uses the Sentry `/store` HTTP envelope directly to avoid
 * bundling the SDK — Deno edge runtime bans large dependency trees.
 *
 * Usage (opt-in per function):
 *
 *   try {
 *     ...
 *   } catch (err) {
 *     await reportToSentry(err, { correlation_id: cid, fn: "admin-create-user" });
 *     throw err;
 *   }
 */

function parseDsn(dsn: string): { url: string; key: string } | null {
  try {
    const u = new URL(dsn);
    const key = u.username;
    const projectId = u.pathname.replace(/^\//, "");
    if (!key || !projectId) return null;
    const host = u.host;
    return {
      url: `https://${host}/api/${projectId}/store/?sentry_version=7&sentry_key=${key}`,
      key,
    };
  } catch {
    return null;
  }
}

export async function reportToSentry(
  err: unknown,
  tags?: Record<string, string | number>,
): Promise<void> {
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) return;

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  const body = {
    message,
    level: "error",
    platform: "javascript",
    environment: Deno.env.get("SENTRY_ENV") ?? "production",
    release: Deno.env.get("APP_VERSION") ?? undefined,
    tags: tags ?? {},
    exception: stack
      ? { values: [{ type: err instanceof Error ? err.name : "Error", value: message, stacktrace: { frames: [] } }] }
      : undefined,
    extra: stack ? { stack } : undefined,
  };

  try {
    await fetch(parsed.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Never surface telemetry failures to callers.
  }
}