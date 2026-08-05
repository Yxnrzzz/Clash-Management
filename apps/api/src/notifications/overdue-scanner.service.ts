import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class OverdueScannerService {
  private readonly logger = new Logger(OverdueScannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Daily at 07:00. Skips any clash+assignee pair already notified today. */
  @Cron('0 7 * * *')
  async scan(): Promise<number> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const overdue = await this.prisma.clash.findMany({
      where: {
        dueDate: { lt: now },
        assigneeId: { not: null },
        status: { isClosedState: false },
      },
      select: { id: true, assigneeId: true },
    });
    if (overdue.length === 0) return 0;

    const alreadyNotified = await this.prisma.notification.findMany({
      where: {
        type: NotificationType.OVERDUE,
        createdAt: { gte: startOfToday },
        clashId: { in: overdue.map((c) => c.id) },
      },
      select: { clashId: true, userId: true },
    });
    const notifiedKey = new Set(alreadyNotified.map((n) => `${n.clashId}:${n.userId}`));

    const pending = overdue.filter((c) => !notifiedKey.has(`${c.id}:${c.assigneeId}`));
    await Promise.all(pending.map((c) => this.notifications.enqueueOverdue(c.id, c.assigneeId!)));

    this.logger.log(
      `Overdue scan: ${pending.length} notifikasi baru dari ${overdue.length} clash overdue.`,
    );
    return pending.length;
  }
}
