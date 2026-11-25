"use client";

import { useEffect } from "react";
import { WIDGET_SCRIPT_PATH } from "@askwell/shared/embed";

const HOST = "askwell-widget";
/** The name of widget.js's guard on `window` (apps/widget/src/widget.ts). Keep the two in step. */
const GUARD = "__askwellWidget";

// widget.js starts asynchronously (it fetches the config first), so a host can arrive after the
// landing page is gone, or twice after a quick return. This watches <body> for both cases.
let observer: MutationObserver | null = null;

function keepHosts(max: number) {
  document.querySelectorAll(HOST).forEach((host, index) => {
    if (index >= max) host.remove();
  });
}

function limitHosts(max: number) {
  observer?.disconnect();
  keepHosts(max);
  observer = new MutationObserver(() => keepHosts(max));
  observer.observe(document.body, { childList: true });
}

/** The widget script, added on every visit to the page and removed, with its widget, on leaving. */
export function LandingWidgetScript({ widgetKey }: { widgetKey: string }) {
  useEffect(() => {
    limitHosts(1);
    const script = document.createElement("script");
    script.src = WIDGET_SCRIPT_PATH;
    script.dataset.key = widgetKey;
    script.async = true;
    document.body.append(script);
    return () => {
      // A removed script can still run: without its key, widget.js does nothing.
      delete script.dataset.key;
      script.remove();
      limitHosts(0);
      // Clear widget.js's start-once guard, or the widget never comes back on the next visit.
      delete (window as unknown as Record<string, unknown>)[GUARD];
    };
  }, [widgetKey]);
  return null;
}
