import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferenceDto } from './dto/notification-preference.dto';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/** Mirrors settings/notifications/page.tsx's own default when no row exists yet. */
const DEFAULTS = { emailEnabled: true, whatsappEnabled: false, whatsappNumber: '' };

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string) {
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return pref ?? { id: '', userId, ...DEFAULTS };
  }

  async update(userId: string, dto: UpdateNotificationPreferenceDto) {
    const existing = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    const merged = { ...DEFAULTS, ...existing, ...dto };

    if (merged.whatsappEnabled && !E164_REGEX.test(merged.whatsappNumber)) {
      throw new BadRequestException('Nomor WhatsApp harus format E.164, mis. +6281234567890');
    }

    const data = {
      emailEnabled: merged.emailEnabled,
      whatsappEnabled: merged.whatsappEnabled,
      whatsappNumber: merged.whatsappNumber,
    };
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
