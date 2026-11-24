import type { NextConfig } from "next";

// Clickjacking (project.md §9): only /embed may be framed by other sites.
const FRAME_ANYWHERE = "frame-ancestors *";
const FRAME_SELF = "frame-ancestors 'self'";

// Sent on every route: both rules below include them (project.md §9).
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  transpilePackages: ["@askwell/shared", "@askwell/db"],
  async headers() {
    return [
      {
        source: "/embed",
        headers: [{ key: "Content-Security-Policy", value: FRAME_ANYWHERE }, ...SECURITY_HEADERS],
      },
      {
        // Every route except /embed.
        source: "/:path((?!embed$).*)",
        headers: [{ key: "Content-Security-Policy", value: FRAME_SELF }, ...SECURITY_HEADERS],
      },
    ];
  },
};

export default config;
