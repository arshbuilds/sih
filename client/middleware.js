import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Next.js Edge Middleware — Runs BEFORE every matched request.
 *
 * WHY middleware (not per-route auth checks)?
 *   - SINGLE POINT OF ENFORCEMENT: Every protected route is automatically
 *     secured. No risk of forgetting to add auth to a new endpoint.
 *   - RUNS AT EDGE: Executes before the route handler even starts,
 *     so unauthenticated requests never hit the database.
 *   - PERFORMANCE: Rejects unauthorized requests immediately at the
 *     network edge, saving compute and bandwidth.
 *
 * WHY we inject user data via headers (not request properties)?
 *   Next.js middleware returns a new Response or a modified NextRequest.
 *   You can't add arbitrary properties to the request object.
 *   The standard pattern is to set custom headers (x-user-*) that
 *   route handlers read via request.headers.get('x-user-id').
 *
 * IMPORTANT: This file MUST be in the project root (client/) or src/.
 * Next.js only recognizes middleware.js at the top level.
 */

// ─── Public Routes (no auth required) ────────────────────────────
const PUBLIC_ROUTES = [
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
];

/**
 * Check if a pathname matches any public route.
 * Uses startsWith to handle both exact matches and sub-paths.
 */
function isPublicRoute(pathname) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // ── Skip non-API routes (pages, static files, etc.) ──────────
  // Middleware only protects API routes; frontend pages handle
  // their own auth state (redirect to login if no user).
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // ── Allow public routes through ──────────────────────────────
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // ── Extract JWT from cookie ──────────────────────────────────
  const token = request.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: "Authentication required" },
      { status: 401 }
    );
  }

  // ── Verify JWT signature ─────────────────────────────────────
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    // ── Inject user info into request headers ────────────────
    // Route handlers read these headers to identify the user
    // without needing to re-verify the token.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.sub);
    requestHeaders.set("x-user-role", payload.role);
    requestHeaders.set("x-user-email", payload.email);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    // Token is expired, tampered with, or invalid
    console.warn(`[middleware] Invalid token: ${error.message}`);
    return NextResponse.json(
      { success: false, message: "Invalid or expired token" },
      { status: 401 }
    );
  }
}

/**
 * Matcher configuration — tells Next.js WHICH routes this middleware applies to.
 *
 * We match only /api/* routes. This means:
 *   ✅ /api/activities — protected
 *   ✅ /api/reports — protected
 *   ✅ /api/auth/login — matched but allowed through (public route check above)
 *   ❌ /dashboard — not matched (frontend handles its own auth)
 *   ❌ /_next/static — not matched (static files)
 */
export const config = {
  matcher: "/api/:path*",
};
