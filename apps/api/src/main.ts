import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
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
