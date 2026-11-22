import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@askwell/shared", "@askwell/db"],
};

export default config;
