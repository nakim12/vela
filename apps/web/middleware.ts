/**
 * Clerk route protection.
 *
 * Authentication model:
 *   - `/`                 — public landing page (demo video, CTA). No auth.
 *   - `/sign-in/*`        — public (Clerk hosts the flow here).
 *   - `/sign-up/*`        — public.
 *   - everything else     — protected. Redirects to /sign-in if no session.
 *
 * Page map comes from romus_project_plan.md §8. Add new public paths to
 * `isPublicRoute` below as they're built (e.g. /demo for the static demo
 * video pre-auth preview).
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip static assets + Next.js internals.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run on API routes.
    "/(api|trpc)(.*)",
  ],
};
