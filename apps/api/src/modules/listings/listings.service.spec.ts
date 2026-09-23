import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ListingsService } from './listings.service';
import type { CreateListingDto } from './dto/create-listing.dto';

const DAY = 86_400_000;
const PICKUP_END = new Date('2026-09-25T12:00:00.000Z');

function makeService() {
  const tx = { foodListing: { update: jest.fn() }, $executeRaw: jest.fn() };
  const prisma = {
    providerProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'provider-1',
        verificationStatus: 'approved',
        businessName: 'Quán Test',
      }),
    },
    foodListing: { findUnique: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'listing-1' }]),
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const service = new ListingsService(prisma as never, { getNumber: jest.fn() } as never);
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'listing-1' } as never);
  return { service, prisma, tx };
}

function baseDto(overrides: Partial<CreateListingDto> = {}): CreateListingDto {
  return {
    title: 'Cơm hộp cuối ngày',
    category: 'cooked_meal',
    quantityTotal: 10,
    quantityUnit: 'portion',
    pickupStartTime: new Date(PICKUP_END.getTime() - 4 * 3_600_000).toISOString(),
    pickupEndTime: PICKUP_END.toISOString(),
    pickupAddress: '12 Nguyễn Huệ',
    lng: 106.7,
    lat: 10.77,
    maxPerReservation: 2,
    imageUrls: ['https://res.cloudinary.com/demo/a.jpg'],
    ...overrides,
  } as CreateListingDto;
}

/** Tham số của câu INSERT gửi vào $queryRaw (Prisma.sql giữ values riêng khỏi chuỗi SQL). */
function insertValues(prisma: ReturnType<typeof makeService>['prisma']): unknown[] {
  return (prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql).values;
}

describe('ListingsService — HSD theo số ngày', () => {
  it('create: tính expiry = hạn lấy + N ngày và lưu shelf_life_days', async () => {
    const { service, prisma } = makeService();
    await service.create('user-1', baseDto({ shelfLifeDays: 2 }));

    const values = insertValues(prisma);
    expect(values).toContainEqual(new Date(PICKUP_END.getTime() + 2 * DAY));
    expect(values).toContain(2);
  });

  it('create: client cũ gửi mốc tuyệt đối → quy ngược ra số ngày (làm tròn lên)', async () => {
    const { service, prisma } = makeService();
    const expiry = new Date(PICKUP_END.getTime() + 30 * 3_600_000); // 1.25 ngày
    await service.create('user-1', baseDto({ expiryTime: expiry.toISOString() }));

    const values = insertValues(prisma);
    expect(values).toContainEqual(expiry);
    expect(values).toContain(2);
  });

  it('create: thiếu cả số ngày lẫn mốc HSD → 400', async () => {
    const { service } = makeService();
    await expect(service.create('user-1', baseDto())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update: gia hạn giờ lấy trên tin đã đăng → HSD dịch theo', async () => {
    const { service, prisma, tx } = makeService();
    prisma.foodListing.findUnique.mockResolvedValue({
      id: 'listing-1',
      providerId: 'provider-1',
      status: 'active',
      pickupStartTime: new Date(PICKUP_END.getTime() - 4 * 3_600_000),
      pickupEndTime: PICKUP_END,
      expiryTime: new Date(PICKUP_END.getTime() + 2 * DAY),
      shelfLifeDays: 2,
      quantityTotal: 10,
      quantityRemaining: 10,
    });
    const newEnd = new Date(Date.now() + 5 * DAY);
    await service.update('listing-1', 'user-1', { pickupEndTime: newEnd.toISOString() });

    const data = tx.foodListing.update.mock.calls[0][0].data;
    expect(data.expiryTime).toEqual(new Date(newEnd.getTime() + 2 * DAY));
    expect(data.shelfLifeDays).toBe(2);
  });

  it('update: không cho rút ngắn số ngày HSD khi tin đã đăng', async () => {
    const { service, prisma } = makeService();
    prisma.foodListing.findUnique.mockResolvedValue({
      id: 'listing-1',
      providerId: 'provider-1',
      status: 'active',
      pickupStartTime: new Date(PICKUP_END.getTime() - 4 * 3_600_000),
      pickupEndTime: PICKUP_END,
      expiryTime: new Date(PICKUP_END.getTime() + 3 * DAY),
      shelfLifeDays: 3,
      quantityTotal: 10,
      quantityRemaining: 10,
    });
    await expect(
      service.update('listing-1', 'user-1', { shelfLifeDays: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
