import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

/**
 * GET /api/auth/me — Return the currently authenticated user's profile.
 *
 * WHY we fetch from DB (not just return token data):
 *   The JWT token contains { sub, role, email } from the time of login.
 *   But the user's profile might have changed since then (e.g., an admin
 *   changed their role, or they updated their name). Fetching fresh from
 *   the DB ensures the frontend always shows the latest data.
 *
 * This route is PROTECTED by middleware — the middleware verifies the
 * JWT and injects x-user-id, x-user-role, x-user-email into headers.
 * If the user isn't logged in, they'll get a 401 from middleware before
 * this handler even runs.
 */
export async function GET(request) {
  const userId = request.headers.get("x-user-id");

  // This shouldn't happen if middleware is working, but just in case
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Not authenticated" },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const user = await User.findById(userId);

    if (!user) {
      // User was deleted after the token was issued
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("[auth/me] Error:", error.message);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
