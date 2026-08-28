import { Test } from '@nestjs/testing';
import { VolunteersService } from './volunteers.service';
import { PrismaService } from '@/prisma/prisma.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

/**
 * Trọng tâm: PHẠM VI GHI ĐÈ khi lưu ca giao hàng.
 *
 * Lưới chỉ hiển thị một tuần, nhưng ở chế độ luôn mở TNV được đăng ký mọi ngày tương
 * lai. Nếu server ghi đè cả khoảng đó thay vì đúng tuần client gửi lên, ca của những
 * tuần sau bị xoá sạch trong im lặng — người dùng không hề thấy chúng để mà ngờ.
 */
describe('VolunteersService — lưu ca giao hàng', () => {
  let service: VolunteersService;
  let executeRaw: jest.Mock;
  let getNumber: jest.Mock;

  /** SQL đã chạy, ghép lại thành chuỗi thường để soi mệnh đề DELETE. */
  const executedSql = () =>
    executeRaw.mock.calls.map((c) => (c[0]?.strings ?? []).join('?')).join('\n');

  /** Tham số đã truyền vào các câu SQL (Prisma.sql giữ ở `values`). */
  const executedValues = () => executeRaw.mock.calls.flatMap((c) => c[0]?.values ?? []);

  beforeEach(async () => {
    executeRaw = jest.fn().mockResolvedValue(1);
    getNumber = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        VolunteersService,
        {
          provide: PrismaService,
          useValue: {
            volunteerProfile: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'vol-1',
                specializations: [{ specialization: 'shipper' }],
              }),
            },
            // Chạy callback ngay để test không phải dựng transaction thật.
            $transaction: jest.fn(async (cb: (tx: unknown) => Promise<void>) =>
              cb({ $executeRaw: executeRaw }),
            ),
          },
        },
        { provide: SystemConfigService, useValue: { getNumber } },
        { provide: NotificationsGateway, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(VolunteersService);
  });

  /** Ngày theo lịch VN, dịch từ hôm nay để test không phụ thuộc ngày chạy. */
  const vnDay = (offset: number) =>
    new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);

  it('chỉ xoá trong đúng tuần client gửi lên, không cuốn ca các tuần sau', async () => {
    getNumber.mockResolvedValue(0); // 0 = admin tắt cửa sổ → luôn mở

    const from = vnDay(0);
    const to = vnDay(6);
    await service.setMyDeliveryShifts('user-1', {
      slots: [{ workDate: from, period: 'morning' }],
      from,
      to,
    });

    const sql = executedSql();
    expect(sql).toContain('DELETE FROM delivery_shift_registrations');
    // Có chặn trên → ca của tuần sau nằm ngoài phạm vi xoá.
    expect(sql).toContain('work_date <=');
    expect(executedValues()).toContain(to);
  });

  it('không nới rộng quá cửa sổ: from sớm hơn tuần được mở thì bị kẹp lại', async () => {
    getNumber.mockResolvedValue(12); // cửa sổ 12 tiếng từ trưa Chủ nhật

    // Cố tình xin sửa từ hôm nay, trong khi cửa sổ chỉ cho tuần kế tiếp.
    const call = service.setMyDeliveryShifts('user-1', {
      slots: [{ workDate: vnDay(0), period: 'morning' }],
      from: vnDay(0),
      to: vnDay(6),
    });

    // Ca của hôm nay nằm ngoài tuần được mở (hoặc đang ngoài giờ đăng ký, tuỳ ngày chạy
    // test) → dù lý do nào cũng phải chặn. Kiểm tra bằng "không có SQL nào chạy" thay vì
    // đọc thông điệp lỗi, để khẳng định điều thực sự quan trọng: không ghi gì cả.
    await expect(call).rejects.toThrow();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('từ chối TNV không có chuyên môn giao hàng', async () => {
    getNumber.mockResolvedValue(0);
    const moduleRef = await Test.createTestingModule({
      providers: [
        VolunteersService,
        {
          provide: PrismaService,
          useValue: {
            volunteerProfile: {
              findUnique: jest.fn().mockResolvedValue({ id: 'vol-2', specializations: [] }),
            },
          },
        },
        { provide: SystemConfigService, useValue: { getNumber } },
        { provide: NotificationsGateway, useValue: {} },
      ],
    }).compile();
    const svc = moduleRef.get(VolunteersService);

    await expect(svc.setMyDeliveryShifts('user-2', { slots: [] })).rejects.toThrow(
      /chuyên môn giao hàng/i,
    );
  });
});
