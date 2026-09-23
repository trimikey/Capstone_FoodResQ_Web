import { missingReceivedSupplies } from './supply-progress';

const SUPPLIES = [
  { name: 'Gạo sạch', quantity: 10, unit: 'kg' },
  { name: 'Cá fillet', quantity: 2, unit: 'kg' },
  { name: 'Rau củ các loại', quantity: 5, unit: 'kg' },
  { name: 'Ghi chú chung' }, // không có số lượng → không đo được, không chặn
];

describe('missingReceivedSupplies — chưa đủ nguyên liệu thì chưa cho vào bếp', () => {
  it('liệt kê món còn thiếu theo số ĐÃ NHẬN', () => {
    const missing = missingReceivedSupplies(SUPPLIES, [
      { itemName: 'Gạo sạch', quantity: '10 kg', status: 'received' },
      { itemName: 'Rau củ các loại', quantity: '5 kg', status: 'received' },
    ]);
    expect(missing).toEqual([{ name: 'Cá fillet', unit: 'kg', missing: 2, target: 2 }]);
  });

  it('hàng mới hứa góp (pledged) chưa tính là đã có', () => {
    const missing = missingReceivedSupplies(SUPPLIES, [
      { itemName: 'Gạo sạch', quantity: '10 kg', status: 'received' },
      { itemName: 'Rau củ các loại', quantity: '5 kg', status: 'received' },
      { itemName: 'Cá fillet', quantity: '2 kg', status: 'pledged' },
    ]);
    expect(missing.map((m) => m.name)).toEqual(['Cá fillet']);
  });

  it('nhận đủ tất cả → không thiếu gì; nhận thiếu → báo phần còn lại', () => {
    expect(
      missingReceivedSupplies(SUPPLIES, [
        { itemName: 'gạo sạch', quantity: '10 kg', status: 'received' },
        { itemName: 'Cá fillet', quantity: '2 kg', status: 'received' },
        { itemName: 'Rau củ các loại', quantity: '3 kg', status: 'received' },
        { itemName: 'Rau củ các loại', quantity: '2 kg', status: 'received' },
      ]),
    ).toEqual([]);
    expect(
      missingReceivedSupplies(SUPPLIES.slice(0, 1), [{ itemName: 'Gạo sạch', quantity: '7 kg', status: 'received' }]),
    ).toEqual([{ name: 'Gạo sạch', unit: 'kg', missing: 3, target: 10 }]);
  });
});
