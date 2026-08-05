import { OverdueScannerService } from './overdue-scanner.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

function makeHarness(overdueClashes: { id: string; assigneeId: string | null }[], notifiedToday: { clashId: string; userId: string }[]) {
  const findMany = jest
    .fn()
    .mockResolvedValueOnce(overdueClashes) // clash.findMany
    .mockResolvedValueOnce(notifiedToday); // notification.findMany

  const prisma = {
    clash: { findMany },
    notification: { findMany },
  } as unknown as PrismaService;

  const notifications = {
    enqueueOverdue: jest.fn(() => Promise.resolve()),
  } as unknown as NotificationsService;

  return { scanner: new OverdueScannerService(prisma, notifications), notifications, findMany };
}

describe('OverdueScannerService.scan', () => {
  it('enqueues one overdue notification per overdue+assigned clash', async () => {
    const { scanner, notifications } = makeHarness(
      [
        { id: 'clash-1', assigneeId: 'u-eng' },
        { id: 'clash-2', assigneeId: 'u-eng2' },
      ],
      [],
    );

    const count = await scanner.scan();

    expect(count).toBe(2);
    expect(notifications.enqueueOverdue).toHaveBeenCalledWith('clash-1', 'u-eng');
    expect(notifications.enqueueOverdue).toHaveBeenCalledWith('clash-2', 'u-eng2');
  });

  it('skips a clash+assignee pair already notified today', async () => {
    const { scanner, notifications } = makeHarness(
      [
        { id: 'clash-1', assigneeId: 'u-eng' },
        { id: 'clash-2', assigneeId: 'u-eng2' },
      ],
      [{ clashId: 'clash-1', userId: 'u-eng' }],
    );

    const count = await scanner.scan();

    expect(count).toBe(1);
    expect(notifications.enqueueOverdue).toHaveBeenCalledTimes(1);
    expect(notifications.enqueueOverdue).toHaveBeenCalledWith('clash-2', 'u-eng2');
  });

  it('short-circuits with zero when there are no overdue clashes', async () => {
    const { scanner, notifications, findMany } = makeHarness([], []);

    const count = await scanner.scan();

    expect(count).toBe(0);
    expect(notifications.enqueueOverdue).not.toHaveBeenCalled();
    // Only clash.findMany was called — no point querying past notifications.
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
