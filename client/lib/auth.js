import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

/**
 * Auth Utility — Central module for all authentication logic.
 *
 * WHY we use bcryptjs (not native bcrypt):
 *   Pure JavaScript implementation — no C++ compilation needed.
 *   Works everywhere: Windows, Linux, serverless, Docker.
 *
 * WHY we use jose (not jsonwebtoken):
 *   jose uses the Web Crypto API, so it works in Next.js Edge Runtime
 *   and Middleware. jsonwebtoken depends on Node.js 'crypto' module
 *   which is NOT available in Edge Runtime.
 */

// ─── Configuration ───────────────────────────────────────────────

/**
 * SALT_ROUNDS controls how many times bcrypt re-hashes the password.
 * Each round doubles the computation time:
 *   10 rounds ≈ ~100ms
 *   12 rounds ≈ ~250ms  ← our choice (good balance)
 *   14 rounds ≈ ~1000ms
 *
 * WHY 12? Slow enough that an attacker trying millions of passwords
 * will take years, but fast enough that a real user logging in
 * only waits ~250ms.
 */
const SALT_ROUNDS = 12;

/** Token expires after 7 days. Short enough to limit damage if stolen. */
const TOKEN_EXPIRY = "7d";

/** Cookie name for the JWT token */
export const COOKIE_NAME = "token";

/**
 * Get the JWT secret key as a Uint8Array (required by jose).
 * WHY TextEncoder? jose requires the key as raw bytes, not a string.
 */
function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "Please define JWT_SECRET in .env.local (run: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")"
    );
  }
  return new TextEncoder().encode(secret);
}

// ─── Password Functions ──────────────────────────────────────────

/**
 * Hash a plaintext password using bcrypt.
 *
 * WHY hashing (not encryption)?
 *   Hashing is ONE-WAY — you can never recover the original password.
 *   Even if the database is breached, attackers get useless hashes.
 *   Encryption is two-way (can be decrypted with a key), which is
 *   a liability if that key is also compromised.
 *
 * @param {string} plainPassword - The user's raw password
 * @returns {Promise<string>} The bcrypt hash (e.g., "$2a$12$...")
 */
export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 *
 * WHY constant-time comparison matters:
 *   bcrypt.compare internally uses a timing-safe algorithm.
 *   A naive string comparison (===) would return faster for
 *   wrong passwords, leaking information about how many characters
 *   were correct. Bcrypt prevents this "timing attack".
 *
 * @param {string} plainPassword - The password attempt
 * @param {string} hashedPassword - The stored bcrypt hash
 * @returns {Promise<boolean>} true if passwords match
 */
export async function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

// ─── JWT Functions ───────────────────────────────────────────────

/**
 * Create a signed JWT token.
 *
 * WHY JWT (not server-side sessions)?
 *   - STATELESS: No session store needed (saves MongoDB storage on free tier)
 *   - SCALABLE: Works across multiple serverless instances without shared state
 *   - SELF-CONTAINED: Token carries user identity (id, role, email),
 *     so protected routes don't need a DB lookup on every request
 *
 * The token payload contains:
 *   sub (subject) = user's MongoDB _id
 *   role          = user's RBAC role
 *   email         = user's email (for display)
 *
 * @param {{ sub: string, role: string, email: string }} payload
 * @returns {Promise<string>} Signed JWT string
 */
export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" }) // HMAC-SHA256 signature
    .setIssuedAt() // iat = current timestamp
    .setExpirationTime(TOKEN_EXPIRY) // exp = now + 7 days
    .sign(getSecretKey());
}

/**
 * Verify and decode a JWT token.
 *
 * WHY verification matters:
 *   Anyone can BASE64-decode a JWT and read its contents.
 *   But only the server (with JWT_SECRET) can VERIFY the signature.
 *   If someone tampers with the payload (e.g., changes role to "admin"),
 *   the signature won't match, and this function throws an error.
 *
 * @param {string} token - The JWT string from the cookie
 * @returns {Promise<{ sub: string, role: string, email: string }>} Decoded payload
 * @throws {Error} If token is expired, tampered, or invalid
 */
export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, getSecretKey());
  return payload;
}

// ─── Request Helpers ─────────────────────────────────────────────

/**
 * Extract the authenticated user from the request.
 *
 * This reads the user info that was injected by middleware
 * into custom request headers.
 *
 * WHY headers (not modifying the request object)?
 *   Next.js Edge Middleware cannot modify the request body or
 *   add properties to the request object. The standard pattern
 *   is to set custom headers (x-user-*) that route handlers read.
 *
 * @param {Request} request - The incoming request
 * @returns {{ userId: string, role: string, email: string } | null}
 */
export function getAuthUser(request) {
  const userId = request.headers.get("x-user-id");
  const role = request.headers.get("x-user-role");
  const email = request.headers.get("x-user-email");

  if (!userId) return null;

  return { userId, role, email };
}

/**
 * Build the Set-Cookie header value for the auth token.
 *
 * WHY each cookie attribute:
 *   HttpOnly  — JavaScript CANNOT read this cookie (prevents XSS token theft)
 *   Secure    — Cookie only sent over HTTPS (prevents network sniffing)
 *   SameSite=Lax — Cookie sent on same-site requests + top-level navigations
 *                   (prevents CSRF while allowing normal link navigation)
 *   Path=/    — Cookie available on all routes
 *   Max-Age   — Cookie expires after 7 days (matches JWT expiry)
 *
 * @param {string} token - The JWT to store
 * @returns {string} The formatted Set-Cookie header value
 */
export function buildCookieHeader(token) {
  const maxAge = 7 * 24 * 60 * 60; // 7 days in seconds
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/**
 * Build a Set-Cookie header that clears/expires the auth cookie.
 *
 * WHY Max-Age=0? It tells the browser to immediately delete the cookie.
 *
 * @returns {string} The formatted Set-Cookie header for logout
 */
export function buildLogoutCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
