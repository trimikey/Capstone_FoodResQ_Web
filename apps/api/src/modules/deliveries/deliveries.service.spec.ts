import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  DeliveriesService,
  OFFER_EXPIRY_SECONDS,
  MAX_OFFERS_PER_DELIVERY,
  ASSIGNMENT_TIMEOUT_MS,
} from './deliveries.service';

describe('hằng số vòng đời mời shipper', () => {
  it('trần số lượt mời đủ lấp kín cửa sổ tìm kiếm', () => {
    // Mời tuần tự: mỗi lượt chiếm trọn OFFER_EXPIRY_SECONDS. Nếu quota lượt cạn
    // TRƯỚC khi hết ngân sách thời gian, đơn nằm im phần thời gian còn lại dù vẫn
    // còn shipper hợp lệ chưa được mời — đúng lỗi đã gặp: 5 lượt × 15s = 75s cạn
    // quota, đơn treo hơn 3 phút rồi failed trong khi có shipper ở 3km đang online.
    expect(MAX_OFFERS_PER_DELIVERY * OFFER_EXPIRY_SECONDS * 1000)
      .toBeGreaterThanOrEqual(ASSIGNMENT_TIMEOUT_MS);
  });
});

describe('DeliveriesService', () => {
  const prisma = {
    volunteerProfile: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    receiverProfile: { findUnique: jest.fn() },
    shipperTaskOffer: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    delivery: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    reservation: { update: jest.fn() },
    dedicationPointsHistory: { create: jest.fn() },
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
  // Các mốc phạt uy tín đọc từ system_configs — trả mặc định để test không phụ thuộc DB.
  const systemConfig = {
    getNumber: jest.fn(async (key: string) =>
      key === 'DELIVERY_LATE_PICKUP_THRESHOLD_MINUTES' ? 60 : 10,
    ),
  };
  let service: DeliveriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.shipperTaskOffer.findMany.mockResolvedValue([]);
    prisma.delivery.findMany.mockResolvedValue([]);
    prisma.volunteerProfile.findMany.mockResolvedValue([]);
    service = new DeliveriesService(
      prisma as never,
      storage as never,
      queue as never,
      gateway as never,
      notifications as never,
      trust as never,
      systemConfig as never,
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

  it('để trôi lời mời → tắt chế độ sẵn sàng của shipper', async () => {
    const expired = new Date(Date.now() - 1000);
    prisma.shipperTaskOffer.findUnique.mockResolvedValue({
      id: 'offer-1',
      status: 'pending',
      expiresAt: expired,
    });
    prisma.shipperTaskOffer.updateMany.mockResolvedValue({ count: 1 });
    prisma.volunteerProfile.updateMany.mockResolvedValue({ count: 1 });
    prisma.volunteerProfile.findMany.mockResolvedValue([
      { id: 'shipper-1', userId: 'shipper-user-1' },
    ]);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.shipperTaskOffer.findMany.mockResolvedValue([]);

    await service.expireOfferAndOfferNext('delivery-1', 'shipper-1', expired.toISOString());

    expect(prisma.volunteerProfile.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['shipper-1'] }, isAvailable: true },
      data: { isAvailable: false },
    });
    expect(gateway.emitToUser).toHaveBeenCalledWith(
      'shipper-user-1',
      'shipper:auto_offline',
      { reason: 'offer_lapsed' },
    );
  });

  it('từ chối tường minh KHÔNG bị tắt sẵn sàng', async () => {
    prisma.volunteerProfile.findUnique.mockResolvedValue({ id: 'shipper-1' });
    prisma.shipperTaskOffer.findUnique.mockResolvedValue({
      id: 'offer-1',
      status: 'pending',
      expiresAt: new Date(Date.now() + 15_000),
    });
    prisma.shipperTaskOffer.updateMany.mockResolvedValue({ count: 1 });
    prisma.shipperTaskOffer.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));

    await service.rejectOffer('delivery-1', 'shipper-user-1');

    expect(prisma.volunteerProfile.updateMany).not.toHaveBeenCalled();
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

  it('accepts receiver short QR code when completing a reservation delivery', async () => {
    prisma.volunteerProfile.findUnique.mockResolvedValue({ id: 'shipper-1', dedicationPoints: 10 });
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'delivery-1',
      shipperId: 'shipper-1',
      status: 'in_transit',
      reservationId: 'reservation-1',
      reservation: {
        id: 'reservation-1',
        qrToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa712b905e',
        receiver: { userId: 'receiver-user-1' },
      },
    });
    prisma.reservation.update.mockResolvedValue({ id: 'reservation-1', status: 'completed' });
    prisma.volunteerProfile.update.mockResolvedValue({});
    prisma.dedicationPointsHistory.create.mockResolvedValue({});
    prisma.delivery.update.mockResolvedValue({ id: 'delivery-1', status: 'delivered' });
    prisma.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === 'function') return input(prisma);
      return Promise.all(input as Promise<unknown>[]);
    });

    await expect(
      service.updateStatus('delivery-1', 'shipper-user-1', 'delivered', undefined, '712B905E'),
    ).resolves.toEqual({ id: 'delivery-1', status: 'delivered' });

    expect(prisma.reservation.update).toHaveBeenCalledWith({
      where: { id: 'reservation-1' },
      data: { status: 'completed' },
    });
  });

  it('nhận đơn lẻ thành công mà không đụng campaign_transports', async () => {
    // Hồi quy: syncCampaignTransport chạy vô điều kiện → đơn lẻ nổ 42703
    // `column "assigned_at" does not exist` ngay khi shipper bấm "Nhận đơn".
    prisma.volunteerProfile.findUnique.mockResolvedValue({ id: 'shipper-1' });
    prisma.shipperTaskOffer.findUnique.mockResolvedValue({
      id: 'offer-1',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.delivery.findFirst.mockResolvedValue(null);
    prisma.bulkRun.findFirst.mockResolvedValue(null);
    prisma.volunteerProfile.updateMany.mockResolvedValue({ count: 1 });
    prisma.delivery.updateMany.mockResolvedValue({ count: 1 });
    prisma.shipperTaskOffer.updateMany.mockResolvedValue({ count: 1 });
    prisma.delivery.findUnique.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([]); // đơn lẻ → không có campaign_transports
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));

    await service.acceptOffer('delivery-1', 'shipper-user-1');

    // Không có UPDATE campaign_transports nào được phát ra
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('không chạm campaign_transports khi broadcast đơn lẻ', async () => {
    // Hồi quy: UPDATE campaign_transports chạy vô điều kiện cho MỌI đơn → đơn lẻ
    // vẫn nổ 42703 khi DB thiếu cột lifecycle, làm job retry và mất socket emit.
    prisma.shipperTaskOffer.updateMany.mockResolvedValue({ count: 0 });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'shipper-1', user_id: 'shipper-user-1', distance_m: 900 }])
      .mockResolvedValueOnce([]); // đơn lẻ → không có dòng campaign_transports
    prisma.$executeRaw.mockResolvedValue(1);

    await service.broadcastToNearbyShippers('delivery-1', 106.6297, 10.8231);

    expect(gateway.emitToUser).toHaveBeenCalledWith('shipper-user-1', 'delivery:offer', {
      deliveryId: 'delivery-1',
    });
    // Chỉ INSERT lời mời — không có UPDATE campaign_transports nào
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('lỗi ghi mốc broadcast không làm job fail sau khi đã emit lời mời', async () => {
    // Hồi quy: throw ở bookkeeping → BullMQ retry, nhưng guard "đã có offer pending"
    // chặn lần mời lại nên shipper không bao giờ nhận thêm popup.
    prisma.shipperTaskOffer.updateMany.mockResolvedValue({ count: 0 });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'shipper-1', user_id: 'shipper-user-1', distance_m: 900 }])
      .mockResolvedValueOnce([{ id: 'transport-1' }]);
    prisma.$executeRaw
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('column "last_broadcast_at" does not exist'));

    await expect(service.broadcastToNearbyShippers('delivery-1', 106.6297, 10.8231))
      .resolves.toBeUndefined();

    expect(gateway.emitToUser).toHaveBeenCalledWith('shipper-user-1', 'delivery:offer', {
      deliveryId: 'delivery-1',
    });
  });

  it('cho người nhận huỷ tìm shipper khi receiver_id là profile id (không phải user id)', async () => {
    // Hồi quy: trước đây so sánh reservation.receiverId với userId → luôn 403.
    prisma.receiverProfile.findUnique.mockResolvedValue({ id: 'receiver-profile-1' });
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'delivery-1',
      status: 'pending_assignment',
      reservation: { id: 'res-1', receiverId: 'receiver-profile-1' },
    });
    prisma.$transaction.mockResolvedValue([]);

    await expect(service.cancelDeliverySearchByReceiver('delivery-1', 'receiver-user-1'))
      .resolves.toEqual(expect.objectContaining({ id: 'delivery-1', status: 'cancelled' }));

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('chặn người nhận khác huỷ tìm shipper của đơn không thuộc mình', async () => {
    prisma.receiverProfile.findUnique.mockResolvedValue({ id: 'receiver-profile-2' });
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'delivery-1',
      status: 'pending_assignment',
      reservation: { id: 'res-1', receiverId: 'receiver-profile-1' },
    });

    await expect(service.cancelDeliverySearchByReceiver('delivery-1', 'other-user'))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('giao hàng hoàn tất ngay cả khi QR gốc đã hết hạn — chỉ so khớp mã', async () => {
    // Hồi quy QR 30 phút cho pickup: đơn giao thường lâu hơn nhiều. Nếu ai đó
    // thêm check qrExpiresAt vào luồng delivered thì giao hàng đang đi sẽ
    // fail oan tại cửa người nhận dù đã quét đúng mã.
    prisma.volunteerProfile.findUnique.mockResolvedValue({ id: 'shipper-1', dedicationPoints: 10 });
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'delivery-1',
      shipperId: 'shipper-1',
      status: 'in_transit',
      reservationId: 'reservation-1',
      reservation: {
        id: 'reservation-1',
        qrToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa712b905e',
        qrExpiresAt: new Date(Date.now() - 60_000),
        receiver: { userId: 'receiver-user-1' },
      },
    });
    prisma.reservation.update.mockResolvedValue({ id: 'reservation-1', status: 'completed' });
    prisma.volunteerProfile.update.mockResolvedValue({});
    prisma.dedicationPointsHistory.create.mockResolvedValue({});
    prisma.delivery.update.mockResolvedValue({ id: 'delivery-1', status: 'delivered' });
    prisma.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === 'function') return (input as (tx: typeof prisma) => Promise<unknown>)(prisma);
      return Promise.all(input as Promise<unknown>[]);
    });

    await expect(
      service.updateStatus('delivery-1', 'shipper-user-1', 'delivered', undefined, '712b905e'),
    ).resolves.toEqual({ id: 'delivery-1', status: 'delivered' });

    expect(prisma.reservation.update).toHaveBeenCalled();
  });
});
