import * as Joi from 'joi';

/**
 * Values that ship in .env.example as obviously-fake placeholders. They are
 * long enough to pass a plain min-length check, so a deploy that copies the
 * example file without editing it would otherwise boot "successfully" on a
 * publicly-known secret — every secret field below explicitly rejects its
 * own placeholder value on top of the length check.
 */
const KNOWN_DEV_PLACEHOLDERS = [
  'dev-access-secret-ganti-di-produksi',
  'dev-refresh-secret-ganti-di-produksi',
  'dev-attachment-url-secret-ganti-di-produksi',
];

/**
 * Validated once at boot via ConfigModule.forRoot({ validationSchema }).
 * Without this, a missing/malformed env var (most importantly DATABASE_URL)
 * only surfaces as an opaque failure on the first request that touches it —
 * this makes a broken deploy fail fast with a readable message instead.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3001),

  // How many reverse-proxy hops in front of this process to trust for
  // X-Forwarded-For (see main.ts's `trust proxy`). 1 for a single proxy
  // (Caddy/nginx directly in front of the app); 2 once Cloudflare also sits
  // in front of that. Get this wrong and either every client behind the
  // real proxy shares one rate-limit bucket (too low), or a client can
  // spoof X-Forwarded-For to dodge per-IP throttling (too high).
  TRUSTED_PROXY_HOPS: Joi.number().integer().min(0).default(1),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  // Empty = no Redis auth, matching the dev stack's docker-compose (no
  // `--requirepass`). Production's docker-compose.prod.yml sets one.
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  JWT_ACCESS_SECRET: Joi.string().min(32).required().invalid(...KNOWN_DEV_PLACEHOLDERS),
  // Also rejected if identical to JWT_ACCESS_SECRET — sharing one secret
  // between the two token types would let an access token verify
  // successfully wherever a refresh token is expected, or vice versa.
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .required()
    .invalid(...KNOWN_DEV_PLACEHOLDERS)
    .invalid(Joi.ref('JWT_ACCESS_SECRET')),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),

  UPLOAD_DIR: Joi.string().default('./uploads'),
  // Where uploads (attachments, import files) land via multer's diskStorage
  // before StorageService moves them under UPLOAD_DIR — see storage.service.ts.
  UPLOAD_TMP_DIR: Joi.string().default('./uploads/tmp'),
  // No default: a signed attachment URL is only as strong as this secret
  // (see StorageService.signKey), so a deploy that forgets to set it must
  // fail to boot rather than silently sign every URL with a value anyone
  // can find in this repository's git history.
  ATTACHMENT_URL_SECRET: Joi.string().min(32).required().invalid(...KNOWN_DEV_PLACEHOLDERS),

  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().port().default(1025),
  SMTP_FROM: Joi.string().default('EPS Workspace <noreply@clashhub.dev>'),
  // A real SMTP provider requires auth — only MailHog's dev sandbox
  // (this default SMTP_HOST) doesn't, so these are required only when
  // NODE_ENV=production, and `npm run start:dev` keeps working with
  // neither var set.
  SMTP_USER: Joi.string().when('NODE_ENV', { is: 'production', then: Joi.required() }),
  SMTP_PASS: Joi.string().when('NODE_ENV', { is: 'production', then: Joi.required() }),
  SMTP_SECURE: Joi.boolean().default(false),

  WEB_BASE_URL: Joi.string().uri().default('http://localhost:3000'),

  // Optional: error tracking is a no-op when unset (see main.ts). Empty
  // string is treated the same as unset, not a validation failure.
  SENTRY_DSN: Joi.string().uri().allow('').optional(),

  // Kill switch untuk fitur Export Laporan Clash (GET /clashes/report).
  // Default true supaya deploy yang tidak menyetel apa pun tetap mendapat
  // fiturnya; setel false lalu restart API untuk mematikannya dalam hitungan
  // detik — tanpa rebuild frontend, tanpa menyentuh skema, tanpa kehilangan
  // data (kolom Attachment.role dan Clash.resolve* tetap utuh, hanya tidak
  // terpakai). Ini lapis rollback termurah untuk fitur tersebut.
  //
  // Didaftarkan di sini, bukan dibaca langsung lewat process.env seperti
  // RELEASE/ALLOW_PRODUCTION_SEED, supaya nilai salah ketik ("flase", "0 ")
  // menggagalkan boot dengan pesan jelas alih-alih diam-diam dianggap false
  // dan mematikan fitur tanpa ada yang sadar.
  CLASH_REPORT_ENABLED: Joi.boolean().default(true),
});
