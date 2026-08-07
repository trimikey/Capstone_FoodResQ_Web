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
