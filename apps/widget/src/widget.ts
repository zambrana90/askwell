import { buildEmbedUrl, parsePanelMessage } from "@askwell/shared/embed";
import { inkFor, parseConfig } from "./config";
import { STYLES } from "./styles";

const GUARD = "__askwellWidget";
const MIN_HEIGHT = 320;
const MAX_HEIGHT = 640;
const DEFAULT_HEIGHT = 560;
const HEIGHT_MARGIN = 104; // button + gaps, so the panel never leaves the viewport

/**
 * Start the widget for one <script data-key> tag. Resolves to the host element, or
 * null when nothing was rendered (no key, failed fetch, bad config). Never throws,
 * so the host page is never affected.
 */
export async function init(script: HTMLScriptElement): Promise<HTMLElement | null> {
  try {
    const key = script.dataset.key;
    const win = window as unknown as Record<string, unknown>;
    if (!key || win[GUARD]) return null;
    const appOrigin = new URL(script.src).origin;
    if (appOrigin === "null") return null;
    win[GUARD] = true;

    const response = await fetch(`${appOrigin}/api/widget/config?key=${encodeURIComponent(key)}`, {
      credentials: "omit",
    });
    if (!response.ok) return null;
    const config = parseConfig(await response.json());
    if (!config) return null;
    return render(appOrigin, key, config);
  } catch {
    return null;
  }
}

function render(appOrigin: string, key: string, config: NonNullable<ReturnType<typeof parseConfig>>): HTMLElement {
  const host = document.createElement("div");
  host.style.cssText = "all:initial";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLES;

  const root = document.createElement("div");
  root.dataset.pos = config.position;
  root.dataset.anim = config.animation;
  root.style.setProperty("--c", config.buttonColor);
  root.style.setProperty("--t", inkFor(config.buttonColor));
  root.style.setProperty("--h", `${DEFAULT_HEIGHT}px`);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  const label = document.createElement("span");
  label.textContent = config.label; // text, never HTML
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.hidden = true;
  badge.setAttribute("aria-hidden", "true");
  button.append(label, badge);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", config.headerText);

  root.append(button, panel);
  shadow.append(style, root);

  let iframe: HTMLIFrameElement | null = null;
  let open = false;
  let unread = 0;

  const showUnread = () => {
    badge.hidden = open || unread === 0;
    badge.textContent = unread > 99 ? "99+" : String(unread);
    button.setAttribute("aria-label", unread > 0 && !open ? `${config.label} (${unread} unread)` : config.label);
  };
  const tellPanel = () =>
    iframe?.contentWindow?.postMessage({ type: "askwell:visibility", open }, appOrigin);

  const onEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") setOpen(false);
  };
  function setOpen(next: boolean) {
    if (next === open) return;
    open = next;
    if (open) {
      unread = 0;
      if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.title = config.headerText;
        // The panel needs scripts and its own storage; nothing else (no popups, no top navigation).
        iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
        iframe.addEventListener("load", tellPanel);
        iframe.src = buildEmbedUrl(appOrigin, key, location.origin);
        panel.append(iframe);
      }
      window.addEventListener("keydown", onEscape);
    } else {
      window.removeEventListener("keydown", onEscape);
    }
    if (open) root.dataset.open = "";
    else delete root.dataset.open;
    button.setAttribute("aria-expanded", String(open));
    showUnread();
    tellPanel();
    if (open) iframe?.focus();
    else button.focus();
  }
  button.addEventListener("click", () => setOpen(!open));

  window.addEventListener("message", (event) => {
    // Only the panel's own window, from the app's origin.
    if (!iframe || event.origin !== appOrigin || event.source !== iframe.contentWindow) return;
    const message = parsePanelMessage(event.data);
    if (!message) return;
    if (message.type === "askwell:close") setOpen(false);
    else if (message.type === "askwell:unread") {
      unread = message.count;
      showUnread();
    } else {
      const max = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, window.innerHeight - HEIGHT_MARGIN));
      root.style.setProperty("--h", `${Math.round(Math.min(max, Math.max(MIN_HEIGHT, message.height)))}px`);
    }
  });

  document.body.append(host);
  return host;
}
