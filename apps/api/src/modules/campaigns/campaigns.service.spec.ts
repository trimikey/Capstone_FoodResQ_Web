import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AssignmentRole } from '@foodresq/types';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { StorageService } from '@/common/storage/storage.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { DeliveriesService } from '@/modules/deliveries/deliveries.service';

describe('CampaignsService', () => {
  let service: CampaignsService;
  const prisma = {
    volunteerProfile: { findUnique: jest.fn() },
    kitchenCampaign: { findUnique: jest.fn() },
    // `count` được service gọi khi kiểm tra ca làm — thiếu mock thì 3 test apply() đỏ
    campaignShift: { findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    campaignVolunteerAssignment: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    receiverProfile: { findUnique: jest.fn() },
    campaignTransport: { findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: StorageService, useValue: { saveImage: jest.fn() } },
        { provide: SystemConfigService, useValue: {} },
        { provide: DeliveriesService, useValue: { broadcastToNearbyShippers: jest.fn() } },
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
