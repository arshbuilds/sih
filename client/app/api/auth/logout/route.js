import { NextResponse } from "next/server";
import { buildLogoutCookieHeader } from "@/lib/auth";

/**
 * POST /api/auth/logout — Clear the auth cookie and end the session.
 *
 * WHY POST (not GET)?
 *   Logout is a state-changing action (it invalidates the session).
 *   GET requests should be "safe" (no side effects). Using POST
 *   prevents accidental logout from browser prefetching or crawlers.
 *
 * WHY we clear the cookie (not blacklist the token)?
 *   Token blacklisting requires maintaining a server-side list of
 *   revoked tokens — defeating the purpose of stateless JWTs and
 *   using MongoDB storage on the free tier. Clearing the cookie is
 *   sufficient because:
 *   - The browser deletes the cookie immediately (Max-Age=0)
 *   - The token expires naturally after 7 days
 *   - For the SIH demo, this is acceptable. In production, you'd
 *     add token blacklisting with Redis or short-lived tokens + refresh tokens.
 */
export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });

  // Clear the cookie by setting Max-Age=0
  response.headers.set("Set-Cookie", buildLogoutCookieHeader());

  return response;
}
