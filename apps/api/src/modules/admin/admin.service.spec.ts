import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

describe('AdminService', () => {
  let service: AdminService;
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
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
      ],
    }).compile();
    service = moduleRef.get(AdminService);
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
