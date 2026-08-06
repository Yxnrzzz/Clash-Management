import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserThrottlerGuard } from './user-throttler.guard';

/** getTracker() is `protected` on the base ThrottlerGuard — this narrow
 * type exposes just enough to call it from a test without `as any`. */
interface TestableGuard {
  getTracker(req: Record<string, unknown>): Promise<string>;
}

async function makeGuard(): Promise<TestableGuard> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }])],
    providers: [UserThrottlerGuard],
  }).compile();
  return moduleRef.get(UserThrottlerGuard) as unknown as TestableGuard;
}

describe('UserThrottlerGuard.getTracker', () => {
  it('tracks by the authenticated user id when request.user is present', async () => {
    const guard = await makeGuard();

    const tracker = await guard.getTracker({ user: { id: 'u-1' }, ip: '203.0.113.5' });

    expect(tracker).toBe('u-1');
  });

  it('falls back to the request IP when there is no request.user (e.g. @Public() routes like /auth/login)', async () => {
    const guard = await makeGuard();

    const tracker = await guard.getTracker({ ip: '203.0.113.5' });

    expect(tracker).toBe('203.0.113.5');
  });

  it('falls back to IP when request.user exists but has no id', async () => {
    const guard = await makeGuard();

    const tracker = await guard.getTracker({ user: {}, ip: '203.0.113.5' });

    expect(tracker).toBe('203.0.113.5');
  });
});
