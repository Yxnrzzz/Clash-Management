import { envValidationSchema } from './env.validation';

/** Minimal env that satisfies every `.required()` field — each test
 * overrides only what it's exercising. */
function baseEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    ATTACHMENT_URL_SECRET: 'c'.repeat(32),
    ...overrides,
  };
}

describe('envValidationSchema', () => {
  it('passes for a minimal valid dev env (NODE_ENV defaulted, no SMTP auth)', () => {
    const { error } = envValidationSchema.validate(baseEnv());
    expect(error).toBeUndefined();
  });

  it('defaults TRUSTED_PROXY_HOPS to 1', () => {
    const { value, error } = envValidationSchema.validate(baseEnv());
    expect(error).toBeUndefined();
    expect((value as { TRUSTED_PROXY_HOPS: number }).TRUSTED_PROXY_HOPS).toBe(1);
  });

  it('does NOT require SMTP_USER/SMTP_PASS when NODE_ENV is unset (defaults to development)', () => {
    const { error } = envValidationSchema.validate(baseEnv());
    expect(error).toBeUndefined();
  });

  it('does NOT require SMTP_USER/SMTP_PASS when NODE_ENV is explicitly development', () => {
    const { error } = envValidationSchema.validate(baseEnv({ NODE_ENV: 'development' }));
    expect(error).toBeUndefined();
  });

  it('requires SMTP_USER and SMTP_PASS when NODE_ENV is production', () => {
    const { error } = envValidationSchema.validate(baseEnv({ NODE_ENV: 'production' }));
    expect(error?.message).toMatch(/SMTP_USER/);
  });

  it('passes in production once SMTP_USER and SMTP_PASS are both set', () => {
    const { error } = envValidationSchema.validate(
      baseEnv({ NODE_ENV: 'production', SMTP_USER: 'noreply@example.com', SMTP_PASS: 'a-real-password' }),
    );
    expect(error).toBeUndefined();
  });

  it('rejects a missing ATTACHMENT_URL_SECRET (no default — see StorageService.signKey)', () => {
    const env = baseEnv();
    delete env.ATTACHMENT_URL_SECRET;
    const { error } = envValidationSchema.validate(env);
    expect(error?.message).toMatch(/ATTACHMENT_URL_SECRET/);
  });

  it.each(['dev-access-secret-ganti-di-produksi', 'dev-refresh-secret-ganti-di-produksi', 'dev-attachment-url-secret-ganti-di-produksi'])(
    'rejects the known .env.example placeholder value %s for any secret field',
    (placeholder) => {
      const { error } = envValidationSchema.validate(baseEnv({ ATTACHMENT_URL_SECRET: placeholder }));
      expect(error).toBeDefined();
    },
  );

  it('rejects JWT_REFRESH_SECRET when it is identical to JWT_ACCESS_SECRET', () => {
    const shared = 'x'.repeat(32);
    const { error } = envValidationSchema.validate(
      baseEnv({ JWT_ACCESS_SECRET: shared, JWT_REFRESH_SECRET: shared }),
    );
    expect(error).toBeDefined();
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    const { error } = envValidationSchema.validate(baseEnv({ JWT_ACCESS_SECRET: 'too-short' }));
    expect(error).toBeDefined();
  });
});
