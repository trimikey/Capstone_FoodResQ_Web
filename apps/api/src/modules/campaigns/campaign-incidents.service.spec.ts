import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CampaignIncidentsService } from './campaign-incidents.service';

function build() {
  const prisma = {
    volunteerProfile: {
      findUnique: jest.fn().mockResolvedValue({ id: 'vol-1', user: { fullName: 'Shipper A', phone: '0900' } }),
    },
    kitchenCampaign: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'c1',
        title: 'Bếp Q3',
        status: 'in_progress',
        charityReceiver: { userId: 'org-1' },
      }),
    },
    campaignVolunteerAssignment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'a1' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]),
    },
    campaignProviderRequest: {
      findFirst: jest.fn().mockResolvedValue({
        demandDetails: { ingredientName: 'Gạo sạch' },
        pickupAssigneeIds: ['a1', 'a2'],
        ingredientPickup: null,
        provider: { businessName: 'Vựa gạo' },
      }),
      findUnique: jest.fn().mockResolvedValue({ pickupAssigneeIds: ['a1', 'a2'] }),
      update: jest.fn().mockResolvedValue({}),
    },
    mealDistribution: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    campaignIncident: {
      create: jest.fn(({ data }) => Promise.resolve({ id: 'inc-1', ...data })),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const notifications = { notify: jest.fn() };
  const storage = { saveImage: jest.fn().mockResolvedValue('https://img/1.jpg') };
  const campaigns = { assignRequestPickup: jest.fn().mockResolvedValue({}) };
  const service = new CampaignIncidentsService(
    prisma as never,
    notifications as never,
    storage as never,
    campaigns as never,
  );
  return { service, prisma, notifications, campaigns };
}

describe('CampaignIncidentsService.report — shipper báo sự cố trong chiến dịch', () => {
  it('ghi sự cố và báo tổ chức ngay, kèm việc đang làm', async () => {
    const { service, notifications } = build();
    const r = await service.report('c1', 'user-1', {
      context: 'pickup',
      referenceId: '11111111-1111-4111-8111-111111111111',
      reasonCode: 'provider_closed',
    });
    expect(r.reasonLabel).toContain('NCC đóng cửa');
    expect(notifications.notify).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ body: expect.stringContaining('Gạo sạch tại Vựa gạo') }),
    );
  });

  it("chọn 'Sự cố khác' mà không mô tả thì chặn", async () => {
    const { service } = build();
    await expect(
      service.report('c1', 'user-1', { context: 'distribution', reasonCode: 'other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lý do không thuộc bộ của loại việc thì chặn', async () => {
    const { service } = build();
    await expect(
      service.report('c1', 'user-1', { context: 'pickup', reasonCode: 'food_damaged' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('không trực ca vận hành của chiến dịch thì không báo được', async () => {
    const { service, prisma } = build();
    prisma.campaignVolunteerAssignment.findFirst.mockResolvedValue(null);
    await expect(
      service.report('c1', 'user-1', { context: 'distribution', reasonCode: 'vehicle_broken' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('CampaignIncidentsService — không thể tiếp tục → gỡ người, tổ chức đổi shipper', () => {
  const REQ = '11111111-1111-4111-8111-111111111111';

  it('không tiếp tục được: gỡ ca của người báo khỏi đơn nguyên liệu, báo tổ chức cần đổi shipper', async () => {
    const { service, prisma, notifications } = build();
    await service.report('c1', 'user-1', {
      context: 'pickup',
      referenceId: REQ,
      reasonCode: 'vehicle_broken',
      canContinue: false,
    });
    expect(prisma.campaignProviderRequest.update).toHaveBeenCalledWith({
      where: { id: REQ },
      data: { pickupAssigneeIds: ['a2'] },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ title: expect.stringContaining('CẦN ĐỔI SHIPPER') }),
    );
  });

  it('không tiếp tục được mà không nói đang dở việc nào thì chặn', async () => {
    const { service } = build();
    await expect(
      service.report('c1', 'user-1', { context: 'pickup', reasonCode: 'accident', canContinue: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('vẫn tiếp tục: không gỡ ai, ghi số phút trễ', async () => {
    const { service, prisma } = build();
    await service.report('c1', 'user-1', {
      context: 'pickup',
      referenceId: REQ,
      reasonCode: 'traffic_weather',
      delayMinutes: 20,
    });
    expect(prisma.campaignProviderRequest.update).not.toHaveBeenCalled();
    expect(prisma.campaignIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ canContinue: true, delayMinutes: 20 }) }),
    );
  });

  it('tổ chức đổi shipper cho đơn nguyên liệu: dùng luồng phân công sẵn có rồi khép sự cố', async () => {
    const { service, prisma, campaigns } = build();
    prisma.campaignIncident.findUnique.mockResolvedValue({
      id: 'inc-1',
      context: 'pickup',
      referenceId: REQ,
      campaignId: 'c1',
      campaign: { id: 'c1', title: 'Bếp Q3', charityReceiver: { userId: 'org-1' } },
    });
    prisma.campaignProviderRequest.findUnique.mockResolvedValue({ pickupAssigneeIds: ['a2'] });
    prisma.campaignVolunteerAssignment.findMany.mockResolvedValue([
      { volunteer: { user: { fullName: 'Shipper B' } } },
    ]);
    const r = await service.reassign('inc-1', 'org-1', ['a3']);
    expect(campaigns.assignRequestPickup).toHaveBeenCalledWith(REQ, 'org-1', { assignmentIds: ['a2', 'a3'] });
    expect(r.actionTaken).toBe('reassigned');
  });
});
