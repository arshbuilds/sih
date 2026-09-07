import mongoose from "mongoose";

/**
 * User Model — Stores authenticated user accounts.
 *
 * WHY each field matters:
 * - email (unique, lowercase): Login identifier. Lowercase prevents
 *   "User@email.com" and "user@email.com" from being treated as different accounts.
 * - password (select: false): The bcrypt hash is NEVER returned by default queries.
 *   You must explicitly call .select('+password') when verifying login.
 *   This is defense-in-depth: even if a developer forgets to filter,
 *   the hash never leaks in API responses.
 * - role: Enum for RBAC (Role-Based Access Control). Engineers submit reports,
 *   reviewers approve matches, admins manage everything.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // Never returned in queries by default
    },
    role: {
      type: String,
      enum: {
        values: ["engineer", "reviewer", "admin"],
        message: "Role must be engineer, reviewer, or admin",
      },
      default: "engineer",
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  }
);

// Hot-reload safe: reuse existing model if already compiled
const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
