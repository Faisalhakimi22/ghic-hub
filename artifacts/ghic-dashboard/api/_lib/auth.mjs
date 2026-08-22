/**
 * Firebase ID token verification, without firebase-admin.
 *
 * Firebase ID tokens are ordinary RS256 JWTs signed by Google, so they can
 * be verified against Google's published public keys. That is what this
 * does, and it is a deliberate choice over the firebase-admin SDK:
 *
 *   firebase-admin needs a service-account private key. That credential
 *   bypasses every security rule and can mint tokens as any user, and one
 *   belonging to this project has already been exposed once. Verification
 *   does not require it — only signing does, and nothing here signs
 *   anything. So the most dangerous secret in the system never has to
 *   exist in this deployment at all.
 *
 * What is checked, per Firebase's documented requirements:
 *   - RS256 signature against Google's JWKS (rotated keys handled by the
 *     remote key set's own caching)
 *   - `aud` equals the Firebase project ID
 *   - `iss` equals https://securetoken.google.com/<project>
 *   - `exp` in the future, `iat` in the past (jose enforces both)
 *   - `sub` present and non-empty — this is the Firebase UID
 *
 * A token missing any of these is rejected. There is no development
 * bypass, no "trust this header" escape hatch, and no way to disable
 * verification with an environment variable: an auth check that can be
 * switched off is one that eventually is.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";

// Google's JWKS for Firebase ID tokens. createRemoteJWKSet caches and
// re-fetches on key rotation, so this is created once per cold start.
const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

function bearerFrom(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1] : "";
}

/**
 * Verify the request's ID token and return its claims.
 *
 * Throws AuthError(401) for anything unverifiable. Callers must let that
 * propagate rather than falling back to an anonymous identity.
 */
export async function verifyRequest(req) {
  if (!PROJECT_ID) {
    // Refusing is the safe failure. If misconfiguration silently allowed
    // requests through, the first deploy without this variable would be an
    // open API and nothing would say so.
    throw new AuthError(
      "FIREBASE_PROJECT_ID is not configured on this deployment; refusing to authenticate.",
      500,
    );
  }

  const token = bearerFrom(req);
  if (!token) throw new AuthError("Missing bearer token.");

  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
      algorithms: ["RS256"],
    }));
  } catch (e) {
    throw new AuthError(`Invalid token: ${e.code || e.message}`);
  }

  const uid = payload.sub;
  if (!uid) throw new AuthError("Token has no subject.");

  // firebase.identities carries the provider identifiers; GitHub sign-in
  // puts the numeric GitHub user id here. Absent for other providers, which
  // is why the column is nullable.
  const identities = payload.firebase?.identities || {};
  const githubId = Array.isArray(identities["github.com"])
    ? String(identities["github.com"][0])
    : null;

  return {
    uid,
    email: payload.email || null,
    name: payload.name || null,
    avatarUrl: payload.picture || null,
    githubId,
    emailVerified: Boolean(payload.email_verified),
  };
}

/** Roles, ordered least to most privileged. */
export const ROLES = ["viewer", "member", "admin", "owner"];

export function rankOf(role) {
  const i = ROLES.indexOf(String(role || "").toLowerCase());
  return i < 0 ? 0 : i;
}

/** Whether `role` meets or exceeds `required`. */
export function hasRole(role, required) {
  return rankOf(role) >= rankOf(required);
}

export function requireRole(user, required) {
  const role = user.workspaceRole || user.role;
  if (!hasRole(role, required)) {
    throw new AuthError(
      `This action requires the ${required} role; your role is ${role}.`,
      403,
    );
  }
}

/** Enforce the role hierarchy for workspace member administration. */
export function requireRoleChange(actor, target, nextRole) {
  if (!ROLES.includes(nextRole)) {
    throw new AuthError("Unknown role.", 400);
  }
  const actorRole = actor.workspaceRole || actor.role;
  const targetRole = target.workspaceRole || target.role;
  if (actorRole === "owner") return;
  if (actorRole !== "admin") {
    throw new AuthError("This action requires the admin or owner role.", 403);
  }
  if (
    targetRole === "owner" ||
    targetRole === "admin" ||
    nextRole === "owner" ||
    nextRole === "admin"
  ) {
    throw new AuthError("Admins may manage member and viewer roles only.", 403);
  }
}
