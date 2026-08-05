import { BadRequestException } from '@nestjs/common';
import { NotificationPreferenceService } from './notification-preference.service';
import { PrismaService } from '../prisma/prisma.service';

function makeHarness(existing: Record<string, unknown> | null) {
  const upsert = jest.fn(({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) =>
    Promise.resolve({ id: 'pref-1', ...(existing ? update : create) }),
  );
  const prisma = {
    notificationPreference: {
      findUnique: jest.fn(() => Promise.resolve(existing)),
      upsert,
    },
  } as unknown as PrismaService;

  return { service: new NotificationPreferenceService(prisma), upsert };
}

describe('NotificationPreferenceService.getForUser', () => {
  it('returns defaults when no row exists yet', async () => {
    const { service } = makeHarness(null);

    const pref = await service.getForUser('u-eng');

    expect(pref).toMatchObject({ emailEnabled: true, whatsappEnabled: false, whatsappNumber: '' });
  });

  it('returns the stored row when one exists', async () => {
    const { service } = makeHarness({
      id: 'pref-1',
      userId: 'u-eng',
      emailEnabled: false,
      whatsappEnabled: true,
      whatsappNumber: '+6281234567890',
    });

    const pref = await service.getForUser('u-eng');

    expect(pref).toMatchObject({ emailEnabled: false, whatsappEnabled: true, whatsappNumber: '+6281234567890' });
  });
});

describe('NotificationPreferenceService.update', () => {
  it('upserts a partial patch merged over defaults', async () => {
    const { service, upsert } = makeHarness(null);

    await service.update('u-eng', { emailEnabled: false });

    expect(upsert).toHaveBeenCalledWith({
      where: { userId: 'u-eng' },
      create: { userId: 'u-eng', emailEnabled: false, whatsappEnabled: false, whatsappNumber: '' },
      update: { emailEnabled: false, whatsappEnabled: false, whatsappNumber: '' },
    });
  });

  it('rejects enabling WhatsApp with a malformed number', async () => {
    const { service } = makeHarness(null);

    await expect(
      service.update('u-eng', { whatsappEnabled: true, whatsappNumber: '0812345' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts enabling WhatsApp with a valid E.164 number', async () => {
    const { service, upsert } = makeHarness(null);

    await service.update('u-eng', { whatsappEnabled: true, whatsappNumber: '+6281234567890' });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ whatsappEnabled: true, whatsappNumber: '+6281234567890' }),
      }),
    );
  });

  it('keeps an existing valid number when only toggling an unrelated field', async () => {
    const { service, upsert } = makeHarness({
      userId: 'u-eng',
      emailEnabled: true,
      whatsappEnabled: true,
      whatsappNumber: '+6281234567890',
    });

    await service.update('u-eng', { emailEnabled: false });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { emailEnabled: false, whatsappEnabled: true, whatsappNumber: '+6281234567890' },
      }),
    );
  });
});
