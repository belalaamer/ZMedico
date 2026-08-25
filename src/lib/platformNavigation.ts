export function shouldShowPlatformReturnLink(isSystemOwner: boolean, pathname: string): boolean {
  return isSystemOwner && !pathname.startsWith("/platform");
}
