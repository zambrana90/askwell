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

/** True for an absolute http(s) URL with a host, e.g. https://askwell.app. Not "askwell.app". */
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "";
  } catch {
    return false;
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
  if (fromEnv) return isAbsoluteHttpUrl(fromEnv) ? trimSlashes(fromEnv) : null;

  // Behind a proxy the first forwarded value is the original one.
  const host = (origin.forwardedHost ?? origin.host)?.split(",")[0]?.trim();
  if (!host || !HOST_PATTERN.test(host)) return null;
  const proto = origin.forwardedProto?.split(",")[0]?.trim();
  const scheme = proto === "http" || proto === "https" ? proto : LOCAL_PATTERN.test(host) ? "http" : "https";
  return `${scheme}://${host}`;
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The script tag the owner pastes into their site. */
export function buildInstallSnippet({ appUrl, publicKey }: { appUrl: string; publicKey: string }): string {
  return `<script src="${escapeAttr(trimSlashes(appUrl) + WIDGET_SCRIPT_PATH)}" data-key="${escapeAttr(publicKey)}" async></script>`;
}
