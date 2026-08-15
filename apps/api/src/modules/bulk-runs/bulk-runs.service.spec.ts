import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  BulkRunsService,
  BULK_MIN_QTY,
  BULK_CANCEL_PENALTY,
} from './bulk-runs.service';

/**
 * Trọng tâm: các nhánh CHẶN của luồng giao sỉ. Đây là chỗ dễ vỡ nhất vì một chuyến
 * giữ số lượng lớn của tin đăng — cho qua nhầm là kho bị khoá oan hoặc sổ sách sai.
 */
describe('BulkRunsService', () => {
  const prisma = {
    volunteerProfile: { findUnique: jest.fn() },
    providerProfile: { findUnique: jest.fn() },
    bulkRun: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    bulkRunStop: { update: jest.fn(), delete: jest.fn(), aggregate: jest.fn() },
    delivery: { findFirst: jest.fn() },
    foodListing: { findFirst: jest.fn() },
    reservation: { update: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const notifications = { notify: jest.fn() };
  const trust = { applyDelta: jest.fn() };
  let service: BulkRunsService;

  /** Shipper hợp lệ: có chuyên môn shipper đã xác minh. */
  const verifiedShipper = {
    id: 'shipper-1',
    specializations: [{ specialization: 'shipper', isVerified: true }],
  };

  /** Tin đăng hợp lệ: còn active, chưa quá giờ, còn đủ hàng. */
  const okListing = {
    id: 'listing-1',
    title: 'Bánh mì',
    status: 'active',
    providerId: 'provider-1',
    pickupEndTime: new Date(Date.now() + 3_600_000),
    quantityRemaining: 50,
    provider: { userId: 'provider-user-1' },
  };

  const dto = { listingId: 'listing-1', quantity: 10 };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockResolvedValue([]);
    prisma.volunteerProfile.findUnique.mockResolvedValue(verifiedShipper);
    prisma.bulkRun.findFirst.mockResolvedValue(null);
    prisma.delivery.findFirst.mockResolvedValue(null);
    prisma.foodListing.findFirst.mockResolvedValue(okListing);
    prisma.bulkRunStop.aggregate.mockResolvedValue({ _sum: { plannedQty: 0 } });
    service = new BulkRunsService(
      prisma as never,
      {} as never, // redlock
      {} as never, // storage
      notifications as never,
      {} as never, // systemConfig
      trust as never,
    );
  });

  // ── request ────────────────────────────────────────────────────────────────
  describe('request', () => {
    it('chặn TNV chưa được xác minh chuyên môn shipper', async () => {
      prisma.volunteerProfile.findUnique.mockResolvedValue({
        id: 'v-1',
        specializations: [{ specialization: 'chef', isVerified: true }],
      });

      await expect(service.request('user-1', dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.bulkRun.create).not.toHaveBeenCalled();
    });

    it('chặn số lượng dưới ngưỡng tối thiểu', async () => {
      await expect(
        service.request('user-1', { ...dto, quantity: BULK_MIN_QTY - 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bulkRun.create).not.toHaveBeenCalled();
    });

    it('chặn khi đang có chuyến giao sỉ chưa hoàn tất', async () => {
      prisma.bulkRun.findFirst.mockResolvedValue({ id: 'run-dang-chay' });

      await expect(service.request('user-1', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.bulkRun.create).not.toHaveBeenCalled();
    });

    it('chặn khi đang giao một đơn lẻ (guard chéo)', async () => {
      prisma.delivery.findFirst.mockResolvedValue({ id: 'delivery-dang-giao' });

      await expect(service.request('user-1', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.bulkRun.create).not.toHaveBeenCalled();
    });

    it('chặn tin đã quá giờ nhận hàng', async () => {
      prisma.foodListing.findFirst.mockResolvedValue({
        ...okListing,
        pickupEndTime: new Date(Date.now() - 1000),
      });

      await expect(service.request('user-1', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.bulkRun.create).not.toHaveBeenCalled();
    });

    it('chặn khi kho không còn đủ số lượng yêu cầu', async () => {
      prisma.foodListing.findFirst.mockResolvedValue({
        ...okListing,
        quantityRemaining: 5,
      });

      await expect(
        service.request('user-1', { ...dto, quantity: 10 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bulkRun.create).not.toHaveBeenCalled();
    });

    it('tạo yêu cầu và báo cho nhà cung cấp khi hợp lệ', async () => {
      prisma.bulkRun.create.mockResolvedValue({
        id: 'run-1',
        status: 'requested',
      });

      const run = await service.request('user-1', dto);

      expect(run).toEqual({ id: 'run-1', status: 'requested' });
      expect(prisma.bulkRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            listingId: 'listing-1',
            providerId: 'provider-1',
            shipperId: 'shipper-1',
            quantity: 10,
          }),
        }),
      );
      expect(notifications.notify).toHaveBeenCalledWith(
        'provider-user-1',
        expect.objectContaining({ type: 'bulk_run' }),
      );
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────
  describe('huỷ chuyến', () => {
    // cancel() gọi findUnique hai lần: lần đầu để kiểm quyền, lần sau lấy dữ liệu
    // thông báo cho NCC — nên mock phải có đủ provider/listing.
    const runShape = {
      id: 'run-1',
      shipperId: 'shipper-1',
      listingId: 'listing-1',
      quantity: 10,
      provider: { userId: 'provider-user-1' },
      listing: { title: 'Bánh mì' },
    };

    beforeEach(() => {
      prisma.volunteerProfile.findUnique.mockResolvedValue({ id: 'shipper-1' });
      prisma.bulkRun.findUnique
        .mockReset()
        .mockResolvedValue({ ...runShape, status: 'approved' });
    });

    it('KHÔNG phạt khi huỷ lúc còn chờ duyệt — chưa ai bị ảnh hưởng', async () => {
      prisma.bulkRun.findUnique.mockResolvedValue({
        ...runShape,
        status: 'requested',
      });

      await service.cancel('run-1', 'shipper-user-1');

      expect(trust.applyDelta).not.toHaveBeenCalled();
    });

    it('phạt uy tín khi huỷ SAU KHI đã được duyệt', async () => {
      await service.cancel('run-1', 'shipper-user-1');

      expect(trust.applyDelta).toHaveBeenCalledWith(
        'shipper-user-1',
        -BULK_CANCEL_PENALTY,
        'bulk_run_cancelled_after_approval',
        'bulk_run',
        'run-1',
      );
    });

    it('không cho huỷ sau khi đã lấy hàng', async () => {
      prisma.bulkRun.findUnique.mockResolvedValue({
        ...runShape,
        status: 'picked_up',
      });

      await expect(
        service.cancel('run-1', 'shipper-user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(trust.applyDelta).not.toHaveBeenCalled();
    });
  });

  // ── expireStalled ──────────────────────────────────────────────────────────
  describe('hạn chót từng giai đoạn', () => {
    beforeEach(() => {
      prisma.bulkRun.updateMany.mockResolvedValue({ count: 0 });
      prisma.bulkRun.findMany.mockResolvedValue([]);
    });

    it('đóng yêu cầu chờ duyệt quá hạn, không đụng kho', async () => {
      prisma.bulkRun.updateMany.mockResolvedValue({ count: 2 });

      const n = await service.expireStalled();

      expect(n).toBe(2);
      const where = prisma.bulkRun.updateMany.mock.calls[0][0].where;
      expect(where.status).toBe('requested');
      expect(where.createdAt.lt).toBeInstanceOf(Date);
      // Yêu cầu chờ duyệt chưa trừ kho → không được hoàn
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('hạn đến lấy hàng tính từ approvedAt, KHÔNG phải updatedAt', async () => {
      // Dựa vào updatedAt thì shipper chỉ cần thao tác vặt là gia hạn vô hạn
      await service.expireStalled();

      const approvedWhere = prisma.bulkRun.findMany.mock.calls[0][0].where;
      expect(approvedWhere.status).toBe('approved');
      expect(approvedWhere.approvedAt?.lt).toBeInstanceOf(Date);
      expect(approvedWhere.updatedAt).toBeUndefined();
    });

    it('hạn phát xong tính từ pickedUpAt, KHÔNG phải updatedAt', async () => {
      await service.expireStalled();

      const pickedWhere = prisma.bulkRun.findMany.mock.calls[1][0].where;
      expect(pickedWhere.status).toBe('picked_up');
      expect(pickedWhere.pickedUpAt?.lt).toBeInstanceOf(Date);
      expect(pickedWhere.updatedAt).toBeUndefined();
    });

    it('đã duyệt mà không đến lấy → huỷ và hoàn TOÀN BỘ kho đang giữ', async () => {
      prisma.bulkRun.findMany
        .mockResolvedValueOnce([
          { id: 'run-1', listingId: 'listing-1', quantity: 20 },
        ])
        .mockResolvedValueOnce([]);

      await service.expireStalled();

      expect(prisma.bulkRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1' },
          data: expect.objectContaining({ status: 'cancelled' }),
        }),
      );
    });

    it('đã lấy hàng quá hạn → đóng chuyến, chỉ hoàn phần CHƯA phát', async () => {
      prisma.bulkRun.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'run-2',
          listingId: 'listing-2',
          quantity: 20,
          quantityDistributed: 12,
        },
      ]);

      await service.expireStalled();

      expect(prisma.bulkRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-2' },
          data: expect.objectContaining({ status: 'completed' }),
        }),
      );
    });
  });

  // ── updateStop / removeStop ────────────────────────────────────────────────
  describe('sửa & gỡ điểm phát', () => {
    const runOwned = {
      id: 'run-1',
      status: 'picked_up',
      shipper: { userId: 'shipper-user-1' },
      provider: { userId: 'provider-user-1' },
    };

    it('chặn người ngoài chuyến', async () => {
      prisma.bulkRun.findUnique.mockResolvedValue(runOwned);

      await expect(
        service.updateStop('run-1', 'stop-1', 'nguoi-la', { label: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bulkRunStop.update).not.toHaveBeenCalled();
    });

    it('chặn khi chuyến đã kết thúc', async () => {
      prisma.bulkRun.findUnique.mockResolvedValue({
        ...runOwned,
        status: 'completed',
      });

      await expect(
        service.updateStop('run-1', 'stop-1', 'shipper-user-1', { label: 'X' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bulkRunStop.update).not.toHaveBeenCalled();
    });

    it('chặn sửa điểm đã phát hàng', async () => {
      prisma.bulkRun.findUnique.mockResolvedValue(runOwned);
      prisma.$queryRaw.mockResolvedValue([
        { id: 'stop-1', served_qty: 3, reservation_id: null },
      ]);

      await expect(
        service.updateStop('run-1', 'stop-1', 'shipper-user-1', { label: 'X' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bulkRunStop.update).not.toHaveBeenCalled();
    });

    it('báo lỗi khi điểm không thuộc chuyến', async () => {
      prisma.bulkRun.findUnique.mockResolvedValue(runOwned);
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.updateStop('run-1', 'stop-la', 'shipper-user-1', {
          label: 'X',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('đòi đủ cả lng và lat khi đổi vị trí', async () => {
      prisma.bulkRun.findUnique.mockResolvedValue(runOwned);
      prisma.$queryRaw.mockResolvedValue([
        { id: 'stop-1', served_qty: 0, reservation_id: null },
      ]);

      await expect(
        service.updateStop('run-1', 'stop-1', 'shipper-user-1', { lng: 106.7 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bulkRunStop.update).not.toHaveBeenCalled();
    });

    it('cho nhà cung cấp sửa điểm chưa phát KHI CHƯA lấy hàng', async () => {
      prisma.bulkRun.findUnique.mockResolvedValue({
        ...runOwned,
        status: 'approved',
      });
      prisma.$queryRaw.mockResolvedValue([
        { id: 'stop-1', served_qty: 0, reservation_id: null },
      ]);

      await service.updateStop('run-1', 'stop-1', 'provider-user-1', {
        label: '  KTX khu B  ',
      });

      expect(prisma.bulkRunStop.update).toHaveBeenCalledWith({
        where: { id: 'stop-1' },
        data: { label: 'KTX khu B' },
      });
    });

    it('chặn nhà cung cấp sửa điểm khi shipper ĐÃ lấy hàng, shipper thì vẫn được', async () => {
      // Hàng đã rời cửa hàng → tuyến thuộc quyền shipper; NCC đổi điểm lúc này sẽ
      // khiến người đang chạy ngoài đường bị đổi đích giữa chừng.
      prisma.bulkRun.findUnique.mockResolvedValue(runOwned); // status: picked_up
      prisma.$queryRaw.mockResolvedValue([
        { id: 'stop-1', served_qty: 0, reservation_id: null },
      ]);

      await expect(
        service.updateStop('run-1', 'stop-1', 'provider-user-1', {
          label: 'X',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bulkRunStop.update).not.toHaveBeenCalled();

      await service.updateStop('run-1', 'stop-1', 'shipper-user-1', {
        label: 'X',
      });
      expect(prisma.bulkRunStop.update).toHaveBeenCalled();
    });

    it('chặn tổng số phần dự kiến vượt số phần của chuyến', async () => {
      prisma.bulkRun.findUnique.mockResolvedValue({
        ...runOwned,
        quantity: 10,
      });
      prisma.$queryRaw.mockResolvedValue([
        { id: 'stop-2', served_qty: 0, reservation_id: null },
      ]);
      // Các điểm khác đã dự kiến 5 phần → điểm này chỉ còn tối đa 5
      prisma.bulkRunStop.aggregate.mockResolvedValue({
        _sum: { plannedQty: 5 },
      });

      await expect(
        service.updateStop('run-1', 'stop-2', 'shipper-user-1', {
          plannedQty: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bulkRunStop.update).not.toHaveBeenCalled();
    });

    it('gỡ điểm kèm huỷ reservation ghi sổ, KHÔNG hoàn kho', async () => {
      prisma.bulkRun.findUnique.mockResolvedValue(runOwned);
      prisma.$queryRaw.mockResolvedValue([
        { id: 'stop-1', served_qty: 0, reservation_id: 'res-1' },
      ]);

      await service.removeStop('run-1', 'stop-1', 'shipper-user-1');

      expect(prisma.reservation.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'res-1' } }),
      );
      expect(prisma.bulkRunStop.delete).toHaveBeenCalledWith({
        where: { id: 'stop-1' },
      });
      // Kho đã trừ theo cả chuyến lúc duyệt — hoàn ở đây sẽ cộng khống
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('chặn gỡ điểm đã phát hàng', async () => {
      prisma.bulkRun.findUnique.mockResolvedValue(runOwned);
      prisma.$queryRaw.mockResolvedValue([
        { id: 'stop-1', served_qty: 2, reservation_id: null },
      ]);

      await expect(
        service.removeStop('run-1', 'stop-1', 'shipper-user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bulkRunStop.delete).not.toHaveBeenCalled();
    });
  });
});
