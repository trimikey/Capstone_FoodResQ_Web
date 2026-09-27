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
    campaignVolunteerAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) },
    campaignProviderRequest: {
      findFirst: jest.fn().mockResolvedValue({
        demandDetails: { ingredientName: 'Gạo sạch' },
        provider: { businessName: 'Vựa gạo' },
      }),
    },
    mealDistribution: { findFirst: jest.fn() },
    campaignIncident: {
      create: jest.fn(({ data }) => Promise.resolve({ id: 'inc-1', ...data })),
    },
  };
  const notifications = { notify: jest.fn() };
  const storage = { saveImage: jest.fn().mockResolvedValue('https://img/1.jpg') };
  const service = new CampaignIncidentsService(prisma as never, notifications as never, storage as never);
  return { service, prisma, notifications };
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
