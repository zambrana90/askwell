// Route lists for the Clerk proxy. Pure functions so they are easy to test.

// Pages that need a signed-in user; signed-out visitors are redirected to sign-in.
const PROTECTED_PAGE = [/^\/dashboard(\/.*)?$/];

// API routes that need a signed-in owner; signed-out requests get a 401 JSON error.
const PROTECTED_API = [
  /^\/api\/projects(\/.*)?$/,
  /^\/api\/knowledge(\/.*)?$/,
  /^\/api\/conversations(\/.*)?$/,
];

// Routes anyone can reach, including the widget and webhooks.
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
