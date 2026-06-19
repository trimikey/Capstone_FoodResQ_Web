import { Test } from '@nestjs/testing';
import { EsgService } from './esg.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('EsgService', () => {
  let service: EsgService;
  let queryRaw: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [EsgService, { provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
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
});
