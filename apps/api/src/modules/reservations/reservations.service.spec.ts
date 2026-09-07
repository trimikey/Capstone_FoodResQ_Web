import { BadRequestException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';

/**
 * Đánh giá sau đơn: một đơn có thể có HAI đánh giá — cửa hàng và tình nguyện viên
 * đã giao — phân biệt bằng rateeId. Chấm nhầm bên nào thì avgRating của bên kia sai.
 */
/**
 * Giá trị cấu hình mặc định cho test.
 *
 * Trước đây mock trả 3 cho MỌI khoá — vô hại khi chỉ có hạn mức số lượt/ngày, nhưng
 * khung giờ nhận đơn cũng đọc từ đây: mở 00:03 đóng 00:03 là khung rỗng, mọi test đặt
 * hàng fail. Trả theo khoá để test chạy đúng luật thật.
 */
async function configValue(key: string): Promise<number> {
  if (key === 'PLATFORM_ORDER_OPEN_MINUTE') return 0;
  if (key === 'PLATFORM_ORDER_CLOSE_MINUTE') return 1440;
  return 3;
}

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
  // Mốc thời gian GIẢ dùng chung cho CẢ fixture lẫn đồng hồ test. Bản cũ lấy
  // Date.now() THẬT lúc load file còn test đóng băng đồng hồ ở 17/08/2026 —
  // từ 19/08/2026 trở đi, (now thật − 24h) rơi sang NGÀY SAU mốc giả nên test
  // lạc vào nhánh "Chưa đến ngày nhận hàng" và fail theo... lịch.
  const FAKE_NOW = new Date('2026-08-17T09:33:00.000Z');
  const listingBase = {
    id: 'listing-1',
    quantity_remaining: 10,
    status: 'active',
    max_per_reservation: 3,
    pickup_start_time: new Date(FAKE_NOW.getTime() - 86_400_000),
    pickup_end_time: new Date(FAKE_NOW.getTime() + 86_400_000),
    expiry_time: new Date(FAKE_NOW.getTime() + 172_800_000),
  };

  const transactionClient = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    receiverProfile: { update: jest.fn() },
  };
  const prisma = {
    receiverProfile: { findUnique: jest.fn() },
    reservation: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const lock = { release: jest.fn() };
  let service: ReservationsService;

  const build = (
    daily: { start: number | null; end: number | null },
    platform: { open: number; close: number } = { open: 0, close: 1440 },
  ) => {
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
      {
        getNumber: jest.fn(async (key: string) => {
          if (key === 'PLATFORM_ORDER_OPEN_MINUTE') return platform.open;
          if (key === 'PLATFORM_ORDER_CLOSE_MINUTE') return platform.close;
          return configValue(key);
        }),
      } as never,
      { notify: jest.fn() } as never,
      { applyDelta: jest.fn() } as never,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Đóng băng đồng hồ cho MỌI test trong describe — fixture ở trên neo theo
    // FAKE_NOW nên test nào chạy bằng giờ thật sẽ lệch ngày và fail theo lịch.
    jest.useFakeTimers();
    jest.setSystemTime(FAKE_NOW);
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    );
    transactionClient.$queryRaw.mockResolvedValue([{ id: 'reservation-1', qr_token: 'qr-token' }]);
  });

  it('chặn đặt khi đang ngoài giờ mở cửa của tin', async () => {
    // Khung 00:00–00:01 nên 16:33 giờ VN phải bị chặn.
    service = build({ start: 0, end: 1 });

    await expect(service.create('user-1', { listingId: 'listing-1', quantity: 1 } as never))
      .rejects.toThrow(/Ngoài giờ nhận đơn/);
  });

  it('cho đặt trong daily window khi pickupStartTime cũ bị lưu muộn hơn', async () => {
    // 16:33 ngày 17/08 giờ VN (FAKE_NOW) — trong khung provider đặt 14:45–21:44.
    service = build({ start: 885, end: 1304 });
    // Timestamp cũ bị lệch: UI/API trước đây coi 22:00 VN mới là lúc mở.
    prisma.$queryRaw.mockResolvedValue([
      {
        ...listingBase,
        pickup_start_time: new Date('2026-08-17T15:00:00.000Z'),
        pickup_end_time: new Date('2026-08-18T22:00:00.000Z'),
        daily_start_minute: 885,
        daily_end_minute: 1304,
      },
    ]);

    await expect(service.create('user-1', { listingId: 'listing-1', quantity: 1 } as never))
      .resolves.toMatchObject({ reservationId: 'reservation-1', qrToken: 'qr-token' });
  });

  it('giữ mốc tuyệt đối cho tin cũ chưa khai báo khung giờ ngày', async () => {
    service = build({ start: null, end: null });

    await expect(service.create('user-1', { listingId: 'listing-1', quantity: 1 } as never))
      .resolves.toMatchObject({ reservationId: 'reservation-1' });
  });

  it('giờ SÀN chặn cả tin không khai giờ riêng — không còn đặt được lúc 2h sáng', async () => {
    // FAKE_NOW = 16:33 giờ VN, ngoài khung sàn 08:00–10:00.
    service = build({ start: null, end: null }, { open: 480, close: 600 });

    await expect(service.create('user-1', { listingId: 'listing-1', quantity: 1 } as never))
      .rejects.toThrow(/Ngoài giờ nhận đơn \(08:00–10:00\)/);
  });

  it('cửa hàng khai rộng hơn giờ sàn thì lấy phần giao nhau, không nới ra được', async () => {
    // Cửa hàng khai 00:00–23:59 nhưng sàn chỉ mở 08:00–16:00 → 16:33 vẫn bị chặn.
    service = build({ start: 0, end: 1439 }, { open: 480, close: 960 });

    await expect(service.create('user-1', { listingId: 'listing-1', quantity: 1 } as never))
      .rejects.toThrow(/08:00–16:00/);
  });

  it('giờ cửa hàng nằm ngoài giờ sàn → báo khung rỗng thay vì lỗi khó hiểu', async () => {
    service = build({ start: 1380, end: 1439 }, { open: 480, close: 1350 });

    await expect(service.create('user-1', { listingId: 'listing-1', quantity: 1 } as never))
      .rejects.toThrow(/ngoài giờ hoạt động của hệ thống/);
  });

  it('chặn hẹn giao ngoài khung dù lúc ĐẶT vẫn đang trong giờ mở cửa', async () => {
    // Đặt lúc 16:33 (hợp lệ) nhưng hẹn giao 02:00 sáng hôm sau — đúng tình huống
    // "2h sáng vẫn có shipper phải đi giao" mà khung giờ sinh ra để chặn.
    service = build({ start: null, end: null }, { open: 480, close: 1350 });

    await expect(
      service.create('user-1', {
        listingId: 'listing-1',
        quantity: 1,
        requestDelivery: false,
        deliveryScheduledAt: '2026-08-18T02:00:00+07:00',
      } as never),
    ).rejects.toThrow(/Giờ hẹn giao phải nằm trong khung 08:00–22:30/);
  });

  afterEach(() => jest.useRealTimers());
});

describe('ReservationsService — thời hạn QR theo cấu hình admin', () => {
  const transactionClient = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    receiverProfile: { update: jest.fn() },
  };
  const prisma = {
    receiverProfile: { findUnique: jest.fn(), updateMany: jest.fn() },
    providerProfile: { findUnique: jest.fn() },
    reservation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const lock = { release: jest.fn() };

  const createService = (qrValidMinutes: number) => {
    const systemConfig = {
      getNumber: jest.fn(async (key: string) =>
        key === 'QR_VALIDITY_MINUTES' ? qrValidMinutes : configValue(key),
      ),
    };
    const service = new ReservationsService(
      prisma as never,
      {} as never,
      { acquire: jest.fn().mockResolvedValue(lock) } as never,
      {} as never,
      {} as never,
      systemConfig as never,
      { notify: jest.fn() } as never,
      { applyDelta: jest.fn() } as never,
    );
    return { service, systemConfig };
  };

  const prepareCreate = () => {
    prisma.receiverProfile.findUnique.mockResolvedValue({
      id: 'receiver-1',
      isCharityOrg: false,
      faceDescriptor: [1],
      reservationsToday: 0,
    });
    prisma.reservation.findFirst.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([{
      id: 'listing-1',
      quantity_remaining: 10,
      status: 'active',
      max_per_reservation: 3,
      pickup_start_time: new Date('2026-08-16T00:00:00.000Z'),
      pickup_end_time: new Date('2026-08-18T23:59:00.000Z'),
      expiry_time: new Date('2026-08-18T23:59:00.000Z'),
      daily_start_minute: null,
      daily_end_minute: null,
    }]);
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    );
    transactionClient.$queryRaw.mockResolvedValue([{ id: 'reservation-1', qr_token: 'qr-token' }]);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-17T09:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it.each([15, 45])('lưu và trả đúng hạn QR %i phút do admin cấu hình', async (qrValidMinutes) => {
    prepareCreate();
    const { service, systemConfig } = createService(qrValidMinutes);
    const expectedExpiresAt = new Date('2026-08-17T09:00:00.000Z');
    expectedExpiresAt.setMinutes(expectedExpiresAt.getMinutes() + qrValidMinutes);

    const result = await service.create(
      'receiver-user-1',
      { listingId: 'listing-1', quantity: 1 } as never,
    );

    expect(result).toMatchObject({
      reservationId: 'reservation-1',
      qrToken: 'qr-token',
      qrExpiresAt: expectedExpiresAt,
    });
    expect(systemConfig.getNumber).toHaveBeenCalledWith('QR_VALIDITY_MINUTES');

    const insertQuery = transactionClient.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(insertQuery.values).toContain(expectedExpiresAt.toISOString());
  });

  it('từ chối quét QR tự đến lấy đã quá hạn và tự đóng đơn', async () => {
    const { service } = createService(30);
    const expiredReservation = {
      id: 'reservation-1',
      bulkRunStopId: null,
      status: 'confirmed',
      qrExpiresAt: new Date('2026-08-17T08:59:59.000Z'),
    };
    prisma.reservation.findUnique
      .mockResolvedValueOnce(expiredReservation)
      .mockResolvedValueOnce({ quantity: 1, listingId: 'listing-1', receiverId: 'receiver-1' });
    prisma.$transaction.mockResolvedValue([]);

    await expect(service.scanQr('a'.repeat(64), 'provider-user-1'))
      .rejects.toThrow('Mã QR đã hết hạn');

    expect(prisma.reservation.update).toHaveBeenCalledWith({
      where: { id: 'reservation-1' },
      data: { status: 'expired' },
    });
  });

  it('cho quét QR tự đến lấy còn hạn', async () => {
    const { service } = createService(30);
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'reservation-1',
      bulkRunStopId: null,
      status: 'confirmed',
      qrExpiresAt: new Date('2026-08-17T09:00:01.000Z'),
      quantity: 1,
      listing: { providerId: 'provider-1', title: 'Bánh mì', quantityUnit: 'phần' },
      receiver: {
        userId: 'receiver-user-1',
        faceImageUrl: null,
        idCardImageUrl: null,
        idCardNumber: null,
        faceDescriptor: [1],
        user: { fullName: 'Người nhận', phone: '0900000000', avatarUrl: null },
      },
    });
    prisma.providerProfile.findUnique.mockResolvedValue({ id: 'provider-1' });

    await expect(service.scanQr('a'.repeat(64), 'provider-user-1'))
      .resolves.toMatchObject({ id: 'reservation-1', status: 'confirmed' });

    expect(prisma.reservation.update).not.toHaveBeenCalled();
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

/**
 * Phạt huỷ trễ tồn tại để bù cho bên bị thiệt (cửa hàng đã để dành suất, shipper đã
 * chạy tới lấy). Đơn giao chưa ai nhận thì không có thiệt hại đó — mà cứ để đó thì cron
 * tự huỷ và KHÔNG phạt, nên phạt người bấm huỷ sớm hơn là thưởng cho việc ngồi im.
 */
describe('ReservationsService.cancel — không phạt khi chưa tìm được shipper', () => {
  const prisma = {
    reservation: { findUnique: jest.fn(), update: jest.fn() },
    receiverProfile: { updateMany: jest.fn() },
    delivery: { update: jest.fn() },
    shipperTaskOffer: { updateMany: jest.fn() },
    volunteerProfile: { update: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const trust = { applyDelta: jest.fn() };
  let service: ReservationsService;

  /** Sát giờ đóng nhận (còn 5 phút) → thoả điều kiện "huỷ trễ" theo thời gian. */
  const buildReservation = (delivery: Record<string, unknown> | null) => ({
    id: 'res-1',
    status: 'confirmed',
    quantity: 1,
    listingId: 'listing-1',
    receiverId: 'receiver-1',
    receiver: { userId: 'user-1' },
    listing: { pickupEndTime: new Date(Date.now() + 5 * 60_000), title: 'Cơm gà' },
    delivery,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReservationsService(
      prisma as never,
      {} as never, {} as never, {} as never, {} as never,
      { getNumber: jest.fn(configValue) } as never,
      { notify: jest.fn() } as never,
      trust as never,
    );
  });

  it('đơn giao đang tìm shipper: huỷ sát giờ vẫn KHÔNG bị trừ điểm', async () => {
    prisma.reservation.findUnique.mockResolvedValue(
      buildReservation({ id: 'dlv-1', status: 'pending_assignment', shipperId: null, shipper: null }),
    );

    await service.cancel('res-1', 'user-1');

    expect(trust.applyDelta).not.toHaveBeenCalled();
  });

  it('đơn giao ĐÃ có shipper nhận: huỷ sát giờ vẫn bị trừ điểm (shipper đã đi)', async () => {
    prisma.reservation.findUnique.mockResolvedValue(
      buildReservation({
        id: 'dlv-1', status: 'assigned', shipperId: 'shipper-1',
        shipper: { userId: 'shipper-user-1' },
      }),
    );

    await service.cancel('res-1', 'user-1');

    expect(trust.applyDelta).toHaveBeenCalled();
  });

  it('đơn tự đến lấy: giữ nguyên luật phạt huỷ trễ', async () => {
    prisma.reservation.findUnique.mockResolvedValue(buildReservation(null));

    await service.cancel('res-1', 'user-1');

    expect(trust.applyDelta).toHaveBeenCalled();
  });
});
