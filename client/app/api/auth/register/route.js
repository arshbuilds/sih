import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { hashPassword } from "@/lib/auth";

/**
 * POST /api/auth/register — Create a new user account.
 *
 * Flow:
 *   1. Validate required fields (name, email, password)
 *   2. Check if email already exists → 409 Conflict
 *   3. Hash password with bcrypt (12 salt rounds)
 *   4. Create User document in MongoDB
 *   5. Return user profile (password hash excluded by select:false)
 *
 * WHY we don't auto-login on register:
 *   Separating register and login is cleaner for the frontend flow.
 *   After register, the user is redirected to login page.
 *   This also prevents accidental account creation from granting access.
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

  const { name, email, password, role } = body || {};

  // ── Validate required fields ───────────────────────────────
  if (!name || !email || !password) {
    return NextResponse.json(
      { success: false, message: "Name, email, and password are required" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { success: false, message: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  // Validate role if provided
  const validRoles = ["engineer", "reviewer", "admin"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json(
      {
        success: false,
        message: `Role must be one of: ${validRoles.join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    // ── Check for duplicate email ──────────────────────────────
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { success: false, message: "An account with this email already exists" },
        { status: 409 } // 409 Conflict
      );
    }

    // ── Hash password ──────────────────────────────────────────
    // This takes ~250ms (12 salt rounds) — deliberately slow to
    // make brute-force attacks impractical.
    const hashedPassword = await hashPassword(password);

    // ── Create user ────────────────────────────────────────────
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || "engineer", // Default to engineer if not specified
    });

    // Return user WITHOUT password (select:false handles this,
    // but we also manually exclude it for extra safety)
    return NextResponse.json(
      {
        success: true,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[auth/register] Error:", error.message);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
