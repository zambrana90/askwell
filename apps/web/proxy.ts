// Clerk proxy: protects the dashboard and owner API routes (see lib/auth/routes.ts).
import { clerkMiddleware } from "@clerk/nextjs/server";
import { isProtectedApi, isProtectedPage } from "./lib/auth/routes";
import { unauthorizedResponse } from "./lib/auth/unauthorized";

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;
  if (isProtectedApi(pathname)) {
    const { userId } = await auth();
    if (!userId) return unauthorizedResponse();
    return;
  }
  if (isProtectedPage(pathname)) {
    await auth.protect();
  }
}, { signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: [
    // `embed$`: /embed skips Clerk. It is a public page loaded in a cross-site iframe, where
    // Clerk's cookies are not sent, so the dev-browser handshake redirects forever.
    "/((?!_next|embed$|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
