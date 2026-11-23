import type { NextConfig } from "next";

// Clickjacking (project.md §9): only /embed may be framed by other sites.
const FRAME_ANYWHERE = "frame-ancestors *";
const FRAME_SELF = "frame-ancestors 'self'";

const config: NextConfig = {
  transpilePackages: ["@askwell/shared", "@askwell/db"],
  async headers() {
    return [
      {
        source: "/embed",
        headers: [{ key: "Content-Security-Policy", value: FRAME_ANYWHERE }],
      },
      {
        // Every route except /embed.
        source: "/:path((?!embed$).*)",
        headers: [{ key: "Content-Security-Policy", value: FRAME_SELF }],
      },
    ];
  },
};

export default config;
