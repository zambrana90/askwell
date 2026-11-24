"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isEmbedPath, wantsIdentity, wantsReplay } from "../../lib/analytics/paths";

type PosthogClient = typeof import("posthog-js").default;
type ClerkGlobal = {
  loaded?: boolean;
  user?: { id: string } | null;
  addListener: (cb: (resources: { user?: { id: string } | null }) => void) => () => void;
};

let loading: Promise<PosthogClient | null> | null = null;
let watchingClerk = false;

/** Loads posthog-js on first use, in its own chunk. Never called on /embed. */
function loadPosthog(): Promise<PosthogClient | null> {
  loading ??= import("posthog-js").then(({ default: posthog }) => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!key || !host) return null;
    posthog.init(key, {
      api_host: host,
      defaults: "2025-05-24", // pageviews on route changes
      capture_exceptions: true, // client exceptions and unhandled rejections
      person_profiles: "identified_only",
      disable_session_recording: true, // started per page below
      session_recording: { maskAllInputs: true },
    });
    return posthog;
  });
  return loading;
}

/** Identify by Clerk user id only (no email or name); reset on sign-out. */
function watchClerk(posthog: PosthogClient) {
  if (watchingClerk) return;
  watchingClerk = true;
  const apply = (id?: string | null) => {
    // Ask PostHog, not this page load: it restores the identity from earlier visits.
    const current = posthog.get_property("$user_state") === "identified" ? posthog.get_distinct_id() : null;
    if ((id ?? null) === current) return;
    if (current) posthog.reset(); // signed out, or a different user
    if (id) posthog.identify(id);
  };
  let tries = 0;
  const timer = setInterval(() => {
    const clerk = (window as unknown as { Clerk?: ClerkGlobal }).Clerk;
    if (clerk?.loaded) {
      clearInterval(timer);
      apply(clerk.user?.id);
      clerk.addListener(({ user }) => apply(user?.id));
    } else if (++tries > 40) {
      clearInterval(timer);
      watchingClerk = false;
    }
  }, 500);
}

/**
 * Starts PostHog on every page except /embed. On /embed it does nothing, so the posthog-js chunk
 * is never requested there (project.md §9: no tracking on customers' sites).
 */
export function PosthogGate() {
  const pathname = usePathname();

  useEffect(() => {
    if (isEmbedPath(pathname)) return;
    let cancelled = false;
    void loadPosthog()
      .then((posthog) => {
        if (!posthog || cancelled) return;
        if (wantsReplay(pathname)) posthog.startSessionRecording();
        else posthog.stopSessionRecording();
        if (wantsIdentity(pathname)) watchClerk(posthog);
      })
      .catch((err) => console.error("PostHog failed to load:", err instanceof Error ? err.message : err));
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
