import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import type { Response } from 'express';

/**
 * Last line of defense: anything that reaches here means a route/service
 * didn't already turn a failure into an intentional HttpException. Without
 * this, an unhandled Prisma error (or any other thrown value) would surface
 * to the client as Express's default 500 handler — which in dev mode
 * includes the raw error message/stack. This maps known Prisma error codes
 * to sensible HTTP statuses and otherwise returns a generic message,
 * logging the real detail server-side either way.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        `Unhandled exception: ${this.describe(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      // No-op when SENTRY_DSN isn't set (Sentry.init() was never called in
      // main.ts) — safe to call unconditionally.
      Sentry.captureException(exception);
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): { status: number; body: Record<string, unknown> } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const body = typeof response === 'string' ? { message: response } : response;
      return { status, body: body as Record<string, unknown> };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { statusCode: 500, message: 'Terjadi kesalahan pada server.' },
    };
  }

  private resolvePrismaError(error: Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          body: { statusCode: 409, message: 'Data sudah ada (duplikat).' },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: { statusCode: 404, message: 'Data tidak ditemukan.' },
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          body: { statusCode: 400, message: 'Referensi data tidak valid.' },
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: { statusCode: 500, message: 'Terjadi kesalahan pada server.' },
        };
    }
  }

  private describe(exception: unknown): string {
    if (exception instanceof Error) return exception.message;
    return JSON.stringify(exception);
  }
}
