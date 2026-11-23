import { WIDGET_SCRIPT_PATH } from "@askwell/shared/embed";

/** What the request tells us about its own origin (from the headers). */
export type RequestOrigin = {
  host: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
};

// A bare host with an optional port. Anything else (spaces, slashes, quotes, tags) is refused.
const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;
const LOCAL_PATTERN = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const trimSlashes = (url: string) => url.replace(/\/+$/, "");

/**
 * The origin of an absolute URL with a host: https anywhere, http only for localhost.
 * Returns null otherwise ("askwell.app" has no scheme; ftp: and javascript: are refused).
 * `origin` drops any path, query and fragment, so "/widget.js" can be appended safely.
 */
function parseAppOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname === "") return null;
    if (url.protocol === "https:") return url.origin;
    return url.protocol === "http:" && LOCAL_PATTERN.test(url.host) ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The URL the widget script is served from: `NEXT_PUBLIC_APP_URL` if set, else the
 * request's own origin, so every Vercel preview gives a snippet that works on that preview.
 * Returns null when neither gives a usable value. A set but invalid `NEXT_PUBLIC_APP_URL`
 * (e.g. "askwell.app" with no scheme) is a misconfiguration: null, not a silent fallback.
 */
export function resolveAppUrl(envUrl: string | undefined, origin: RequestOrigin): string | null {
  const fromEnv = envUrl?.trim();
  if (fromEnv) return parseAppOrigin(fromEnv);

  // Behind a proxy the first forwarded value is the original one.
  const host = (origin.forwardedHost ?? origin.host)?.split(",")[0]?.trim();
  if (!host || !HOST_PATTERN.test(host)) return null;
  const proto = origin.forwardedProto?.split(",")[0]?.trim();
  // http only for local hosts: a non-local http script is blocked as mixed content on https sites.
  const local = LOCAL_PATTERN.test(host);
  const scheme = !local ? "https" : proto === "https" ? "https" : "http";
  return `${scheme}://${host}`;
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The script tag the owner pastes into their site. */
export function buildInstallSnippet({ appUrl, publicKey }: { appUrl: string; publicKey: string }): string {
  return `<script src="${escapeAttr(trimSlashes(appUrl) + WIDGET_SCRIPT_PATH)}" data-key="${escapeAttr(publicKey)}" async></script>`;
}
