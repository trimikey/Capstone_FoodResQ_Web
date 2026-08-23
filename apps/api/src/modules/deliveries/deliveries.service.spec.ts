import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DeliveriesService, claimDeadline } from './deliveries.service';

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
      gateway as never,
      notifications as never,
      trust as never,
      systemConfig as never,
    );
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

  /**
   * Hạn nhận đơn được dùng chung ở bốn nơi (danh sách đơn gần, lúc bấm nhận, cron dọn
   * đơn, đồng hồ đếm ngược bên người nhận). Lệch công thức là sinh ra đơn hiện trên app
   * nhưng bấm vào báo hết hạn, hoặc hai bên nhìn hai con số khác nhau.
   */
  describe('claimDeadline', () => {
    const created = new Date('2026-08-23T08:00:00Z');

    it('đơn hẹn giờ: đóng nhận TRƯỚC giờ hẹn theo mốc cấu hình', () => {
      const scheduled = new Date('2026-08-23T10:40:00Z'); // 17:40 giờ VN
      expect(claimDeadline(created, scheduled, 30, 15).toISOString())
        .toBe('2026-08-23T10:25:00.000Z');
      expect(claimDeadline(created, scheduled, 30, 45).toISOString())
        .toBe('2026-08-23T09:55:00.000Z');
    });

    it('mốc cắt 0 (chế độ test): cho nhận tới tận phút hẹn', () => {
      const scheduled = new Date('2026-08-23T10:40:00Z');
      expect(claimDeadline(created, scheduled, 30, 0).getTime()).toBe(scheduled.getTime());
    });

    it('đơn giao ngay: đếm từ lúc tạo theo cửa sổ admin cấu hình', () => {
      expect(claimDeadline(created, null, 30, 15).toISOString()).toBe('2026-08-23T08:30:00.000Z');
      expect(claimDeadline(created, undefined, 45, 15).toISOString()).toBe('2026-08-23T08:45:00.000Z');
    });

    it('đơn hẹn giờ KHÔNG phụ thuộc cửa sổ đơn giao ngay', () => {
      const scheduled = new Date('2026-08-25T02:00:00Z');
      expect(claimDeadline(created, scheduled, 30, 15).getTime())
        .toBe(claimDeadline(created, scheduled, 120, 15).getTime());
    });
  });
});
