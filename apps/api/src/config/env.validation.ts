import * as Joi from 'joi';

/**
 * Validated once at boot via ConfigModule.forRoot({ validationSchema }).
 * Without this, a missing/malformed env var (most importantly DATABASE_URL)
 * only surfaces as an opaque failure on the first request that touches it —
 * this makes a broken deploy fail fast with a readable message instead.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3001),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),

  UPLOAD_DIR: Joi.string().default('./uploads'),

  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().port().default(1025),
  SMTP_FROM: Joi.string().default('ClashHub <noreply@clashhub.dev>'),

  WEB_BASE_URL: Joi.string().uri().default('http://localhost:3000'),

  // Optional: error tracking is a no-op when unset (see main.ts). Empty
  // string is treated the same as unset, not a validation failure.
  SENTRY_DSN: Joi.string().uri().allow('').optional(),
});
