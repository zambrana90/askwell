/**
 * Contract between the widget loader (`apps/widget`) and the /embed panel
 * (`apps/web/app/embed`). Both import it; neither redefines it.
 *
 * Keep this file dependency-free (no zod, no imports): the loader bundles it
 * and widget.js must stay small. Loader code imports `@askwell/shared/embed`.
 */

export const EMBED_PATH = "/embed";
export const WIDGET_SCRIPT_PATH = "/widget.js";
/** localStorage key (in the iframe's origin) for the random visitor id. */
export const VISITOR_ID_STORAGE_KEY = "askwell:visitor-id";

export const EMBED_MESSAGE_TYPES = {
  close: "askwell:close",
  resize: "askwell:resize",
  unread: "askwell:unread",
  visibility: "askwell:visibility",
} as const;

/** Panel to loader: the visitor closed the panel. */
export type EmbedCloseMessage = { type: "askwell:close" };
/** Panel to loader: the height (px) the panel wants. The loader clamps it. */
export type EmbedResizeMessage = { type: "askwell:resize"; height: number };
/** Panel to loader: replies the visitor has not seen yet. */
export type EmbedUnreadMessage = { type: "askwell:unread"; count: number };
/** Loader to panel: the panel is now open or hidden. */
export type EmbedVisibilityMessage = {
  type: "askwell:visibility";
  open: boolean;
};

export type PanelToLoaderMessage =
  | EmbedCloseMessage
  | EmbedResizeMessage
  | EmbedUnreadMessage;
export type LoaderToPanelMessage = EmbedVisibilityMessage;
export type EmbedMessage = PanelToLoaderMessage | LoaderToPanelMessage;

/**
 * Copy an untrusted value's own enumerable properties once, into a plain
 * object with no prototype. Getters run once, inherited fields are ignored,
 * and anything that throws while being inspected (getters, proxies) gives null.
 * Every guard below validates and returns values from this copy only.
 */
function snapshot(data: unknown): Record<string, unknown> | null {
  try {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return null;
    }
    const copy: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(data)) {
      copy[key] = (data as Record<string, unknown>)[key];
    }
    return copy;
  } catch {
    return null;
  }
}

/** True when the snapshot has exactly these own keys: no more, no fewer. */
function hasExactKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(obj);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}

function panelFrom(obj: Record<string, unknown>): PanelToLoaderMessage | null {
  switch (obj.type) {
    case EMBED_MESSAGE_TYPES.close:
      return hasExactKeys(obj, ["type"]) ? { type: "askwell:close" } : null;
    case EMBED_MESSAGE_TYPES.resize: {
      const { height } = obj;
      if (!hasExactKeys(obj, ["type", "height"])) return null;
      if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
        return null;
      }
      return { type: "askwell:resize", height };
    }
    case EMBED_MESSAGE_TYPES.unread: {
      const { count } = obj;
      if (!hasExactKeys(obj, ["type", "count"])) return null;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
        return null;
      }
      return { type: "askwell:unread", count };
    }
    default:
      return null;
  }
}

function loaderFrom(obj: Record<string, unknown>): LoaderToPanelMessage | null {
  if (obj.type !== EMBED_MESSAGE_TYPES.visibility) return null;
  if (!hasExactKeys(obj, ["type", "open"])) return null;
  const { open } = obj;
  if (typeof open !== "boolean") return null;
  return { type: "askwell:visibility", open };
}

/** Parse a message sent by the panel. Returns null for anything else. Never throws. */
export function parsePanelMessage(data: unknown): PanelToLoaderMessage | null {
  const obj = snapshot(data);
  return obj ? panelFrom(obj) : null;
}

/** Parse a message sent by the loader. Returns null for anything else. Never throws. */
export function parseLoaderMessage(data: unknown): LoaderToPanelMessage | null {
  const obj = snapshot(data);
  return obj ? loaderFrom(obj) : null;
}

/** Parse any embed message. Returns the typed message or null. Never throws. */
export function parseEmbedMessage(data: unknown): EmbedMessage | null {
  const obj = snapshot(data);
  return obj ? (panelFrom(obj) ?? loaderFrom(obj)) : null;
}

/**
 * `<appOrigin>/embed?key=…&origin=…`. `hostOrigin` is the customer's site origin;
 * the panel uses it as the targetOrigin when posting to the parent, never `*`.
 */
export function buildEmbedUrl(
  appOrigin: string,
  key: string,
  hostOrigin: string,
): string {
  const base = appOrigin.replace(/\/+$/, "");
  return `${base}${EMBED_PATH}?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(hostOrigin)}`;
}
