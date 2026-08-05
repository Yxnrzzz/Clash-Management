import { NestFactory } from '@nestjs/core';
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
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

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
