/**
 * The host page's origin, from the `origin` query param. Returns null unless it is
 * a plain http(s) origin. A sandboxed or file:// host has origin "null": that is
 * invalid too, so the panel posts nothing rather than use "null" or "*".
 */
export function parseHostOrigin(raw: unknown): string | null {
  if (typeof raw !== "string" || raw === "" || raw === "null") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Must be an origin only: no path, query, hash or credentials.
    if (raw !== url.origin && raw !== `${url.origin}/`) return null;
    return url.origin;
  } catch {
    return null;
  }
}
