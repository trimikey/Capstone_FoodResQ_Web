import { Test } from '@nestjs/testing';
import { EsgService } from './esg.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('EsgService', () => {
  let service: EsgService;
  let queryRaw: jest.Mock;
  let findProvider: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn();
    findProvider = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        EsgService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: queryRaw,
            providerProfile: { findUnique: findProvider },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(EsgService);
  });

  it('platform ESG: CO2 = kg × 2.5 và làm tròn 1 chữ số', async () => {
    queryRaw
      .mockResolvedValueOnce([{ kg: 100, completed: 40n }]) // tổng kg + suất
      .mockResolvedValueOnce([{ providers: 5n, volunteers: 3n }]); // số lượng

    const r = await service.getPlatformEsg();

    expect(r.kgRescued).toBe(100);
    expect(r.co2SavedKg).toBe(250); // 100 * 2.5
    expect(r.mealsServed).toBe(40);
    expect(r.providers).toBe(5);
    expect(r.volunteers).toBe(3);
  });

  it('platform ESG: xử lý kg null → 0', async () => {
    queryRaw
      .mockResolvedValueOnce([{ kg: null, completed: 0n }])
      .mockResolvedValueOnce([{ providers: 0n, volunteers: 0n }]);

    const r = await service.getPlatformEsg();
    expect(r.kgRescued).toBe(0);
    expect(r.co2SavedKg).toBe(0);
  });

  describe('getProviderReport', () => {
    /** 6 lần $queryRaw theo đúng thứ tự service gọi: 4 khối báo cáo rồi tới getProviderEsg. */
    function mockReportQueries(monthly: unknown[]) {
      findProvider.mockResolvedValue({
        id: 'prov-1',
        businessName: 'Bếp Test',
      });
      queryRaw
        .mockResolvedValueOnce(monthly)
        .mockResolvedValueOnce([{ category: 'bakery', kg: 0.96, meals: 5n }])
        .mockResolvedValueOnce([
          { status: 'completed', count: 7n },
          { status: 'cancelled', count: 16n },
        ])
        .mockResolvedValueOnce([{ title: 'Bánh mì', kg: 0.6, meals: 2n }])
        // getProviderEsg
        .mockResolvedValueOnce([{ kg: 10, completed: 7n, receivers: 4n }])
        .mockResolvedValueOnce([{ total: 3n, active: 1n }]);
    }

    it('quy đổi CO2 theo tháng và ép bigint về number', async () => {
      mockReportQueries([
        { month: '2026-06', kg: 0.76, meals: 6n, people: 4n },
        { month: '2026-07', kg: 0.2, meals: 1n, people: 1n },
      ]);

      const r = await service.getProviderReport('user-1', 6);

      expect(r.rangeMonths).toBe(6);
      expect(r.co2PerKg).toBe(2.5);
      expect(r.monthly).toEqual([
        { month: '2026-06', kg: 0.8, co2: 2, meals: 6, people: 4 }, // 0.76→0.8, ×2.5=2
        { month: '2026-07', kg: 0.2, co2: 0.5, meals: 1, people: 1 },
      ]);
      expect(r.byCategory).toEqual([{ category: 'bakery', kg: 1, meals: 5 }]);
      expect(r.fulfillment).toEqual([
        { status: 'completed', count: 7 },
        { status: 'cancelled', count: 16 },
      ]);
      expect(r.topListings).toEqual([{ title: 'Bánh mì', kg: 0.6, meals: 2 }]);
      // Tổng quan vẫn lấy từ getProviderEsg, không tính lại từ chuỗi tháng
      expect(r.mealsServed).toBe(7);
      expect(r.businessName).toBe('Bếp Test');
    });

    it.each([
      [undefined, 6],
      [0, 6], // Number(0)||DEFAULT → 6
      [-5, 1], // âm bị kẹp về 1
      [100, 24], // vượt trần bị kẹp về 24
      [12, 12],
    ])('kẹp months=%p về %p', async (input, expected) => {
      mockReportQueries([]);
      const r = await service.getProviderReport(
        'user-1',
        input as number | undefined,
      );
      expect(r.rangeMonths).toBe(expected);
    });

    it('không có hồ sơ cửa hàng → NotFound', async () => {
      findProvider.mockResolvedValue(null);
      await expect(service.getProviderReport('user-1', 6)).rejects.toThrow(
        'Không tìm thấy hồ sơ cửa hàng.',
      );
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });
});
