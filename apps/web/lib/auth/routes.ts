// Route lists for the Clerk proxy. Pure functions so they are easy to test.

const PROTECTED_PAGE = [/^\/dashboard(\/.*)?$/];

const PROTECTED_API = [
  /^\/api\/projects(\/.*)?$/,
  /^\/api\/knowledge(\/.*)?$/,
  /^\/api\/conversations(\/.*)?$/,
];

const PUBLIC = [
  /^\/$/,
  /^\/sign-in(\/.*)?$/,
  /^\/sign-up(\/.*)?$/,
  /^\/embed(\/.*)?$/,
  /^\/api\/widget\/.*$/,
  /^\/api\/clerk\/webhook$/,
  /^\/api\/posthog-config$/,
];

const matches = (patterns: RegExp[], pathname: string) =>
  patterns.some((p) => p.test(pathname));

export const isProtectedPage = (pathname: string) => matches(PROTECTED_PAGE, pathname);
export const isProtectedApi = (pathname: string) => matches(PROTECTED_API, pathname);
export const isPublicRoute = (pathname: string) => matches(PUBLIC, pathname);
