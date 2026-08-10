import { NotificationChannel, NotificationType } from '@prisma/client';
import type { Job } from 'bullmq';
import { NotificationsProcessor } from './notifications.processor';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import type { WhatsAppProvider } from './whatsapp.service';
import type { NotificationJobData } from './notifications.types';

const USER = { id: 'u-eng', email: 'engineer@clashhub.dev', name: 'Dimas Prasetyo' };
const CLASH = { id: 'clash-1', uniqueCode: 'MCA-ARS-0001', title: 'Bentrok pipa' };

function makeJob(overrides: Partial<NotificationJobData> = {}): Job<NotificationJobData> {
  return {
    data: { userId: USER.id, clashId: CLASH.id, type: 'STATUS_CHANGE', ...overrides },
  } as unknown as Job<NotificationJobData>;
}

function makeHarness(preference: Record<string, unknown> | null) {
  const notificationCreate = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'notif-1', ...args.data }),
  );
  const prisma = {
    user: { findUnique: jest.fn(() => Promise.resolve(USER)) },
    clash: { findUnique: jest.fn(() => Promise.resolve(CLASH)) },
    notificationPreference: { findUnique: jest.fn(() => Promise.resolve(preference)) },
    notification: { create: notificationCreate },
  } as unknown as PrismaService;

  const email = { sendClashNotification: jest.fn(() => Promise.resolve()) } as unknown as EmailService;
  const whatsapp = { send: jest.fn(() => Promise.resolve()) } as unknown as WhatsAppProvider;
  const config = { get: jest.fn(() => undefined) };

  const processor = new NotificationsProcessor(
    prisma,
    email,
    config as never,
    whatsapp,
  );

  return { processor, prisma, email, whatsapp, notificationCreate };
}

describe('NotificationsProcessor', () => {
  it('defaults to email when no preference row exists', async () => {
    const { processor, email, whatsapp, notificationCreate } = makeHarness(null);

    await processor.process(makeJob());

    expect(whatsapp.send).not.toHaveBeenCalled();
    expect(email.sendClashNotification).toHaveBeenCalledWith(
      USER.email,
      expect.stringContaining(CLASH.uniqueCode),
      expect.any(String),
    );
    expect(notificationCreate).toHaveBeenCalledWith({
      data: { userId: USER.id, clashId: CLASH.id, channel: NotificationChannel.EMAIL, type: NotificationType.STATUS_CHANGE, isSent: true },
    });
  });

  it('sends only WhatsApp when only WhatsApp is enabled and it succeeds', async () => {
    const { processor, email, whatsapp, notificationCreate } = makeHarness({
      emailEnabled: false,
      whatsappEnabled: true,
      whatsappNumber: '+6281234567890',
    });

    await processor.process(makeJob({ type: 'ASSIGNED' }));

    expect(whatsapp.send).toHaveBeenCalledWith('+6281234567890', expect.any(String));
    expect(email.sendClashNotification).not.toHaveBeenCalled();
    expect(notificationCreate).toHaveBeenCalledTimes(1);
    expect(notificationCreate).toHaveBeenCalledWith({
      data: { userId: USER.id, clashId: CLASH.id, channel: NotificationChannel.WHATSAPP, type: NotificationType.ASSIGNED, isSent: true },
    });
  });

  it('falls back to email when WhatsApp fails, even with email disabled', async () => {
    const { processor, email, whatsapp, notificationCreate } = makeHarness({
      emailEnabled: false,
      whatsappEnabled: true,
      whatsappNumber: '+6281234567890',
    });
    (whatsapp.send as jest.Mock).mockRejectedValue(new Error('provider down'));

    await processor.process(makeJob({ type: 'OVERDUE' }));

    expect(whatsapp.send).toHaveBeenCalled();
    expect(email.sendClashNotification).toHaveBeenCalledWith(
      USER.email,
      expect.any(String),
      expect.any(String),
    );
    expect(notificationCreate).toHaveBeenCalledTimes(2);
    expect(notificationCreate).toHaveBeenCalledWith({
      data: { userId: USER.id, clashId: CLASH.id, channel: NotificationChannel.WHATSAPP, type: NotificationType.OVERDUE, isSent: false },
    });
    expect(notificationCreate).toHaveBeenCalledWith({
      data: { userId: USER.id, clashId: CLASH.id, channel: NotificationChannel.EMAIL, type: NotificationType.OVERDUE, isSent: true },
    });
  });

  it('does nothing when the user or clash no longer exists', async () => {
    const { processor, prisma, email, whatsapp } = makeHarness(null);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await processor.process(makeJob());

    expect(email.sendClashNotification).not.toHaveBeenCalled();
    expect(whatsapp.send).not.toHaveBeenCalled();
  });

  it('does nothing when the clash was soft-deleted after this job was enqueued', async () => {
    const { processor, prisma, email, whatsapp } = makeHarness(null);
    (prisma.clash.findUnique as jest.Mock).mockResolvedValue({
      ...CLASH,
      deletedAt: new Date('2026-08-01'),
    });

    await processor.process(makeJob());

    expect(email.sendClashNotification).not.toHaveBeenCalled();
    expect(whatsapp.send).not.toHaveBeenCalled();
  });
});
