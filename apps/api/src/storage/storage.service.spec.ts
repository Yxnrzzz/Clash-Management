import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

function makeService(secret = 'test-secret-at-least-16-chars') {
  const config = { get: jest.fn(() => secret) } as unknown as ConfigService;
  return new StorageService(config);
}

describe('StorageService signed URLs', () => {
  it('verifies a token it just signed', () => {
    const service = makeService();
    const { token, expiresAt } = service.signKey('attachment:a1');

    expect(service.verifySignedKey('attachment:a1', token, expiresAt)).toBe(true);
  });

  it('rejects a token once its expiry has passed', () => {
    const service = makeService();
    const { token } = service.signKey('attachment:a1', 1000);

    expect(service.verifySignedKey('attachment:a1', token, Date.now() - 1)).toBe(false);
  });

  it('rejects a token signed for a different key', () => {
    const service = makeService();
    const { token, expiresAt } = service.signKey('attachment:a1');

    expect(service.verifySignedKey('attachment:a2', token, expiresAt)).toBe(false);
  });

  it('rejects a token with one character flipped', () => {
    const service = makeService();
    const { token, expiresAt } = service.signKey('attachment:a1');
    const flippedLastChar = token.slice(0, -1) + (token.at(-1) === '0' ? '1' : '0');

    expect(service.verifySignedKey('attachment:a1', flippedLastChar, expiresAt)).toBe(false);
  });

  it('rejects a non-hex/garbage token instead of throwing', () => {
    const service = makeService();
    const { expiresAt } = service.signKey('attachment:a1');

    expect(() => service.verifySignedKey('attachment:a1', 'not-a-real-token', expiresAt)).not.toThrow();
    expect(service.verifySignedKey('attachment:a1', 'not-a-real-token', expiresAt)).toBe(false);
  });

  it('rejects a non-numeric/NaN expiresAt instead of treating it as valid', () => {
    const service = makeService();
    const { token } = service.signKey('attachment:a1');

    expect(service.verifySignedKey('attachment:a1', token, Number('not-a-number'))).toBe(false);
  });

  it('two different secrets never agree on the same token', () => {
    const serviceA = makeService('secret-a-at-least-16-chars');
    const serviceB = makeService('secret-b-at-least-16-chars');
    const { token, expiresAt } = serviceA.signKey('attachment:a1');

    expect(serviceB.verifySignedKey('attachment:a1', token, expiresAt)).toBe(false);
  });
});
