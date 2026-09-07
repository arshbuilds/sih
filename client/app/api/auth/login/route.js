import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import {
  verifyPassword,
  signToken,
  buildCookieHeader,
} from "@/lib/auth";

/**
 * POST /api/auth/login — Authenticate a user and issue a JWT.
 *
 * Flow:
 *   1. Find user by email (with password hash explicitly selected)
 *   2. Compare plaintext password against bcrypt hash
 *   3. Sign a JWT containing { sub: userId, role, email }
 *   4. Set the JWT as an HTTP-only cookie
 *   5. Return user profile
 *
 * SECURITY NOTE — Generic error message:
 *   We return "Invalid email or password" for BOTH "email not found"
 *   and "wrong password". This prevents EMAIL ENUMERATION attacks
 *   where an attacker can discover which emails are registered
 *   by observing different error messages.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const { email, password } = body || {};

  if (!email || !password) {
    return NextResponse.json(
      { success: false, message: "Email and password are required" },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    // ── Find user WITH password hash ───────────────────────────
    // select('+password') overrides the select:false default.
    // Without this, user.password would be undefined.
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password"
    );

    if (!user) {
      // Generic message — don't reveal that the email doesn't exist
      return NextResponse.json(
        { success: false, message: "Invalid email or password" },
        { status: 401 }
      );
    }

    // ── Verify password ────────────────────────────────────────
    // bcrypt.compare is timing-safe — takes the same time whether
    // the password is completely wrong or off by one character.
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      return NextResponse.json(
        { success: false, message: "Invalid email or password" },
        { status: 401 }
      );
    }

    // ── Sign JWT ───────────────────────────────────────────────
    // The token contains just enough info for the middleware to
    // identify the user without hitting the database.
    const token = await signToken({
      sub: user._id.toString(),
      role: user.role,
      email: user.email,
    });

    // ── Build response with HTTP-only cookie ───────────────────
    const response = NextResponse.json(
      {
        success: true,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 200 }
    );

    // Set the cookie — HTTP-only so JavaScript can't steal it
    response.headers.set("Set-Cookie", buildCookieHeader(token));

    return response;
  } catch (error) {
    console.error("[auth/login] Error:", error.message);
    return NextResponse.json(
      { success: false, message: "Login failed" },
      { status: 500 }
    );
  }
}
