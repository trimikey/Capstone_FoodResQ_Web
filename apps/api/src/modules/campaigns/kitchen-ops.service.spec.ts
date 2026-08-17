import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { UserRole } from '@foodresq/types';
import { KitchenOpsService } from './kitchen-ops.service';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { StorageService } from '@/common/storage/storage.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';

describe('KitchenOpsService', () => {
  let service: KitchenOpsService;
  const prisma = {
    volunteerProfile: { findUnique: jest.fn() },
    receiverProfile: { findUnique: jest.fn() },
    kitchenCampaign: { findUnique: jest.fn() },
    campaignVolunteerAssignment: { findFirst: jest.fn() },
    mealDistribution: { create: jest.fn(), findUnique: jest.fn() },
    mealFeedback: { create: jest.fn() },
    receiverHandoffQr: { findUnique: jest.fn(), updateMany: jest.fn() },
    mealHandoff: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    beneficiaryFeedback: { create: jest.fn(), aggregate: jest.fn() },
    user: { findUnique: jest.fn() },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        KitchenOpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: StorageService, useValue: { saveImage: jest.fn() } },
        { provide: SystemConfigService, useValue: { getNumber: jest.fn().mockResolvedValue(5) } },
      ],
    }).compile();
    service = moduleRef.get(KitchenOpsService);
  });

  function allowWaiter() {
    prisma.volunteerProfile.findUnique.mockResolvedValue({
      id: 'waiter-1',
      user: { status: 'active' },
      specializations: [{ id: 'specialization-1' }],
    });
    prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
  }

  it('records a distribution under the authorized waiter', async () => {
    allowWaiter();
    prisma.kitchenCampaign.findUnique.mockResolvedValue({ status: 'in_progress' });
    prisma.mealDistribution.create.mockResolvedValue({ id: 'distribution-1' });

    await service.createDistribution('campaign-1', 'user-1', {
      servingsServed: 20,
      peopleServed: 18,
      leftoverServings: 2,
      lng: 106.7,
      lat: 10.8,
    });

    expect(prisma.mealDistribution.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        campaignId: 'campaign-1',
        servedByVolunteerId: 'waiter-1',
        servingsServed: 20,
        // 1 suất = 1 người: số người bị ép bằng số suất, bỏ qua giá trị client gửi
        peopleServed: 20,
      }),
    }));
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('forces people served to equal portions even when client sends a mismatch', async () => {
    allowWaiter();
    prisma.kitchenCampaign.findUnique.mockResolvedValue({ status: 'in_progress' });
    prisma.mealDistribution.create.mockResolvedValue({ id: 'distribution-1' });

    await service.createDistribution('campaign-1', 'user-1', {
      servingsServed: 10,
      peopleServed: 11,
    });
    expect(prisma.mealDistribution.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ servingsServed: 10, peopleServed: 10 }),
    }));
  });

  it('rejects one-sided distribution coordinates', async () => {
    allowWaiter();
    prisma.kitchenCampaign.findUnique.mockResolvedValue({ status: 'in_progress' });

    await expect(service.createDistribution('campaign-1', 'user-1', {
      servingsServed: 10,
      peopleServed: 10,
      lng: 106.7,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only allows the serving waiter to record distribution feedback', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'active',
      role: UserRole.VOLUNTEER,
      volunteerProfile: { id: 'waiter-1' },
    });
    prisma.mealDistribution.findUnique.mockResolvedValue({
      id: 'distribution-1',
      campaignId: 'campaign-1',
      servedByVolunteerId: 'another-waiter',
    });

    await expect(service.addFeedback('distribution-1', 'user-1', { satisfaction: 5 }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.mealFeedback.create).not.toHaveBeenCalled();
  });

  it('records feedback for the waiter who served the distribution', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'active',
      role: UserRole.VOLUNTEER,
      volunteerProfile: { id: 'waiter-1' },
    });
    prisma.mealDistribution.findUnique.mockResolvedValue({
      id: 'distribution-1',
      campaignId: 'campaign-1',
      servedByVolunteerId: 'waiter-1',
    });
    prisma.mealFeedback.create.mockResolvedValue({ id: 'feedback-1' });

    await service.addFeedback('distribution-1', 'user-1', {
      satisfaction: 5,
      comment: '  Phục vụ chu đáo.  ',
    });

    expect(prisma.mealFeedback.create).toHaveBeenCalledWith({
      data: {
        distributionId: 'distribution-1',
        satisfaction: 5,
        comment: 'Phục vụ chu đáo.',
      },
    });
  });

  describe('beneficiary handoff QR and feedback', () => {
    const qrToken = 'a'.repeat(64);

    function activeIndividualReceiver() {
      prisma.receiverProfile.findUnique.mockResolvedValue({
        id: 'receiver-1',
        isCharityOrg: false,
        user: { status: 'active', role: UserRole.RECEIVER },
      });
    }

    function validHandoffToken() {
      prisma.receiverHandoffQr.findUnique.mockResolvedValue({
        id: 'qr-1',
        receiverId: 'receiver-1',
        qrExpiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });
    }

    beforeEach(() => {
      prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    });

    it('issues a fresh short-lived QR only to an active individual receiver', async () => {
      activeIndividualReceiver();
      prisma.$queryRaw.mockResolvedValue([{ id: 'qr-1', qr_token: qrToken, qr_expires_at: new Date() }]);

      await expect(service.issueHandoffQr('receiver-user-1')).resolves.toEqual({
        id: 'qr-1', qrToken, expiresAt: expect.any(Date),
      });

      expect(prisma.receiverHandoffQr.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ receiverId: 'receiver-1', consumedAt: null }),
      }));
    });

    it('rejects a charity organization from receiving a beneficiary QR', async () => {
      prisma.receiverProfile.findUnique.mockResolvedValue({
        id: 'charity-1',
        isCharityOrg: true,
        user: { status: 'active', role: UserRole.RECEIVER },
      });

      await expect(service.issueHandoffQr('charity-user-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('records a waiter scan by consuming the valid QR exactly once', async () => {
      allowWaiter();
      prisma.mealDistribution.findUnique.mockResolvedValue({ id: 'distribution-1', campaignId: 'campaign-1' });
      validHandoffToken();
      prisma.mealHandoff.findUnique.mockResolvedValue(null);
      activeIndividualReceiver();
      prisma.receiverHandoffQr.updateMany.mockResolvedValue({ count: 1 });
      prisma.mealHandoff.create.mockResolvedValue({ id: 'handoff-1', receiverId: 'receiver-1' });

      await expect(service.scanHandoff('campaign-1', 'distribution-1', 'waiter-user-1', qrToken))
        .resolves.toEqual({ id: 'handoff-1', receiverId: 'receiver-1', alreadyRecorded: false });

      expect(prisma.mealHandoff.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          distributionId: 'distribution-1',
          receiverId: 'receiver-1',
          scannedByVolunteerId: 'waiter-1',
          qrTokenId: 'qr-1',
        }),
      });
    });

    it('rejects an expired beneficiary QR before it is consumed', async () => {
      allowWaiter();
      prisma.mealDistribution.findUnique.mockResolvedValue({ id: 'distribution-1', campaignId: 'campaign-1' });
      prisma.receiverHandoffQr.findUnique.mockResolvedValue({
        id: 'qr-1', receiverId: 'receiver-1', qrExpiresAt: new Date(Date.now() - 1), consumedAt: null,
      });
      prisma.mealHandoff.findUnique.mockResolvedValue(null);

      await expect(service.scanHandoff('campaign-1', 'distribution-1', 'waiter-user-1', qrToken))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.receiverHandoffQr.updateMany).not.toHaveBeenCalled();
    });

    it('returns an existing handoff when the receiver was already recorded at that distribution', async () => {
      allowWaiter();
      prisma.mealDistribution.findUnique.mockResolvedValue({ id: 'distribution-1', campaignId: 'campaign-1' });
      validHandoffToken();
      prisma.mealHandoff.findUnique.mockResolvedValue({ id: 'handoff-1', feedback: null });

      await expect(service.scanHandoff('campaign-1', 'distribution-1', 'waiter-user-1', qrToken))
        .resolves.toEqual({ id: 'handoff-1', feedback: null, alreadyRecorded: true });
      expect(prisma.receiverHandoffQr.updateMany).not.toHaveBeenCalled();
    });

    it('returns the existing handoff when a concurrent scan won the QR consumption race', async () => {
      allowWaiter();
      prisma.mealDistribution.findUnique.mockResolvedValue({ id: 'distribution-1', campaignId: 'campaign-1' });
      validHandoffToken();
      prisma.mealHandoff.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'handoff-1', feedback: null });
      activeIndividualReceiver();
      prisma.receiverHandoffQr.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.scanHandoff('campaign-1', 'distribution-1', 'waiter-user-1', qrToken))
        .resolves.toEqual({ id: 'handoff-1', feedback: null, alreadyRecorded: true });
      expect(prisma.mealHandoff.create).not.toHaveBeenCalled();
    });

    it('does not allow a receiver to submit feedback for another receiver handoff', async () => {
      activeIndividualReceiver();
      prisma.mealHandoff.findUnique.mockResolvedValue({ id: 'handoff-1', receiverId: 'receiver-2' });

      await expect(service.submitBeneficiaryFeedback('handoff-1', 'receiver-user-1', { satisfaction: 5 }))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.beneficiaryFeedback.create).not.toHaveBeenCalled();
    });

    it('turns the database one-feedback constraint into a conflict', async () => {
      activeIndividualReceiver();
      prisma.mealHandoff.findUnique.mockResolvedValue({ id: 'handoff-1', receiverId: 'receiver-1' });
      prisma.beneficiaryFeedback.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }),
      );

      await expect(service.submitBeneficiaryFeedback('handoff-1', 'receiver-user-1', { satisfaction: 5 }))
        .rejects.toBeInstanceOf(ConflictException);
    });

    it('returns privacy-safe campaign feedback totals', async () => {
      prisma.mealHandoff.count.mockResolvedValue(8);
      prisma.beneficiaryFeedback.aggregate.mockResolvedValue({
        _avg: { satisfaction: 4.375 },
        _count: { _all: 5 },
      });

      await expect(service.beneficiaryFeedbackSummary('campaign-1')).resolves.toEqual({
        verifiedHandoffs: 8,
        feedbackCount: 5,
        avgSatisfaction: 4.38,
      });
    });
  });
});
