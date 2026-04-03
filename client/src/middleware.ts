import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Routes that anyone can access without authentication.
 */
const PUBLIC_ROUTES = ["/login", "/deck"];

/**
 * Next.js middleware — runs on the edge before every matched request.
 *
 * Privy sets `privy-token` (access JWT) and `privy-id-token` cookies when
 * a user is authenticated. We check for their presence to gate access:
 *
 *   • No token + protected route  → redirect to /login
 *   • Has token + /login          → redirect to /home
 *   • Otherwise                   → pass through
 *
 * This eliminates the flash of protected UI for unauthenticated users.
 * Full JWT verification and onboarding checks still happen client-side
 * via AuthGuard / useAuth.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  const token =
    request.cookies.get("privy-token")?.value ||
    request.cookies.get("privy-id-token")?.value;

  // Authenticated user hitting /login → send them to /home
  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/home", request.url));
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
  matcher: ["/((?!_next/static|_next/image|api|.*\\.png$|brand-kit).*)"],
};
