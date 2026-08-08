import { Role } from '@prisma/client';

/** Shape of the signed access-token payload. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/**
 * Shape of the signed refresh-token payload — see User.refreshTokenVersion.
 * `jti` exists purely to guarantee two tokens are never byte-identical: JWT
 * `iat` has one-second resolution, so signing the same {sub, ver} twice
 * within the same second (e.g. rotating a token right after it was issued)
 * would otherwise produce the exact same JWT string twice — which collides
 * with RefreshSession.tokenHash's unique constraint. Not used for anything
 * else; nothing verifies or reads it back.
 */
export interface RefreshPayload {
  sub: string;
  ver: number;
  jti: string;
}

/** What JwtStrategy attaches to `request.user`. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
