export type PublicBookingLocator =
  | { mode: "custom-domain"; hostname: string }
  | { mode: "tenant-query"; slug: string }
  | { mode: "missing-tenant" };

export function getPublicBookingLocator(hostname: string, search: string): PublicBookingLocator {
  const normalizedHost = hostname.trim().toLowerCase();
  // The platform's own marketing domain is not a tenant custom domain. It
  // needs an explicit tenant query just like local and Workers preview hosts.
  const isPlatformHost = !normalizedHost
    || normalizedHost === "localhost"
    || normalizedHost === "127.0.0.1"
    || normalizedHost.endsWith(".workers.dev")
    || normalizedHost === "zmedico.com"
    || normalizedHost === "www.zmedico.com";
  if (!isPlatformHost) return { mode: "custom-domain", hostname: normalizedHost };
  const slug = new URLSearchParams(search).get("tenant")?.trim() ?? "";
  return slug ? { mode: "tenant-query", slug } : { mode: "missing-tenant" };
}
