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
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
