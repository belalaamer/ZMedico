const CHUNK_RELOAD_GUARD_MS = 60_000;
const CHUNK_RELOAD_KEY_PREFIX = "zmedico:chunk-reload:";

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
  /loading chunk .+ failed/i,
  /unable to preload (?:css|module)/i,
];

function errorText(value: unknown): string {
  if (value instanceof Error) {
    return [value.name, value.message, value.stack].filter(Boolean).join("\n");
  }
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value) {
    return String((value as { message?: unknown }).message ?? "");
  }
  return String(value ?? "");
}

/** True for the stale code-split asset failures commonly seen after a deploy. */
export function isLikelyStaleChunkError(value: unknown): boolean {
  const text = errorText(value);
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

export function shouldAttemptStaleChunkReload(
  value: unknown,
  lastReloadAt: number | null,
  now = Date.now(),
  online = true,
): boolean {
  if (!online || !isLikelyStaleChunkError(value)) return false;
  if (lastReloadAt == null || !Number.isFinite(lastReloadAt)) return true;

  const elapsed = now - lastReloadAt;
  return elapsed < 0 || elapsed >= CHUNK_RELOAD_GUARD_MS;
}

/**
 * Recover from a stale lazy-loaded chunk after a new deployment.
 *
 * The HTML shell is served with Cache-Control: no-store, so a single reload
 * fetches the latest manifest/chunk references. sessionStorage prevents an
 * infinite reload loop if the deployment itself is actually broken.
 */
export function recoverFromStaleChunk(value: unknown): boolean {
  if (typeof window === "undefined" || !isLikelyStaleChunkError(value)) return false;

  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (!online) return false;

  const key = `${CHUNK_RELOAD_KEY_PREFIX}${window.location.pathname || "/"}`;
  let lastReloadAt: number | null = null;

  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored != null) lastReloadAt = Number(stored);
  } catch {
    // Without a persistent guard, automatic reload could loop forever.
    return false;
  }

  const now = Date.now();
  if (!shouldAttemptStaleChunkReload(value, lastReloadAt, now, online)) return false;

  try {
    window.sessionStorage.setItem(key, String(now));
  } catch {
    return false;
  }

  // Give self-hosted telemetry a brief chance to enqueue before navigation.
  window.setTimeout(() => window.location.reload(), 150);
  return true;
}
