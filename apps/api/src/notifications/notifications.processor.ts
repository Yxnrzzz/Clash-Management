import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './whatsapp.service';
import { NOTIFICATIONS_QUEUE, type NotificationJobData, type NotificationJobType } from './notifications.types';

const SUBJECT_BY_TYPE: Record<NotificationJobType, string> = {
  ASSIGNED: 'Anda ditugaskan ke sebuah clash',
  STATUS_CHANGE: 'Status clash berubah',
  OVERDUE: 'Clash telah melewati due date',
};

const TYPE_MAP: Record<NotificationJobType, NotificationType> = {
  ASSIGNED: NotificationType.ASSIGNED,
  STATUS_CHANGE: NotificationType.STATUS_CHANGE,
  OVERDUE: NotificationType.OVERDUE,
};

/**
 * Consumes jobs enqueued by NotificationsService. Resolves the recipient's
 * channel preference (default: email on, WhatsApp off, matching the
 * frontend's own fallback in settings/notifications/page.tsx), sends on the
 * active channel(s), and always falls back to email if WhatsApp fails —
 * regardless of the email toggle, per the WhatsApp channel's spec.
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    config: ConfigService,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
  ) {
    super();
    this.webBaseUrl = config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const { userId, clashId, type, detail } = job.data;

    const [user, clash, preference] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.clash.findUnique({ where: { id: clashId } }),
      this.prisma.notificationPreference.findUnique({ where: { userId } }),
    ]);
    // Either was deleted between enqueue and processing — nothing to notify.
    if (!user || !clash) return;

    const notificationType = TYPE_MAP[type];
    const subject = `[${clash.uniqueCode}] ${SUBJECT_BY_TYPE[type]}`;
    const link = `${this.webBaseUrl}/clashes/${clash.id}`;
    const bodyLines = [clash.title, detail, `Lihat detail: ${link}`].filter(
      (line): line is string => Boolean(line),
    );

    let emailNeeded = preference?.emailEnabled ?? true;

    if (preference?.whatsappEnabled && preference.whatsappNumber) {
      try {
        await this.whatsapp.send(preference.whatsappNumber, `${subject}\n${bodyLines.join('\n')}`);
        await this.recordNotification(userId, clashId, NotificationChannel.WHATSAPP, notificationType, true);
      } catch (error) {
        this.logger.warn(
          `WhatsApp gagal untuk user ${userId}, fallback ke email: ${(error as Error).message}`,
        );
        await this.recordNotification(userId, clashId, NotificationChannel.WHATSAPP, notificationType, false);
        emailNeeded = true;
      }
    }

    if (emailNeeded) {
      await this.email.sendClashNotification(
        user.email,
        subject,
        bodyLines.map((line) => `<p>${line}</p>`).join('\n'),
      );
      await this.recordNotification(userId, clashId, NotificationChannel.EMAIL, notificationType, true);
    }
  }

  private recordNotification(
    userId: string,
    clashId: string,
    channel: NotificationChannel,
    type: NotificationType,
    isSent: boolean,
  ) {
    return this.prisma.notification.create({ data: { userId, clashId, channel, type, isSent } });
  }
}
