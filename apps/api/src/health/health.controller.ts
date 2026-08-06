import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';
import { NOTIFICATIONS_QUEUE } from '../notifications/notifications.types';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    // Any registered queue works here — this borrows the notifications
    // queue purely to reach BullMQ's underlying Redis client, not because
    // readiness cares about notifications specifically.
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  /** Liveness: is the process up and can it reach its database. Unchanged. */
  @Public()
  @Get()
  @HttpCode(200)
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
    };
  }

  /**
   * Readiness: liveness plus every dependency the app actually needs to
   * serve traffic correctly (Redis/BullMQ too — without it, notification
   * and import jobs silently stop processing even though DB-backed routes
   * keep responding 200, see ClashesService.publishNotifications()'s
   * fire-and-forget design). An orchestrator should hold traffic until this
   * returns 200, not just `/health`.
   */
  @Public()
  @Get('ready')
  @HttpCode(200)
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;

    // BullMQ's IRedisClient abstracts over adapters (ioredis, node-redis,
    // …) and guarantees `status` reflects connection state ('ready' means
    // connected and able to serve commands) — more portable than sending an
    // explicit PING through an adapter-specific client method.
    const redisClient = await this.queue.client.catch(() => null);
    if (redisClient?.status !== 'ready') {
      throw new ServiceUnavailableException('Redis tidak dapat dijangkau.');
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: 'connected',
    };
  }
}
