import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AssignmentRole } from '@foodresq/types';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { StorageService } from '@/common/storage/storage.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { DeliveriesService } from '@/modules/deliveries/deliveries.service';
import { DishStepsService } from './dish-steps.service';

describe('CampaignsService', () => {
  let service: CampaignsService;
  const prisma = {
    volunteerProfile: { findUnique: jest.fn() },
    kitchenCampaign: { findUnique: jest.fn() },
    // `count` được service gọi khi kiểm tra ca làm — thiếu mock thì 3 test apply() đỏ
    campaignShift: { findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    campaignVolunteerAssignment: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
    receiverProfile: { findUnique: jest.fn() },
    mealDistribution: { aggregate: jest.fn(), create: jest.fn() },
    campaignTransport: { findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks chỉ xoá lịch sử gọi, KHÔNG xoá implementation — mockResolvedValue
    // đặt lúc khai báo hoặc trong test trước vẫn còn. Đặt lại mặc định ở đây để test
    // "chiến dịch có ca" không rò sang các test không chia ca.
    prisma.campaignShift.count.mockResolvedValue(0);
    prisma.campaignVolunteerAssignment.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: StorageService, useValue: { saveImage: jest.fn() } },
        { provide: SystemConfigService, useValue: {} },
        { provide: DeliveriesService, useValue: { broadcastToNearbyShippers: jest.fn() } },
        { provide: DishStepsService, useValue: { getStepsForCampaign: jest.fn().mockResolvedValue({ dishes: [], cookingTeam: [], safetyLogs: [] }) } },
      ],
    }).compile();
    service = moduleRef.get(CampaignsService);
  });

  const campaign = {
    id: 'campaign-1',
    status: 'open',
    scheduledDate: new Date('2099-01-01T00:00:00.000Z'),
    chefSlotsNeeded: 2,
    chefSlotsFilled: 0,
    waiterSlotsNeeded: 2,
    waiterSlotsFilled: 0,
    shipperSlotsNeeded: 2,
    shipperSlotsFilled: 0,
  };

  function activeVolunteer(status = 'active') {
    prisma.volunteerProfile.findUnique.mockResolvedValue({
      id: 'volunteer-1',
      user: { status },
      specializations: [{ specialization: 'chef' }],
    });
  }

  it('creates a pending assignment without increasing campaign capacity', async () => {
    activeVolunteer();
    prisma.kitchenCampaign.findUnique.mockResolvedValue(campaign);
    prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue(null);

    await expect(service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF })).resolves.toEqual(
      expect.objectContaining({ message: expect.stringContaining('chờ tổ chức duyệt') }),
    );

    expect(prisma.campaignVolunteerAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignId: 'campaign-1',
        volunteerId: 'volunteer-1',
        role: AssignmentRole.CHEF,
        status: 'pending',
      }),
    });
  });

  it('rejects a duplicate pending campaign application', async () => {
    activeVolunteer();
    prisma.kitchenCampaign.findUnique.mockResolvedValue(campaign);
    prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue({ id: 'assignment-1', status: 'pending' });

    await expect(service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  describe('đăng ký nhiều ca trong cùng chiến dịch', () => {
    /** Chiến dịch có chia ca — apply() phải kèm shiftId mới đi tiếp. */
    function shiftCampaign() {
      activeVolunteer();
      prisma.kitchenCampaign.findUnique.mockResolvedValue(campaign);
      prisma.campaignShift.count.mockResolvedValue(2);
    }

    it('nhận được ca thứ hai khi ca đó NỐI TIẾP ca đã giữ', async () => {
      // Đúng tình huống "đầu bếp làm cả ngày": ca sáng 06–11, ca chiều 11–16.
      shiftCampaign();
      prisma.campaignShift.findUnique
        .mockResolvedValueOnce({ id: 'shift-2', campaignId: 'campaign-1', role: 'chef', label: 'Ca chiều' })
        .mockResolvedValueOnce({ startTime: '11:00', endTime: '16:00' });
      prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue(null);
      prisma.campaignVolunteerAssignment.findMany.mockResolvedValue([
        { shift: { label: 'Ca sáng', startTime: '06:00', endTime: '11:00' } },
      ]);

      await expect(
        service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF, shiftId: 'shift-2' }),
      ).resolves.toEqual(expect.objectContaining({ message: expect.stringContaining('chờ tổ chức duyệt') }));

      expect(prisma.campaignVolunteerAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ shiftId: 'shift-2', role: AssignmentRole.CHEF }),
      });
    });

    it('chặn ca CHỒNG GIỜ với ca đã giữ', async () => {
      shiftCampaign();
      prisma.campaignShift.findUnique
        .mockResolvedValueOnce({ id: 'shift-2', campaignId: 'campaign-1', role: 'chef', label: 'Ca nấu' })
        .mockResolvedValueOnce({ startTime: '10:00', endTime: '16:00' });
      prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue(null);
      prisma.campaignVolunteerAssignment.findMany.mockResolvedValue([
        { shift: { label: 'Ca sơ chế', startTime: '06:00', endTime: '12:00' } },
      ]);

      await expect(
        service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF, shiftId: 'shift-2' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.campaignVolunteerAssignment.create).not.toHaveBeenCalled();
    });

    it('chặn đăng ký lại ĐÚNG ca đã giữ', async () => {
      shiftCampaign();
      prisma.campaignShift.findUnique.mockResolvedValue({
        id: 'shift-1',
        campaignId: 'campaign-1',
        role: 'chef',
        label: 'Ca sáng',
      });
      prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue({ id: 'a-1', status: 'pending' });

      await expect(
        service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF, shiftId: 'shift-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('chiến dịch có ca mà đăng ký KHÔNG kèm ca → báo phải chọn ca', async () => {
      shiftCampaign();
      await expect(
        service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF }),
      ).rejects.toThrow('đăng ký trực tiếp theo từng ca');
    });
  });

  it('rejects a banned volunteer application', async () => {
    activeVolunteer('banned');

    await expect(service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a rejected volunteer to resubmit as pending', async () => {
    activeVolunteer();
    prisma.kitchenCampaign.findUnique.mockResolvedValue(campaign);
    prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
      status: 'rejected',
      shiftId: null,
    });

    await service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF });

    expect(prisma.campaignVolunteerAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-1' },
      data: { status: 'pending', shiftId: null, notes: null },
    });
  });

  it('requires GPS coordinates to move an assignment to checked in', async () => {
    prisma.volunteerProfile.findUnique.mockResolvedValue({
      id: 'volunteer-1',
      dedicationPoints: 0,
      user: { status: 'active' },
    });
    prisma.campaignVolunteerAssignment.findUnique.mockResolvedValue({
      id: 'assignment-1',
      volunteerId: 'volunteer-1',
      campaignId: 'campaign-1',
      role: AssignmentRole.CHEF,
      status: 'assigned',
      campaign: { status: 'in_progress', scheduledDate: new Date(), endDate: null },
    });

    await expect(service.advanceTask('assignment-1', 'user-1', {}))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects GPS check-in outside the kitchen radius', async () => {
    prisma.volunteerProfile.findUnique.mockResolvedValue({
      id: 'volunteer-1',
      dedicationPoints: 0,
      user: { status: 'active' },
    });
    prisma.campaignVolunteerAssignment.findUnique.mockResolvedValue({
      id: 'assignment-1',
      volunteerId: 'volunteer-1',
      campaignId: 'campaign-1',
      role: AssignmentRole.CHEF,
      status: 'assigned',
      campaign: { status: 'in_progress', scheduledDate: new Date(), endDate: null },
    });
    prisma.$queryRaw.mockResolvedValue([{ within_radius: false }]);

    await expect(service.advanceTask('assignment-1', 'user-1', { lng: 106.7, lat: 10.8 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  describe('check-in work window', () => {
    const campaignWindow = {
      scheduledDate: new Date('2099-01-01T00:00:00.000Z'),
      endDate: null,
      startTime: '09:00',
      endTime: '10:00',
    };

    const assertWindow = (now: string, shift: { role: string | null; startTime: string; endTime: string } | null = null) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(now));
      return (service as unknown as {
        assertWithinCheckInWindow: (
          campaign: typeof campaignWindow,
          assignedShift: typeof shift,
          role: string,
        ) => void;
      }).assertWithinCheckInWindow(campaignWindow, shift, AssignmentRole.CHEF);
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it('accepts check-in at any time on the campaign day', () => {
      expect(() => assertWindow('2098-12-31T17:00:00.000Z')).not.toThrow();
      expect(() => assertWindow('2099-01-01T15:59:00.000Z')).not.toThrow();
    });

    it('rejects check-in outside the campaign date range', () => {
      expect(() => assertWindow('2098-12-31T16:59:00.000Z')).toThrow(BadRequestException);
      expect(() => assertWindow('2099-01-01T17:00:00.000Z')).toThrow(BadRequestException);
    });

    it('allows an assigned shift role at any time on the campaign day', () => {
      const shift = { role: AssignmentRole.CHEF, startTime: '13:00', endTime: '14:00' };

      expect(() => assertWindow('2099-01-01T02:30:00.000Z', shift)).not.toThrow();
    });

    it('rejects a shift assigned to a different volunteer role', () => {
      expect(() => assertWindow('2099-01-01T02:30:00.000Z', {
        role: AssignmentRole.WAITER,
        startTime: '09:00',
        endTime: '10:00',
      })).toThrow(BadRequestException);
    });
  });

  it('rejects receipt confirmation for a transport outside the charity campaign', async () => {
    prisma.receiverProfile.findUnique.mockResolvedValue({ id: 'receiver-1' });
    prisma.campaignTransport.findFirst.mockResolvedValue(null);

    await expect(service.confirmTransportReceipt('campaign-1', 'transport-1', 'user-1', {}))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.campaignTransport.updateMany).not.toHaveBeenCalled();
  });

  it('rejects receipt confirmation before delivery handoff', async () => {
    prisma.receiverProfile.findUnique.mockResolvedValue({ id: 'receiver-1' });
    prisma.campaignTransport.findFirst.mockResolvedValue({
      id: 'transport-1',
      status: 'in_transit',
      deliveryId: 'delivery-1',
    });

    await expect(service.confirmTransportReceipt('campaign-1', 'transport-1', 'user-1', {}))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campaignTransport.updateMany).not.toHaveBeenCalled();
  });

  it('only receives a delivered transport and records the charity receipt', async () => {
    prisma.receiverProfile.findUnique.mockResolvedValue({ id: 'receiver-1' });
    prisma.campaignTransport.findFirst.mockResolvedValue({
      id: 'transport-1',
      status: 'delivered',
      deliveryId: 'delivery-1',
    });
    prisma.campaignTransport.updateMany.mockResolvedValue({ count: 1 });
    prisma.campaignTransport.findUnique.mockResolvedValue({
      id: 'transport-1',
      status: 'received',
      providerRequest: {
        provider: { userId: 'provider-user-1' },
        campaign: { title: 'Bếp cộng đồng' },
      },
    });

    await service.confirmTransportReceipt('campaign-1', 'transport-1', 'user-1', {
      note: '  Đã kiểm tra đủ hàng.  ',
    });

    expect(prisma.campaignTransport.updateMany).toHaveBeenCalledWith({
      where: { id: 'transport-1', status: 'delivered' },
      data: expect.objectContaining({
        status: 'received',
        receivedByUserId: 'user-1',
        receiptNote: 'Đã kiểm tra đủ hàng.',
        receiptPhotoUrl: null,
      }),
    });
  });

  it('returns a previously received transport without updating it again', async () => {
    const receivedTransport = { id: 'transport-1', status: 'received' };
    prisma.receiverProfile.findUnique.mockResolvedValue({ id: 'receiver-1' });
    prisma.campaignTransport.findFirst.mockResolvedValue({
      id: 'transport-1',
      status: 'received',
      deliveryId: 'delivery-1',
    });
    prisma.campaignTransport.findUnique.mockResolvedValue(receivedTransport);

    await expect(service.confirmTransportReceipt('campaign-1', 'transport-1', 'user-1', {}))
      .resolves.toEqual(receivedTransport);
    expect(prisma.campaignTransport.updateMany).not.toHaveBeenCalled();
  });
});

describe('CampaignsService.createDistribution', () => {
  let service: CampaignsService;
  const prisma = {
    receiverProfile: { findUnique: jest.fn() },
    kitchenCampaign: { findUnique: jest.fn() },
    campaignVolunteerAssignment: { findFirst: jest.fn() },
    mealDistribution: { aggregate: jest.fn(), create: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyAdmins: jest.fn() } },
        { provide: StorageService, useValue: { saveImage: jest.fn() } },
        { provide: SystemConfigService, useValue: {} },
        { provide: DeliveriesService, useValue: { broadcastToNearbyShippers: jest.fn() } },
        { provide: DishStepsService, useValue: { getStepsForCampaign: jest.fn().mockResolvedValue({ dishes: [], cookingTeam: [], safetyLogs: [] }) } },
      ],
    }).compile();
    service = moduleRef.get(CampaignsService);

    // assertOwner: receiver khớp charityReceiverId của campaign
    prisma.receiverProfile.findUnique.mockResolvedValue({ id: 'receiver-1' });
    prisma.kitchenCampaign.findUnique.mockResolvedValue({
      id: 'campaign-1',
      charityReceiverId: 'receiver-1',
      status: 'in_progress',
      expectedServings: 100,
    });
    prisma.mealDistribution.aggregate.mockResolvedValue({
      _sum: { servingsServed: 0, leftoverServings: 0 },
    });
    prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue({
      id: 'a-1',
      volunteerId: 'vol-1',
    });
    prisma.mealDistribution.create.mockImplementation(({ data }) => Promise.resolve({ id: 'd-1', ...data }));
  });

  const base = { servingsServed: 50, peopleServed: 40 };

  it('ghi nhận được đợt phát hợp lệ', async () => {
    const r = await service.createDistribution('campaign-1', 'user-1', base);
    expect(r).toEqual(expect.objectContaining({ servingsServed: 50, peopleServed: 40 }));
  });

  it('số người nhận KHÔNG được lớn hơn số suất — mỗi người ít nhất 1 suất', async () => {
    await expect(
      service.createDistribution('campaign-1', 'user-1', { servingsServed: 10, peopleServed: 25 }),
    ).rejects.toThrow('không thể lớn hơn số suất đã phát');
  });

  it('không phát vượt số suất chiến dịch đăng ký', async () => {
    prisma.mealDistribution.aggregate.mockResolvedValue({
      _sum: { servingsServed: 80, leftoverServings: 5 },
    });
    await expect(
      service.createDistribution('campaign-1', 'user-1', { servingsServed: 20, peopleServed: 20 }),
    ).rejects.toThrow('chỉ còn 15 suất');
  });

  it('suất THỪA cũng tính vào hạn mức — cùng một mẻ nấu', async () => {
    prisma.mealDistribution.aggregate.mockResolvedValue({
      _sum: { servingsServed: 90, leftoverServings: 0 },
    });
    await expect(
      service.createDistribution('campaign-1', 'user-1', {
        servingsServed: 5,
        peopleServed: 5,
        leftoverServings: 10,
      }),
    ).rejects.toThrow('chỉ còn 10 suất');
  });

  it('người phụ trách phải thuộc CHÍNH chiến dịch này', async () => {
    prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue(null);
    await expect(
      service.createDistribution('campaign-1', 'user-1', {
        ...base,
        servedByVolunteerId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow('tình nguyện viên đã được duyệt của chiến dịch này');
  });

  it('chưa duyệt TNV nào thì không cho ghi nhận (không lấy đại người ngoài)', async () => {
    prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue(null);
    await expect(service.createDistribution('campaign-1', 'user-1', base)).rejects.toThrow(
      'chưa có tình nguyện viên nào được duyệt',
    );
    expect(prisma.mealDistribution.create).not.toHaveBeenCalled();
  });
});
