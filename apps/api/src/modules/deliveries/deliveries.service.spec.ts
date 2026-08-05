import { BadRequestException, ConflictException } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';

describe('DeliveriesService', () => {
  const prisma = {
    volunteerProfile: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    shipperTaskOffer: { findUnique: jest.fn(), updateMany: jest.fn() },
    delivery: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    bulkRun: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const queue = { add: jest.fn() };
  const gateway = { emitToUser: jest.fn() };
  const notifications = { notify: jest.fn() };
  const trust = { applyDelta: jest.fn() };
  const storage = { saveImage: jest.fn() };
  let service: DeliveriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    service = new DeliveriesService(
      prisma as never,
      storage as never,
      queue as never,
      gateway as never,
      notifications as never,
      trust as never,
    );
  });

  it('rejects an expired offer before attempting assignment', async () => {
    prisma.volunteerProfile.findUnique.mockResolvedValue({ id: 'shipper-1' });
    prisma.shipperTaskOffer.findUnique.mockResolvedValue({
      id: 'offer-1',
      status: 'pending',
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(service.acceptOffer('delivery-1', 'shipper-user-1'))
      .rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a competing offer accept when delivery assignment loses its CAS', async () => {
    prisma.volunteerProfile.findUnique.mockResolvedValue({ id: 'shipper-1' });
    prisma.shipperTaskOffer.findUnique.mockResolvedValue({
      id: 'offer-1',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.delivery.findFirst.mockResolvedValue(null);
    prisma.bulkRun.findFirst.mockResolvedValue(null);
    prisma.volunteerProfile.updateMany.mockResolvedValue({ count: 1 });
    prisma.delivery.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));

    await expect(service.acceptOffer('delivery-1', 'shipper-user-1'))
      .rejects.toBeInstanceOf(ConflictException);

    expect(prisma.shipperTaskOffer.updateMany).not.toHaveBeenCalled();
    expect(prisma.volunteerProfile.update).not.toHaveBeenCalled();
  });

  it('rejects an accept when the shipper availability claim loses its CAS', async () => {
    prisma.volunteerProfile.findUnique.mockResolvedValue({ id: 'shipper-1' });
    prisma.shipperTaskOffer.findUnique.mockResolvedValue({
      id: 'offer-1',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.delivery.findFirst.mockResolvedValue(null);
    prisma.bulkRun.findFirst.mockResolvedValue(null);
    prisma.volunteerProfile.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));

    await expect(service.acceptOffer('delivery-1', 'shipper-user-1'))
      .rejects.toBeInstanceOf(ConflictException);

    expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
    expect(prisma.shipperTaskOffer.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a stale timeout job from expiring a newer offer', async () => {
    const newerExpiry = new Date(Date.now() + 60_000);
    prisma.shipperTaskOffer.findUnique.mockResolvedValue({
      id: 'offer-1',
      status: 'pending',
      expiresAt: newerExpiry,
    });

    await service.expireOfferAndOfferNext(
      'delivery-1',
      'shipper-1',
      new Date(Date.now() - 60_000).toISOString(),
    );

    expect(prisma.shipperTaskOffer.updateMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('requires campaign delivery proof before completing handoff', async () => {
    prisma.volunteerProfile.findUnique.mockResolvedValue({ id: 'shipper-1' });
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'delivery-1',
      shipperId: 'shipper-1',
      status: 'in_transit',
      reservation: null,
    });

    await expect(service.updateStatus('delivery-1', 'shipper-user-1', 'delivered'))
      .rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts campaign delivery proof without requiring reservation QR', async () => {
    prisma.volunteerProfile.findUnique.mockResolvedValue({ id: 'shipper-1' });
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'delivery-1',
      shipperId: 'shipper-1',
      status: 'in_transit',
      reservation: null,
    });
    prisma.delivery.update.mockResolvedValue({ id: 'delivery-1', status: 'delivered' });
    prisma.volunteerProfile.update.mockResolvedValue({});
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));

    await expect(
      service.updateStatus('delivery-1', 'shipper-user-1', 'delivered', 'https://proof.example/image.jpg'),
    ).resolves.toEqual({ id: 'delivery-1', status: 'delivered' });

    expect(prisma.delivery.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({ deliveryProofUrl: 'https://proof.example/image.jpg' }),
    }));
  });
});
