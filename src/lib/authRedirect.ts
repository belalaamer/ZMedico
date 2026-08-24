export function defaultAuthenticatedPath(roles: readonly string[]): "/platform" | "/workspace" {
  return roles.includes("system_owner") ? "/platform" : "/workspace";
}

export function resolvePostAuthRedirect(path: string, roles: readonly string[]): string {
  const pathname = path.split("?", 1)[0] || "/";
  if (pathname !== "/" && pathname !== "/auth") return path;
  return defaultAuthenticatedPath(roles);
}
