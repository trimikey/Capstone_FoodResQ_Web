import { BadRequestException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';

/**
 * Đánh giá sau đơn: một đơn có thể có HAI đánh giá — cửa hàng và tình nguyện viên
 * đã giao — phân biệt bằng rateeId. Chấm nhầm bên nào thì avgRating của bên kia sai.
 */
describe('ReservationsService.rateReservation', () => {
  const prisma = {
    receiverProfile: { findUnique: jest.fn() },
    reservation: { findFirst: jest.fn() },
    rating: { upsert: jest.fn(), aggregate: jest.fn() },
    providerProfile: { update: jest.fn() },
    volunteerProfile: { update: jest.fn() },
  };
  let service: ReservationsService;

  const baseReservation = {
    id: 'res-1',
    status: 'completed',
    listing: { provider: { id: 'provider-1', userId: 'provider-user-1' } },
    delivery: { shipperId: 'shipper-1', shipper: { userId: 'shipper-user-1' } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.receiverProfile.findUnique.mockResolvedValue({ id: 'receiver-1' });
    prisma.reservation.findFirst.mockResolvedValue(baseReservation);
    prisma.rating.upsert.mockResolvedValue({ id: 'rating-1', score: 5 });
    prisma.rating.aggregate.mockResolvedValue({ _avg: { score: 4.5 } });
    service = new ReservationsService(
      prisma as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
      { notify: jest.fn() } as never,
      { applyDelta: jest.fn() } as never,
      { add: jest.fn() } as never,
    );
  });

  it('mặc định chấm cửa hàng, cập nhật avgRating của provider', async () => {
    await service.rateReservation('res-1', 'user-1', 5);

    expect(prisma.rating.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ rateeId: 'provider-user-1' }),
      }),
    );
    expect(prisma.providerProfile.update).toHaveBeenCalledWith({
      where: { id: 'provider-1' },
      data: { avgRating: 4.5 },
    });
    expect(prisma.volunteerProfile.update).not.toHaveBeenCalled();
  });

  it('chấm shipper thì cập nhật avgRating của volunteer, KHÔNG đụng provider', async () => {
    await service.rateReservation('res-1', 'user-1', 4, undefined, 'shipper');

    expect(prisma.rating.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ rateeId: 'shipper-user-1' }),
      }),
    );
    expect(prisma.volunteerProfile.update).toHaveBeenCalledWith({
      where: { id: 'shipper-1' },
      data: { avgRating: 4.5 },
    });
    expect(prisma.providerProfile.update).not.toHaveBeenCalled();
  });

  it('chặn chấm shipper khi đơn tự đến lấy (không có người giao)', async () => {
    prisma.reservation.findFirst.mockResolvedValue({ ...baseReservation, delivery: null });

    await expect(service.rateReservation('res-1', 'user-1', 5, undefined, 'shipper'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rating.upsert).not.toHaveBeenCalled();
  });

  it('chặn đánh giá đơn chưa hoàn tất', async () => {
    prisma.reservation.findFirst.mockResolvedValue({ ...baseReservation, status: 'confirmed' });

    await expect(service.rateReservation('res-1', 'user-1', 5))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rating.upsert).not.toHaveBeenCalled();
  });
});

/**
 * Trọng tâm: cron dọn đơn quá hạn. Đơn 'confirmed' quá hạn QR PHẢI được đóng dù
 * delivery đang ở trạng thái nào — nếu không, suất ăn bị giữ vĩnh viễn và người
 * khác không đặt được.
 */
/**
 * Reservation của GIAO SỈ là bản ghi sổ cho một điểm phát trên tuyến, người nhận là
 * tài khoản hệ thống. Nó không được lẫn vào luồng đơn hàng bình thường của NCC.
 */
describe('ReservationsService — tách đơn giao sỉ khỏi luồng NCC', () => {
  const prisma = {
    providerProfile: { findUnique: jest.fn() },
    receiverProfile: { findUnique: jest.fn() },
    reservation: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: ReservationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReservationsService(
      prisma as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
      { notify: jest.fn() } as never,
      { applyDelta: jest.fn() } as never,
      { add: jest.fn() } as never,
    );
  });

  it('danh sách đơn của NCC loại bỏ reservation của giao sỉ', async () => {
    prisma.providerProfile.findUnique.mockResolvedValue({ id: 'provider-1' });
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findProviderReservations('provider-user-1');

    const where = prisma.reservation.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ listing: { providerId: 'provider-1' }, bulkRunStopId: null });
  });

  it('chặn NCC quét nhầm QR của điểm phát giao sỉ', async () => {
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'res-bulk',
      status: 'confirmed',
      bulkRunStopId: 'stop-1',
      qrExpiresAt: new Date(Date.now() + 60_000),
      listing: { providerId: 'provider-1' },
      receiver: {},
    });

    await expect(service.scanQr('bulk-token', 'provider-user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

/**
 * Khung giờ MỞ CỬA trong ngày (vd 07:00–21:00) tách biệt với mốc bắt đầu/hạn lấy.
 * Tin kéo dài nhiều ngày mà thiếu ràng buộc này sẽ cho đặt lúc 3h sáng.
 */
describe('ReservationsService.create — khung giờ mở cửa trong ngày', () => {
  const listingBase = {
    id: 'listing-1',
    quantity_remaining: 10,
    status: 'active',
    max_per_reservation: 3,
    pickup_start_time: new Date(Date.now() - 86_400_000),
    pickup_end_time: new Date(Date.now() + 86_400_000),
    expiry_time: new Date(Date.now() + 172_800_000),
  };

  const prisma = {
    receiverProfile: { findUnique: jest.fn() },
    reservation: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const lock = { release: jest.fn() };
  let service: ReservationsService;

  const build = (daily: { start: number | null; end: number | null }) => {
    prisma.receiverProfile.findUnique.mockResolvedValue({
      id: 'receiver-1',
      isCharityOrg: false,
      faceDescriptor: [1],
      reservationsToday: 0,
    });
    prisma.$queryRaw.mockResolvedValue([
      { ...listingBase, daily_start_minute: daily.start, daily_end_minute: daily.end },
    ]);
    return new ReservationsService(
      prisma as never,
      {} as never,
      { acquire: jest.fn().mockResolvedValue(lock) } as never,
      {} as never, {} as never,
      { getNumber: jest.fn().mockResolvedValue(3) } as never,
      { notify: jest.fn() } as never,
      { applyDelta: jest.fn() } as never,
      { add: jest.fn() } as never,
    );
  };

  beforeEach(() => jest.clearAllMocks());

  it('chặn đặt khi đang ngoài giờ mở cửa của tin', async () => {
    // Khung 00:00–00:01 nên mọi thời điểm thực tế đều nằm ngoài
    service = build({ start: 0, end: 1 });

    await expect(service.create('user-1', { listingId: 'listing-1', quantity: 1 } as never))
      .rejects.toThrow(/Ngoài giờ nhận hàng/);
  });

  it('không áp ràng buộc khi tin cũ chưa khai báo khung giờ ngày', async () => {
    service = build({ start: null, end: null });

    // Đi qua được bước kiểm giờ → dừng ở bước sau, KHÔNG phải lỗi "ngoài giờ"
    await expect(service.create('user-1', { listingId: 'listing-1', quantity: 1 } as never))
      .rejects.not.toThrow(/Ngoài giờ nhận hàng/);
  });
});

describe('ReservationsService.expireNoShows', () => {
  const prisma = {
    reservation: { findMany: jest.fn(), update: jest.fn() },
    delivery: { update: jest.fn() },
    receiverProfile: { update: jest.fn(), updateMany: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const trust = { applyDelta: jest.fn() };
  let service: ReservationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockResolvedValue([]);
    service = new ReservationsService(
      prisma as never,
      {} as never,          // config
      {} as never,          // redlock
      {} as never,          // storage
      {} as never,          // faceMatch
      // systemConfig — mốc phạt uy tín giờ đọc từ system_configs, trả mặc định
      { getNumber: jest.fn(async (k: string) => (k === 'RESERVATION_NO_SHOW_PENALTY' ? 20 : 10)) } as never,
      { notify: jest.fn() } as never,
      trust as never,
      { add: jest.fn() } as never,
    );
  });

  it('gom cả đơn có delivery đã HUỶ vào nhóm tự đến lấy', async () => {
    // Hồi quy: chỉ lọc `delivery: null` → đơn mà người nhận bấm "Tự đến lấy trực tiếp"
    // (delivery = cancelled) rơi khỏi cả hai truy vấn và kẹt 'confirmed' vĩnh viễn.
    prisma.reservation.findMany.mockResolvedValue([]);

    await service.expireNoShows();

    const pickupWhere = prisma.reservation.findMany.mock.calls[0][0].where;
    expect(pickupWhere.OR).toEqual([
      { delivery: { is: null } },
      { delivery: { status: 'cancelled' } },
    ]);
  });

  it('phạt -20 và hoàn kho cho đơn tự đến lấy quá hạn', async () => {
    prisma.reservation.findMany
      .mockResolvedValueOnce([
        {
          id: 'res-1',
          quantity: 2,
          listingId: 'listing-1',
          receiverId: 'receiver-1',
          receiver: { id: 'receiver-1', userId: 'user-1' },
        },
      ])
      .mockResolvedValueOnce([]);

    const n = await service.expireNoShows();

    expect(n).toBe(1);
    expect(prisma.reservation.update).toHaveBeenCalledWith({
      where: { id: 'res-1' },
      data: { status: 'no_show' },
    });
    expect(trust.applyDelta).toHaveBeenCalledWith(
      'user-1', -20, 'no_show', 'reservation', 'res-1',
    );
  });

  it('đơn chưa tìm được shipper → expired, KHÔNG phạt', async () => {
    prisma.reservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'res-2',
          quantity: 1,
          listingId: 'listing-2',
          receiverId: 'receiver-2',
          delivery: { id: 'del-2', status: 'pending_assignment' },
        },
      ]);

    await service.expireNoShows();

    expect(prisma.reservation.update).toHaveBeenCalledWith({
      where: { id: 'res-2' },
      data: { status: 'expired' },
    });
    expect(trust.applyDelta).not.toHaveBeenCalled();
    // Delivery còn đang tìm shipper → đóng lại
    expect(prisma.delivery.update).toHaveBeenCalled();
  });

  it('không ghi đè lý do thất bại của delivery đã failed', async () => {
    prisma.reservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'res-3',
          quantity: 1,
          listingId: 'listing-3',
          receiverId: 'receiver-3',
          delivery: { id: 'del-3', status: 'failed' },
        },
      ]);

    await service.expireNoShows();

    expect(prisma.reservation.update).toHaveBeenCalledWith({
      where: { id: 'res-3' },
      data: { status: 'expired' },
    });
    expect(prisma.delivery.update).not.toHaveBeenCalled();
  });
});
