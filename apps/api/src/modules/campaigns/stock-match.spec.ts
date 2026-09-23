import { listingMatchScore, pickStockListing, unitsForKg, type StockListing } from './stock-match';

const listing = (over: Partial<StockListing>): StockListing => ({
  id: 'l1',
  title: 'Vựa gạo từ thiện',
  category: 'other',
  quantityUnit: 'kg',
  quantityRemaining: 50,
  weightPerUnitKg: null,
  ...over,
});

describe('stock-match — chọn tin đăng để trừ tồn kho', () => {
  it('khớp tên món không phân biệt dấu', () => {
    expect(listingMatchScore(listing({}), 'Gạo sạch', 'dry_goods')).toBe(2);
    expect(listingMatchScore(listing({ title: 'cá từ thiện', category: 'raw_protein' }), 'Thịt gà', 'raw_protein')).toBe(1);
  });

  it('chỉ tự chọn tin khớp đúng tên — cùng nhóm thì không trừ', () => {
    const fish = listing({ id: 'fish', title: 'cá từ thiện', category: 'raw_protein' });
    expect(pickStockListing([fish], 'Thịt gà', 'raw_protein', 3)).toBeNull();
    expect(pickStockListing([listing({})], 'Gạo sạch', 'dry_goods', 10)?.id).toBe('l1');
  });

  it('ưu tiên tin còn đủ hàng', () => {
    const small = listing({ id: 'small', title: 'Gạo ST25', quantityRemaining: 5 });
    const big = listing({ id: 'big', title: 'Gạo nở', quantityRemaining: 40 });
    expect(pickStockListing([small, big], 'Gạo', null, 10)?.id).toBe('big');
  });

  it('quy kg về đơn vị của tin', () => {
    expect(unitsForKg({ quantityUnit: 'kg', weightPerUnitKg: null }, 10)).toBe(10);
    expect(unitsForKg({ quantityUnit: 'box', weightPerUnitKg: 5 }, 12)).toBe(3);
    expect(unitsForKg({ quantityUnit: 'portion', weightPerUnitKg: null }, 10)).toBeNull();
  });
});
