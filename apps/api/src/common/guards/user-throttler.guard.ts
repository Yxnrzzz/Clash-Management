import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Tracks the global rate limit per authenticated user (JWT `sub`) instead of
 * per IP — the documented gap from Sprint 11 (see HANDOFF.md §12): an office
 * NAT with several engineers behind it shares one IP-based quota today, so
 * one busy user can throttle everyone else on the same connection. Requests
 * with no `request.user` (i.e. @Public() routes, most importantly
 * /auth/login) fall back to IP, which is exactly what brute-force
 * protection on login needs — a per-user tracker there would let an
 * attacker sidestep the limit just by trying a different (unauthenticated)
 * account each time.
 *
 * Must be registered after JwtAuthGuard in app.module.ts's APP_GUARD list —
 * request.user has to already be populated by the time getTracker() runs.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  // Not `async` — nothing here awaits, and the base class's return type
  // (Promise<string>) is satisfied just as well by Promise.resolve().
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { id?: string } | undefined;
    return Promise.resolve(user?.id ?? (req.ip as string));
  }
}
