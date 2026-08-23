export type PublicBookingLocator =
  | { mode: "custom-domain"; hostname: string }
  | { mode: "tenant-query"; slug: string }
  | { mode: "missing-tenant" };

export function getPublicBookingLocator(hostname: string, search: string): PublicBookingLocator {
  const normalizedHost = hostname.trim().toLowerCase();
  const isWorkerHost = !normalizedHost || normalizedHost === "localhost" || normalizedHost === "127.0.0.1" || normalizedHost.endsWith(".workers.dev");
  if (!isWorkerHost) return { mode: "custom-domain", hostname: normalizedHost };
  const slug = new URLSearchParams(search).get("tenant")?.trim() ?? "";
  return slug ? { mode: "tenant-query", slug } : { mode: "missing-tenant" };
}
