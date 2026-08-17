import { UsersService } from './users.service';

type SqlQuery = {
  strings: readonly string[];
  values: readonly unknown[];
};

describe('UsersService.updateMe — đồng bộ điểm lấy hàng của provider', () => {
  const transaction = {
    user: { update: jest.fn() },
    $executeRaw: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn(),
  };
  let service: UsersService;

  const provider = {
    id: 'provider-user-1',
    email: 'provider@example.com',
    phone: null,
    fullName: 'Nhà cung cấp',
    avatarUrl: null,
    role: 'provider',
    status: 'active',
    trustScore: 100,
  };

  const receiver = { ...provider, id: 'receiver-user-1', role: 'receiver' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    );
    transaction.user.update.mockResolvedValue(provider);
    service = new UsersService(prisma as never, {} as never, {} as never);
  });

  function sqlText(callIndex: number): string {
    const query = transaction.$executeRaw.mock.calls[callIndex]?.[0] as SqlQuery | undefined;
    expect(query).toBeDefined();
    return query!.strings.join('');
  }

  it('đồng bộ địa chỉ mới sang các tin draft, active và fully_reserved', async () => {
    await expect(
      service.updateMe(provider.id, { address: '12 Nguyễn Huệ, Quận 1, TP.HCM' }),
    ).resolves.toEqual(provider);

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(2);
    const listingsUpdate = sqlText(1);
    expect(listingsUpdate).toContain('UPDATE food_listings AS fl');
    expect(listingsUpdate).toContain('pickup_address =');
    expect(listingsUpdate).toContain("fl.status IN ('draft', 'active', 'fully_reserved')");
    expect(listingsUpdate).toContain('fl.deleted_at IS NULL');
    expect(listingsUpdate).not.toContain('pickup_location =');
  });

  it('đồng bộ cả ghim bản đồ khi provider lưu đủ cặp toạ độ', async () => {
    await service.updateMe(provider.id, {
      address: 'Đường Số 5, Linh Chiểu, Thủ Đức, TP.HCM',
      lng: 106.766,
      lat: 10.865,
    });

    const listingsUpdate = sqlText(1);
    expect(listingsUpdate).toContain('pickup_address =');
    expect(listingsUpdate).toContain('pickup_location = ST_SetSRID(ST_MakePoint(');
  });

  it('không cập nhật listing khi receiver đổi địa chỉ giao mặc định', async () => {
    transaction.user.update.mockResolvedValue(receiver);

    await service.updateMe(receiver.id, {
      address: '45 Lê Lợi, Quận 1, TP.HCM',
      lng: 106.7,
      lat: 10.77,
    });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(sqlText(0)).toContain('UPDATE receiver_profiles');
  });
});
