import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { MasterDataModule } from './master-data/master-data.module';
import { ClashesModule } from './clashes/clashes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ImportModule } from './import/import.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ProjectContextGuard } from './common/guards/project-context.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        // JSON in production (machine-readable, shippable to a log
        // aggregator); pretty-printed in dev so it's readable in a terminal.
        transport:
          process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        // Never let request/response logs leak the refresh cookie or the
        // Authorization bearer token.
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      },
    }),
    ScheduleModule.forRoot(),
    // Global default, per IP. 100/min turned out to be too tight for real
    // usage — a k6 run against the Register with just 10 virtual users
    // tripped it within seconds (measured Sprint 11, see HANDOFF.md §12),
    // and legitimate concurrent use (several engineers filtering/paginating
    // at once, possibly behind the same office NAT) looks the same on the
    // wire as a burst. 600/min (10 req/s) still meaningfully bounds
    // scripted abuse without being indistinguishable from normal load.
    // Routes that need a stricter ceiling (e.g. /auth/login) override it
    // with @Throttle() — see auth.controller.ts.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: config.get<number>('REDIS_PORT') ?? 6379,
        },
      }),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    MasterDataModule,
    ClashesModule,
    NotificationsModule,
    ImportModule,
  ],
  providers: [
    // Order matters: JwtAuthGuard must populate request.user before RolesGuard
    // reads the role off it, and ProjectContextGuard needs the role to decide
    // whether membership is required. ThrottlerGuard runs first since it
    // doesn't depend on any of them.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ProjectContextGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
