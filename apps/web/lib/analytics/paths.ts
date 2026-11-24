/** The widget panel. It runs on customers' sites and must never load PostHog. */
export function isEmbedPath(pathname: string): boolean {
  return pathname === "/embed" || pathname.startsWith("/embed/");
}

/** Session replay runs on the landing page and the dashboard only. */
export function wantsReplay(pathname: string): boolean {
  return pathname === "/" || pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

/** Pages where a Clerk session can exist and the owner should be identified. */
export function wantsIdentity(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
}
