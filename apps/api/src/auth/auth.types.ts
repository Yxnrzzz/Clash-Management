import { Role } from '@prisma/client';

/** Shape of the signed access-token payload. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/** What JwtStrategy attaches to `request.user`. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
