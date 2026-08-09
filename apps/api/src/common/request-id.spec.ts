import { resolveRequestId } from './request-id';

describe('resolveRequestId', () => {
  it('trusts a well-shaped inbound X-Request-Id', () => {
    expect(resolveRequestId('a-valid-trace-id-123')).toBe('a-valid-trace-id-123');
  });

  it('takes the first value when the header was sent multiple times', () => {
    expect(resolveRequestId(['first-id', 'second-id'])).toBe('first-id');
  });

  it('mints a fresh id when no header was sent', () => {
    const id = resolveRequestId(undefined);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  // These are the actual attack surface: a client-controlled header value
  // that would otherwise flow straight into structured logs.
  it.each([
    ['contains a newline', 'abc\ndef'],
    ['contains a space', 'abc def'],
    ['far exceeds a reasonable trace-id length', 'a'.repeat(200)],
    ['is an empty string', ''],
  ])('mints a fresh id instead of trusting a header that %s', (_label, malicious) => {
    const id = resolveRequestId(malicious);
    expect(id).not.toBe(malicious);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
