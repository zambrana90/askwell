import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import { PosthogGate } from "../components/analytics/posthog-gate";
import "./globals.css";

export const metadata: Metadata = { title: APP_NAME };

// No Clerk here: /embed runs in cross-site iframes and must not load it.
// Pages that need Clerk wrap themselves in AppClerkProvider (components/auth).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <PosthogGate />
        {children}
      </body>
    </html>
  );
}
