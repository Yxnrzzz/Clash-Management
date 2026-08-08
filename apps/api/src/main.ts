import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

// A no-op unless SENTRY_DSN is set — no account/DSN needed to run this app,
// but it's ready to report to Sentry the moment a production deploy
// provides one. AllExceptionsFilter calls Sentry.captureException() for
// unhandled 500s; that call is itself a safe no-op when init() was never
// called (documented Sentry SDK behavior), so nothing there needs to branch
// on whether a DSN is configured.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}

async function bootstrap() {
  // bodyParser: false so the json/urlencoded limit below is explicit and
  // deliberately chosen rather than whatever body-parser's own default
  // happens to be (100kb, same value — this changes nothing about current
  // behavior, just makes the ceiling something this file states on purpose
  // rather than one nobody chose). Doesn't affect file uploads: multer
  // parses multipart/form-data itself, per-route via FilesInterceptor/
  // FileInterceptor, entirely separate from this global JSON/urlencoded
  // parser.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: true });
  app.useLogger(app.get(Logger));

  // Every per-IP mechanism downstream (UserThrottlerGuard's fallback for
  // @Public() routes, most importantly the login brute-force limiter) reads
  // `req.ip`, which Express only derives from X-Forwarded-For when told to
  // trust it — otherwise every request behind a reverse proxy shows the
  // proxy's own IP, collapsing every client into one shared rate-limit
  // bucket. The hop count must match the real proxy chain (see
  // TRUSTED_PROXY_HOPS's comment in env.validation.ts): too low and clients
  // behind the real proxy share a bucket; too high and a client can spoof
  // X-Forwarded-For to dodge the limit entirely.
  const config = app.get(ConfigService);
  app.set('trust proxy', config.get<number>('TRUSTED_PROXY_HOPS'));

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // No CORS on purpose: the Next.js dev server proxies /api/* here via
  // `rewrites`, so the browser always sees a same-origin request and the
  // httpOnly refresh cookie stays first-party.
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap application', error);
  process.exit(1);
});
