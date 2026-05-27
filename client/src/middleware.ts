import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Routes that anyone can access without authentication.
 */
const PUBLIC_ROUTES = ["/login", "/deck"];

/**
 * Next.js middleware — runs on the edge before every matched request.
 *
 * Privy sets `privy-token` / `privy-id-token` cookies when authenticated.
 * We also set `onboarding_complete=1` client-side once the user finishes
 * onboarding, so the middleware can route without a client-side round-trip.
 *
 *   • No token + protected route          → /login
 *   • Has token + /login or /             → /onboarding (if incomplete) or /home
 *   • Otherwise                           → pass through
 *
 * AuthGuard / useAuth still handle full JWT verification and act as a
 * safety net for cases where the cookie is absent (e.g. new device).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  const token =
    request.cookies.get("privy-token")?.value ||
    request.cookies.get("privy-id-token")?.value;

  const onboardingComplete =
    request.cookies.get("onboarding_complete")?.value === "1";

  // Authenticated user hitting /login or / → route based on onboarding status
  if (token && (pathname === "/login" || pathname === "/")) {
    const dest = onboardingComplete ? "/home" : "/onboarding";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Unauthenticated user hitting a protected route → send to /login
  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Match all routes except:
   *   • Next.js internals (_next/*)
   *   • Static files (images, fonts, favicon, etc.)
   *   • API routes (/api/*)
   */
  matcher: ["/((?!_next/static|_next/image|api|.*\\.png$|.*\\.svg$|.*\\.ico$|.*\\.webp$|.*\\.jpg$|.*\\.jpeg$|brand-kit|manifest\\.json|sw\\.js|workbox-.*\\.js|swe-worker-.*\\.js).*)"],
};
