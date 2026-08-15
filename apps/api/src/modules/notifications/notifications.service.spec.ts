import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PrismaService } from '@/prisma/prisma.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  const prisma = {
    notification: { create: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };
  const gateway = { emitToUser: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.notification.create.mockImplementation(({ data }) => Promise.resolve({ id: 'n-1', ...data }));
    prisma.user.findUnique.mockResolvedValue({ fcmToken: null });
    prisma.user.update.mockResolvedValue({});
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsGateway, useValue: gateway },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  const input = { type: 'campaign', title: 'Yêu cầu mới', body: 'Có việc cần duyệt' };

  it('notifyAdmins gửi cho MỌI admin đang hoạt động', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);

    await expect(service.notifyAdmins(input)).resolves.toBe(2);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'admin', deletedAt: null },
      select: { id: true },
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    // Mỗi admin phải nhận được cả bản ghi DB lẫn sự kiện real-time
    expect(gateway.emitToUser).toHaveBeenCalledWith('admin-1', 'notification:new', expect.anything());
    expect(gateway.emitToUser).toHaveBeenCalledWith('admin-2', 'notification:new', expect.anything());
  });

  it('không có admin nào → 0, không nổ', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await expect(service.notifyAdmins(input)).resolves.toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('lỗi DB không được ném ra ngoài — thông báo hỏng không chặn nghiệp vụ chính', async () => {
    prisma.user.findMany.mockRejectedValue(new Error('db down'));
    await expect(service.notifyAdmins(input)).resolves.toBe(0);
  });

  it('notify() nuốt lỗi và trả null thay vì ném', async () => {
    prisma.notification.create.mockRejectedValue(new Error('db down'));
    await expect(service.notify('user-1', input)).resolves.toBeNull();
    expect(gateway.emitToUser).not.toHaveBeenCalled();
  });
});
