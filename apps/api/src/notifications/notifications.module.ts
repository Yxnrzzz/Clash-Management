import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { NOTIFICATIONS_QUEUE } from './notifications.types';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { EmailService } from './email.service';
import { MockWhatsAppProvider, WHATSAPP_PROVIDER } from './whatsapp.service';
import { OverdueScannerService } from './overdue-scanner.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationPreferenceController } from './notification-preference.controller';

@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
  controllers: [NotificationPreferenceController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    EmailService,
    { provide: WHATSAPP_PROVIDER, useClass: MockWhatsAppProvider },
    OverdueScannerService,
    NotificationPreferenceService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
