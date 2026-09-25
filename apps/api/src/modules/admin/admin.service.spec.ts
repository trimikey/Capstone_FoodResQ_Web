import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';

describe('AdminService', () => {
  let service: AdminService;
  const prisma = {
    user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: SystemConfigService, useValue: { getAll: jest.fn(), set: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  it('trả số điện thoại và ảnh eKYC của receiver/volunteer', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'receiver-id',
        email: 'receiver@example.test',
        fullName: 'Receiver',
        phone: '0901000001',
        role: 'receiver',
        status: 'active',
        trustScore: 100,
        avatarUrl: null,
        createdAt: new Date('2026-08-05T00:00:00.000Z'),
        volunteerProfile: null,
        receiverProfile: { isCharityOrg: false, faceImageUrl: '/uploads/receiver-face.jpg' },
        providerProfile: null,
      },
      {
        id: 'volunteer-id',
        email: 'volunteer@example.test',
        fullName: 'Volunteer',
        phone: '0901000002',
        role: 'volunteer',
        status: 'active',
        trustScore: 100,
        avatarUrl: null,
        createdAt: new Date('2026-08-05T00:00:00.000Z'),
        volunteerProfile: {
          id: 'volunteer-profile-id',
          faceImageUrl: '/uploads/volunteer-face.jpg',
          specializations: [],
        },
        receiverProfile: null,
        providerProfile: null,
      },
      {
        id: 'provider-id',
        email: 'provider@example.test',
        fullName: 'Provider',
        phone: null,
        role: 'provider',
        status: 'active',
        trustScore: 100,
        avatarUrl: null,
        createdAt: new Date('2026-08-05T00:00:00.000Z'),
        volunteerProfile: null,
        receiverProfile: null,
        providerProfile: { id: 'provider-profile-id' },
      },
    ]);

    const users = await service.listUsers();

    expect(users).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'receiver-id', phone: '0901000001', faceImageUrl: '/uploads/receiver-face.jpg' }),
      expect.objectContaining({ id: 'volunteer-id', phone: '0901000002', faceImageUrl: '/uploads/volunteer-face.jpg' }),
      expect.objectContaining({ id: 'provider-id', phone: null, faceImageUrl: null }),
    ]));
  });

  it('không cho đổi trạng thái tài khoản admin', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'admin' });
    await expect(
      service.setUserStatus('u1', 'admin2', { status: 'banned' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ban user thường → revoke refresh token + ghi audit', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', role: 'receiver' });
    const res = await service.setUserStatus('u2', 'admin1', { status: 'banned' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
    expect(res.message).toContain('cập nhật');
  });
});

describe('AdminService.setCampaignStatus — chỉ duyệt khi NCC đã nhận lời đủ nguyên liệu', () => {
  const future = new Date(Date.now() + 3 * 86_400_000);
  const prisma = {
    kitchenCampaign: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const config = { getNumber: jest.fn() };
  const service = new AdminService(prisma as never, { notify: jest.fn() } as never, config as never);

  const campaign = {
    id: 'c1',
    title: 'Bếp Q3',
    status: 'pending_approval',
    recruitmentStartAt: new Date(Date.now() - 3_600_000),
    recruitmentEndAt: future,
    recruitmentStatus: 'scheduled',
    charityReceiver: { userId: 'org-1' },
  };
  const supplies = {
    supplyItems: [{ name: 'Gạo sạch', quantity: 10, unit: 'kg' }],
    providerRequests: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config.getNumber.mockResolvedValue(1);
  });

  it('chưa NCC nào nhận lời → không duyệt được, báo món còn thiếu', async () => {
    prisma.kitchenCampaign.findUnique
      .mockResolvedValueOnce(campaign)
      .mockResolvedValueOnce({ ...supplies, donations: [] });
    await expect(service.setCampaignStatus('c1', 'approved', 'admin-1')).rejects.toThrow('Gạo sạch 10 kg');
    expect(prisma.kitchenCampaign.update).not.toHaveBeenCalled();
  });

  it('NCC đã nhận lời đủ (hàng hứa góp) → duyệt được', async () => {
    prisma.kitchenCampaign.findUnique
      .mockResolvedValueOnce(campaign)
      .mockResolvedValueOnce({ ...supplies, donations: [{ itemName: 'Gạo sạch', quantity: '10 kg', status: 'pledged' }] });
    await expect(service.setCampaignStatus('c1', 'approved', 'admin-1')).resolves.toEqual({ id: 'c1', status: 'approved' });
  });

  it('admin tắt luật trong Cài đặt → duyệt không cần NCC', async () => {
    config.getNumber.mockResolvedValue(0);
    prisma.kitchenCampaign.findUnique.mockResolvedValueOnce(campaign);
    await expect(service.setCampaignStatus('c1', 'approved', 'admin-1')).resolves.toEqual({ id: 'c1', status: 'approved' });
  });
});
