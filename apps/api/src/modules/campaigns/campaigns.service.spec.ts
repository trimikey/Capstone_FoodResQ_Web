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
import { TrustService } from '@/modules/trust/trust.service';

describe('CampaignsService', () => {
  let service: CampaignsService;
  const prisma = {
    volunteerProfile: { findUnique: jest.fn() },
    kitchenCampaign: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    // `count` được service gọi khi kiểm tra ca làm — thiếu mock thì 3 test apply() đỏ
    campaignShift: { findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    campaignVolunteerAssignment: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
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
    prisma.campaignShift.findUnique.mockReset();
    prisma.campaignVolunteerAssignment.findFirst.mockReset();
    prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue(null);
    prisma.campaignVolunteerAssignment.count.mockResolvedValue(0);
    prisma.campaignShift.count.mockResolvedValue(0);
    prisma.campaignVolunteerAssignment.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    prisma.$queryRaw.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: StorageService, useValue: { saveImage: jest.fn() } },
        { provide: SystemConfigService, useValue: { getNumber: jest.fn(async (k: string) => {
          if (k === 'CHECKIN_GPS_RADIUS_M') return 500;
          if (k === 'CAMPAIGN_MIN_FILL_PERCENT') return 50;
          return 0;
        }) } },
        { provide: DeliveriesService, useValue: { broadcastToNearbyShippers: jest.fn() } },
        { provide: DishStepsService, useValue: { getStepsForCampaign: jest.fn().mockResolvedValue({ dishes: [], cookingTeam: [], safetyLogs: [] }) } },
        { provide: TrustService, useValue: { applyDelta: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(CampaignsService);
  });

  const campaign = {
    id: 'campaign-1',
    status: 'approved',
    recruitmentStatus: 'open',
    recruitmentStartAt: new Date('2000-01-01T00:00:00.000Z'),
    recruitmentEndAt: new Date('2100-01-01T00:00:00.000Z'),
    scheduledDate: new Date('2099-01-01T00:00:00.000Z'),
    // `apply` chốt hạn đăng ký theo NGÀY KẾT THÚC + giờ kết thúc, nên mock phải có đủ
    // hai trường này — thiếu là ném TypeError thay vì lỗi nghiệp vụ.
    endDate: new Date('2099-01-01T00:00:00.000Z'),
    startTime: '08:00',
    endTime: '17:00',
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
        .mockResolvedValueOnce({ id: 'shift-2', campaignId: 'campaign-1', role: 'chef', label: 'Ca chiều', startTime: '11:00', endTime: '16:00' })
        .mockResolvedValueOnce({ startTime: '11:00', endTime: '16:00' });
      prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue(null);
      prisma.campaignVolunteerAssignment.findMany.mockResolvedValue([
        { workDate: campaign.scheduledDate, shift: { label: 'Ca sáng', startTime: '06:00', endTime: '11:00', endDayOffset: 0 } },
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
        .mockResolvedValueOnce({ id: 'shift-2', campaignId: 'campaign-1', role: 'chef', label: 'Ca nấu', startTime: '10:00', endTime: '16:00' })
        .mockResolvedValueOnce({ startTime: '10:00', endTime: '16:00' });
      prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue(null);
      prisma.campaignVolunteerAssignment.findMany.mockResolvedValue([
        { workDate: campaign.scheduledDate, shift: { label: 'Ca sơ chế', startTime: '06:00', endTime: '12:00', endDayOffset: 0 } },
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
        startTime: '06:00',
        endTime: '11:00',
      });
      prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue({ id: 'a-1', status: 'pending' });

      await expect(
        service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF, shiftId: 'shift-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    /**
     * Hạn đăng ký tính theo BUỔI CUỐI CÙNG của ca trong khoảng ngày chiến dịch.
     * Mốc UTC → giờ VN (+7): 2099-01-01T08:00Z = 2099-01-01 15:00 VN.
     */
    describe('ca đã qua giờ', () => {
      afterEach(() => jest.useRealTimers());

      const morningShift = {
        id: 'shift-1',
        campaignId: 'campaign-1',
        role: 'chef',
        label: 'Lấy nguyên liệu sáng',
        startTime: '04:30',
        endTime: '06:00',
      };

      it('chặn khi chiến dịch MỘT NGÀY và ca sáng đã kết thúc', async () => {
        activeVolunteer();
        // Chiến dịch chỉ diễn ra 01/01; bây giờ là 15:00 VN cùng ngày → ca 04:30–06:00
        // không còn buổi nào.
        prisma.kitchenCampaign.findUnique.mockResolvedValue(campaign);
        prisma.campaignShift.count.mockResolvedValue(2);
        prisma.campaignShift.findUnique.mockResolvedValue(morningShift);
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2099-01-01T08:00:00.000Z'));

        await expect(
          service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF, shiftId: 'shift-1' }),
        ).rejects.toThrow('đã qua');
        expect(prisma.campaignVolunteerAssignment.create).not.toHaveBeenCalled();
      });

      /** Chiến dịch 01/01 → 03/01, bây giờ 15:00 VN ngày 01/01. */
      function multiDayNow() {
        activeVolunteer();
        prisma.kitchenCampaign.findUnique.mockResolvedValue({
          ...campaign,
          endDate: new Date('2099-01-03T00:00:00.000Z'),
        });
        prisma.campaignShift.count.mockResolvedValue(2);
        prisma.campaignShift.findUnique.mockResolvedValue(morningShift);
        prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue(null);
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2099-01-01T08:00:00.000Z'));
      }

      it('vẫn cho đăng ký ca sáng NGÀY MAI khi chiến dịch còn ngày kế tiếp', async () => {
        // Cùng thời điểm ca sáng hôm nay đã qua, nhưng buổi 02/01 vẫn còn.
        multiDayNow();

        await expect(
          service.apply('campaign-1', 'user-1', {
            role: AssignmentRole.CHEF,
            shiftId: 'shift-1',
            workDate: '2099-01-02',
          }),
        ).resolves.toEqual(expect.objectContaining({ message: expect.stringContaining('chờ tổ chức duyệt') }));

        expect(prisma.campaignVolunteerAssignment.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ workDate: new Date('2099-01-02T00:00:00.000Z') }),
        });
      });

      it('vẫn chặn ca sáng của CHÍNH HÔM NAY dù chiến dịch còn ngày sau', async () => {
        multiDayNow();

        await expect(
          service.apply('campaign-1', 'user-1', {
            role: AssignmentRole.CHEF,
            shiftId: 'shift-1',
            workDate: '2099-01-01',
          }),
        ).rejects.toThrow('đã qua');
      });

      it('bắt chọn ngày khi chiến dịch diễn ra nhiều ngày', async () => {
        multiDayNow();

        await expect(
          service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF, shiftId: 'shift-1' }),
        ).rejects.toThrow('hãy chọn ngày');
      });

      it('từ chối ngày nằm ngoài thời gian chiến dịch', async () => {
        multiDayNow();

        await expect(
          service.apply('campaign-1', 'user-1', {
            role: AssignmentRole.CHEF,
            shiftId: 'shift-1',
            workDate: '2099-01-09',
          }),
        ).rejects.toThrow('không nằm trong thời gian diễn ra');
      });
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
      data: {
        status: 'pending', shiftId: null, workDate: campaign.scheduledDate, notes: null,
        confirmationStatus: 'pending', confirmedAt: null,
      },
    });
  });

  it.each(['scheduled', 'staffed'] as const)(
    'cho đăng ký khi trạng thái tuyển là %s và đang nằm trong khung giờ tuyển',
    async (recruitmentStatus) => {
      activeVolunteer();
      prisma.kitchenCampaign.findUnique.mockResolvedValue({
        ...campaign,
        recruitmentStatus,
      });
      prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.apply('campaign-1', 'user-1', { role: AssignmentRole.CHEF }),
      ).resolves.toEqual(expect.objectContaining({ message: expect.stringContaining('chờ tổ chức duyệt') }));
    },
  );

  it('hiển thị chiến dịch đã duyệt sắp mở tuyển và chiến dịch đã đủ ngưỡng', async () => {
    prisma.kitchenCampaign.findMany.mockResolvedValue([]);

    await service.listOpen();

    expect(prisma.kitchenCampaign.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { status: 'in_progress' },
          expect.objectContaining({
            status: 'approved',
            recruitmentStatus: { in: ['scheduled', 'open', 'staffed'] },
            recruitmentEndAt: { gt: expect.any(Date) },
          }),
        ],
      },
    }));
  });

  describe('vòng đời tuyển tách biệt', () => {
    const lifecycleCampaign = {
      ...campaign,
      operationStartAt: new Date('2099-01-01T00:00:00.000Z'),
      operationEndAt: new Date('2099-01-01T12:00:00.000Z'),
      recruitmentStartAt: new Date('2098-12-01T00:00:00.000Z'),
      recruitmentEndAt: new Date('2098-12-31T00:00:00.000Z'),
      recruitmentBufferHours: 24,
      charityReceiver: { userId: 'charity-1' },
      scheduledDate: new Date('2099-01-01T00:00:00.000Z'),
      endDate: new Date('2099-01-01T00:00:00.000Z'),
      shifts: [
        { id: 'morning-chef', label: 'Ca sáng — Đầu bếp', role: 'chef', period: 'morning', startTime: '06:00', endTime: '12:00', endDayOffset: 0, slotsNeeded: 2, needsReview: false },
      ],
      assignments: [
        { id: 'a-1', volunteerId: 'v-1', shiftId: 'morning-chef', workDate: new Date('2099-01-01T00:00:00.000Z'), role: 'chef', confirmationStatus: 'confirmed', volunteer: { userId: 'user-1' } },
      ],
    };

    it('không coi tổng chiến dịch là đủ khi một ca còn thiếu', async () => {
      prisma.kitchenCampaign.findUnique.mockResolvedValue(lifecycleCampaign);
      const result = await service.getStaffingReadiness('campaign-1');
      expect(result.ready).toBe(false);
      expect(result.eligibleToStart).toBe(true);
      expect(result.matrix[0]).toEqual(expect.objectContaining({ confirmed: 1, minRequired: 2, minimumRequired: 1, fillPercent: 50, missing: 1 }));
    });

    it('tách số đã phân công khỏi số tình nguyện viên đã xác nhận', async () => {
      prisma.kitchenCampaign.findUnique.mockResolvedValue({
        ...lifecycleCampaign,
        assignments: [
          { ...lifecycleCampaign.assignments[0], confirmationStatus: 'pending' },
        ],
      });

      const result = await service.getStaffingReadiness('campaign-1');

      expect(result).toEqual(expect.objectContaining({
        assignedShiftSlots: 1,
        confirmedShiftSlots: 0,
        assignedUniqueVolunteers: 1,
        confirmedUniqueVolunteers: 0,
        eligibleToStart: false,
      }));
      expect(result.matrix[0]).toEqual(expect.objectContaining({ assigned: 1, confirmed: 0 }));
    });

    it('tự bắt đầu đúng giờ khi từng ca đủ 100%', async () => {
      const readyCampaign = {
        ...lifecycleCampaign,
        assignments: [
          ...lifecycleCampaign.assignments,
          { id: 'a-2', volunteerId: 'v-2', shiftId: 'morning-chef', workDate: new Date('2099-01-01T00:00:00.000Z'), role: 'chef', confirmationStatus: 'confirmed', volunteer: { userId: 'user-2' } },
        ],
      };
      prisma.kitchenCampaign.findMany.mockResolvedValue([{ id: 'campaign-1', operationStartAt: readyCampaign.operationStartAt }]);
      prisma.kitchenCampaign.findUnique.mockResolvedValue(readyCampaign);

      const result = await service.advanceRecruitmentLifecycle(new Date('2099-01-01T00:00:00.000Z'));

      expect(result.started).toBe(1);
      expect(prisma.kitchenCampaign.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'campaign-1' },
        data: { status: 'in_progress', recruitmentStatus: 'closed_ready' },
      }));
    });

    it('đạt ngưỡng tối thiểu nhưng chưa đủ 100% thì chờ tổ chức xác nhận bắt đầu', async () => {
      prisma.kitchenCampaign.findMany.mockResolvedValue([{ id: 'campaign-1', operationStartAt: lifecycleCampaign.operationStartAt }]);
      prisma.kitchenCampaign.findUnique.mockResolvedValue(lifecycleCampaign);

      const result = await service.advanceRecruitmentLifecycle(new Date('2099-01-01T00:00:00.000Z'));

      expect(result.started).toBe(0);
      expect(prisma.kitchenCampaign.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { recruitmentStatus: 'closed_ready' },
      }));
    });

    it('không cho bắt đầu khi một ca/vai trò chưa đạt ngưỡng admin', async () => {
      const underMinimum = { ...lifecycleCampaign, assignments: [] };
      prisma.kitchenCampaign.findMany.mockResolvedValue([{ id: 'campaign-1', operationStartAt: underMinimum.operationStartAt }]);
      prisma.kitchenCampaign.findUnique.mockResolvedValue(underMinimum);

      const result = await service.advanceRecruitmentLifecycle(new Date('2099-01-01T00:00:00.000Z'));

      expect(result.started).toBe(0);
      expect(prisma.kitchenCampaign.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { recruitmentStatus: 'expired_understaffed' },
      }));
    });

    it('không cho xác nhận ca sau hạn tuyển', async () => {
      prisma.campaignVolunteerAssignment.findUnique.mockResolvedValue({
        id: 'a-1', campaignId: 'campaign-1', volunteerId: 'v-1', shiftId: 'morning-chef',
        role: 'chef', status: 'assigned', confirmationStatus: 'pending',
        volunteer: { userId: 'user-1' },
        campaign: { id: 'campaign-1', status: 'approved', recruitmentEndAt: new Date('2000-12-31T00:00:00.000Z') },
      });
      prisma.kitchenCampaign.findUnique.mockResolvedValue({
        status: 'approved', recruitmentEndAt: new Date('2000-12-31T00:00:00.000Z'),
      });

      await expect(service.confirmAssignment('a-1', 'user-1', 'confirmed'))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('chặn gia hạn vượt qua khoảng đệm trước ca đầu tiên', async () => {
      prisma.receiverProfile.findUnique.mockResolvedValue({ id: 'receiver-1' });
      prisma.kitchenCampaign.findUnique.mockResolvedValue({
        ...lifecycleCampaign,
        charityReceiverId: 'receiver-1',
        recruitmentEndAt: new Date('2098-12-30T00:00:00.000Z'),
      });

      await expect(service.extendRecruitment(
        'campaign-1', 'charity-user', '2098-12-31T12:00:00.000Z',
      )).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // Bán kính GPS đọc từ `CHECKIN_GPS_RADIUS_M`; mock trả 500 nên khối kiểm tra chạy.
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
      campaign: { status: 'in_progress', scheduledDate: new Date(), endDate: null, startTime: '00:00', endTime: '23:59' },
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
      campaign: { status: 'in_progress', scheduledDate: new Date(), endDate: null, startTime: '00:00', endTime: '23:59' },
    });
    prisma.$queryRaw.mockResolvedValue([{ within_radius: false }]);

    await expect(service.advanceTask('assignment-1', 'user-1', { lng: 106.7, lat: 10.8 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  describe('assertLeadTime — báo trước cho chiến dịch dài ngày', () => {
    afterEach(() => jest.useRealTimers());

    /** Gọi thẳng helper private; mock config trả `leadDays`. */
    const check = (start: string, end: string, leadDays = 3) => {
      jest.useFakeTimers();
      // 2099-01-01T03:00Z = 10:00 giờ VN cùng ngày.
      jest.setSystemTime(new Date('2099-01-01T03:00:00.000Z'));
      const svc = service as unknown as {
        systemConfig: { getNumber: jest.Mock };
        assertLeadTime: (s: string, e: string) => Promise<void>;
      };
      svc.systemConfig.getNumber = jest.fn().mockResolvedValue(leadDays);
      return svc.assertLeadTime(start, end);
    };

    it('cho tạo chiến dịch TRONG NGÀY ngay hôm nay', async () => {
      await expect(check('2099-01-01', '2099-01-01')).resolves.toBeUndefined();
    });

    it('chặn chiến dịch NHIỀU NGÀY bắt đầu quá sát', async () => {
      await expect(check('2099-01-02', '2099-01-04')).rejects.toThrow('ít nhất 3 ngày');
    });

    it('cho chiến dịch nhiều ngày khi đã đủ số ngày báo trước', async () => {
      await expect(check('2099-01-04', '2099-01-06')).resolves.toBeUndefined();
    });

    it('bỏ ràng buộc khi admin đặt 0 ngày', async () => {
      await expect(check('2099-01-01', '2099-01-05', 0)).resolves.toBeUndefined();
    });
  });

  describe('markAbsentVolunteers', () => {
    const staleAssignment = {
      id: 'a-1',
      role: AssignmentRole.CHEF,
      workDate: new Date('2099-01-01T00:00:00.000Z'),
      volunteer: { userId: 'user-1', user: { fullName: 'Nguyễn Văn A' } },
      campaign: { id: 'campaign-1', title: 'Bếp ăn thử', charityReceiver: { userId: 'charity-1' } },
    };

    it('đánh vắng và trừ uy tín TNV đã duyệt mà không điểm danh', async () => {
      prisma.campaignVolunteerAssignment.findMany.mockResolvedValue([staleAssignment]);
      prisma.campaignVolunteerAssignment.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.markAbsentVolunteers()).resolves.toBe(1);

      expect(prisma.campaignVolunteerAssignment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'absent' } }),
      );
    });

    it('không làm gì khi không còn ai bỏ ca', async () => {
      prisma.campaignVolunteerAssignment.findMany.mockResolvedValue([]);

      await expect(service.markAbsentVolunteers()).resolves.toBe(0);
      expect(prisma.campaignVolunteerAssignment.updateMany).not.toHaveBeenCalled();
    });

    // updateMany kèm điều kiện status/checkInTime: người vừa kịp điểm danh giữa lúc
    // cron chạy sẽ không khớp, và khi đó không được phạt ai.
    it('bỏ qua khi bản ghi đã đổi trạng thái giữa chừng', async () => {
      prisma.campaignVolunteerAssignment.findMany.mockResolvedValue([staleAssignment]);
      prisma.campaignVolunteerAssignment.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.markAbsentVolunteers()).resolves.toBe(0);
    });
  });

  describe('check-in work window', () => {
    const campaignWindow = {
      scheduledDate: new Date('2099-01-01T00:00:00.000Z'),
      endDate: null,
      startTime: '09:00',
      endTime: '10:00',
    };

    // Mốc UTC → giờ VN (+7):
    //   2098-12-31T17:00Z = 2099-01-01 00:00 VN  (đúng ngày, trước giờ mở)
    //   2099-01-01T02:30Z = 2099-01-01 09:30 VN  (trong giờ, trễ 30' so với 09:00)
    //   2099-01-01T08:00Z = 2099-01-01 15:00 VN  (quá giờ kết thúc → TRỄ, vẫn cho)
    //   2099-01-01T17:00Z = 2099-01-02 00:00 VN  (sang ngày khác → chặn)
    const checkWindow = (
      now: string,
      shift: { role: string | null; startTime: string; endTime: string } | null = null,
    ) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(now));
      return (service as unknown as {
        evaluateCheckInWindow: (
          campaign: typeof campaignWindow,
          assignedShift: typeof shift,
          role: string,
        ) => { lateMinutes: number };
      }).evaluateCheckInWindow(campaignWindow, shift, AssignmentRole.CHEF);
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it('treats check-in inside the work window as on time', () => {
      expect(checkWindow('2099-01-01T02:00:00.000Z').lateMinutes).toBe(0);
    });

    it('allows late check-in and reports how late it is', () => {
      // 09:30 VN, phải có mặt 09:00 → trễ 30 phút
      expect(checkWindow('2099-01-01T02:30:00.000Z').lateMinutes).toBe(30);
      // 15:00 VN — đã quá giờ kết thúc 10:00 nhưng VẪN cho điểm danh, ghi nhận trễ
      expect(checkWindow('2099-01-01T08:00:00.000Z').lateMinutes).toBe(360);
    });

    it('measures lateness against the assigned shift, not the campaign start', () => {
      const shift = { role: AssignmentRole.CHEF, startTime: '13:00', endTime: '14:00' };
      // 15:00 VN, ca bắt đầu 13:00 → trễ 120 phút (không phải 360 theo giờ chiến dịch)
      expect(checkWindow('2099-01-01T08:00:00.000Z', shift).lateMinutes).toBe(120);
    });

    it('rejects check-in before the campaign opens', () => {
      expect(() => checkWindow('2098-12-31T17:00:00.000Z')).toThrow(BadRequestException);
    });

    it('rejects check-in outside the campaign date range', () => {
      expect(() => checkWindow('2098-12-31T16:59:00.000Z')).toThrow(BadRequestException);
      expect(() => checkWindow('2099-01-01T17:00:00.000Z')).toThrow(BadRequestException);
    });

    it('rejects a shift assigned to a different volunteer role', () => {
      expect(() => checkWindow('2099-01-01T02:30:00.000Z', {
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
        { provide: SystemConfigService, useValue: { getNumber: jest.fn(async (k: string) => (k === 'CHECKIN_GPS_RADIUS_M' ? 500 : 0)) } },
        { provide: DeliveriesService, useValue: { broadcastToNearbyShippers: jest.fn() } },
        { provide: DishStepsService, useValue: { getStepsForCampaign: jest.fn().mockResolvedValue({ dishes: [], cookingTeam: [], safetyLogs: [] }) } },
        { provide: TrustService, useValue: { applyDelta: jest.fn() } },
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

  it('ghi nhận được đợt phát hợp lệ — số người luôn ÉP BẰNG số suất (1 suất = 1 người)', async () => {
    const r = await service.createDistribution('campaign-1', 'user-1', base);
    expect(r).toEqual(expect.objectContaining({ servingsServed: 50, peopleServed: 50 }));
  });

  it('client gửi số người lệch vẫn bị ép bằng số suất — không tin client', async () => {
    const r = await service.createDistribution('campaign-1', 'user-1', { servingsServed: 10, peopleServed: 25 });
    expect(r).toEqual(expect.objectContaining({ servingsServed: 10, peopleServed: 10 }));
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
