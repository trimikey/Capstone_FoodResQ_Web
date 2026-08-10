import {
  peakConcurrent,
  staffingDemand,
  staffingVerdict,
  timeToMinute,
  type ShiftLike,
} from './campaign-staffing';

const shift = (
  role: ShiftLike['role'],
  startTime: string,
  endTime: string,
  slotsNeeded: number,
): ShiftLike => ({ role, startTime, endTime, slotsNeeded });

describe('timeToMinute', () => {
  it.each([
    ['08:00', 480],
    ['08:00:00', 480],
    [' 8:30 ', 510],
    ['00:00', 0],
    ['23:59', 1439],
  ])('%s → %p', (input, expected) => {
    expect(timeToMinute(input)).toBe(expected);
  });

  it.each(['', 'abc', '25:00', '08:75', undefined, null])('%p → null', (input) => {
    expect(timeToMinute(input)).toBeNull();
  });
});

describe('peakConcurrent', () => {
  it('ca nối tiếp không chồng nhau → cao điểm bằng ca lớn nhất', () => {
    // Một đầu bếp làm cả hai ca được, nên chỉ cần 1 người dù tổng là 2 lượt.
    expect(peakConcurrent([shift('chef', '08:00', '12:00', 1), shift('chef', '12:00', '16:00', 1)])).toBe(1);
  });

  it('ca chồng giờ → cộng dồn slot', () => {
    expect(peakConcurrent([shift('chef', '08:00', '12:00', 2), shift('chef', '10:00', '14:00', 3)])).toBe(5);
  });

  it('ca lồng trong ca khác vẫn tính chồng', () => {
    expect(peakConcurrent([shift('chef', '08:00', '18:00', 1), shift('chef', '11:00', '13:00', 2)])).toBe(3);
  });

  it('bỏ qua ca giờ hỏng hoặc slot 0', () => {
    expect(
      peakConcurrent([
        shift('chef', '08:00', '12:00', 2),
        shift('chef', 'xx', '12:00', 5),
        shift('chef', '14:00', '10:00', 5), // giờ đảo ngược
        shift('chef', '08:00', '12:00', 0),
      ]),
    ).toBe(2);
  });

  it('danh sách rỗng → 0', () => {
    expect(peakConcurrent([])).toBe(0);
  });
});

describe('staffingDemand', () => {
  it('tách lượt ca và số người tối thiểu theo từng vai trò', () => {
    const shifts = [
      shift('chef', '06:00', '10:00', 2),
      shift('chef', '10:00', '14:00', 2), // nối tiếp → cùng 2 người làm được
      shift('waiter', '10:00', '14:00', 3),
      shift('waiter', '12:00', '16:00', 1), // chồng 12–14 → cần 4
    ];
    const d = staffingDemand(shifts);

    expect(d.byRole.chef).toEqual({ slots: 4, peak: 2, shiftCount: 2 });
    expect(d.byRole.waiter).toEqual({ slots: 4, peak: 4, shiftCount: 2 });
    expect(d.byRole.shipper).toEqual({ slots: 0, peak: 0, shiftCount: 0 });
    expect(d.totalSlots).toBe(8);
    expect(d.totalPeak).toBe(6); // 2 bếp + 4 phục vụ, không thay thế chéo vai trò
  });

  it('ca chung (không gán vai trò) không bị tính vào mọi vai trò', () => {
    const d = staffingDemand([shift(undefined, '08:00', '12:00', 5)]);
    expect(d.byRole.chef.slots).toBe(0);
    expect(d.byRole.waiter.slots).toBe(0);
    expect(d.totalSlots).toBe(5); // vẫn nằm trong tổng lượt ca
  });
});

describe('staffingVerdict', () => {
  const servings = 100; // khuyến nghị ≥ 8 người

  it('chưa có nhân sự', () => {
    expect(staffingVerdict({ chef: 0, waiter: 0, shipper: 0 }, [], servings).tone).toBe('amber');
  });

  it('chưa khai báo ca → chỉ so tổng với quy mô suất', () => {
    const v = staffingVerdict({ chef: 2, waiter: 3, shipper: 2 }, [], servings);
    expect(v.tone).toBe('amber');
    expect(v.text).toContain('khuyến nghị ≥ 8');
  });

  it('2 đầu bếp phủ 2 ca NỐI TIẾP là hợp lệ, không báo thiếu', () => {
    // Đây là ca người dùng nêu: một đầu bếp làm cả ngày / 2 ca.
    const shifts = [shift('chef', '06:00', '11:00', 2), shift('chef', '11:00', '16:00', 2)];
    const v = staffingVerdict({ chef: 2, waiter: 4, shipper: 3 }, shifts, servings);
    expect(v.tone).toBe('emerald');
    expect(v.hint).toContain('4 lượt ca / 9 người');
  });

  it('ca chồng giờ thì 2 đầu bếp là thiếu', () => {
    const shifts = [shift('chef', '06:00', '12:00', 2), shift('chef', '10:00', '16:00', 2)];
    const v = staffingVerdict({ chef: 2, waiter: 4, shipper: 3 }, shifts, servings);
    expect(v.tone).toBe('amber');
    expect(v.text).toContain('đầu bếp cần ≥ 4');
  });

  it('tuyển nhiều hơn tổng lượt ca → cảnh báo dư', () => {
    const shifts = [shift('chef', '06:00', '11:00', 1), shift('chef', '11:00', '16:00', 1)];
    const v = staffingVerdict({ chef: 5, waiter: 4, shipper: 3 }, shifts, servings);
    expect(v.tone).toBe('rose');
    expect(v.text).toContain('chỉ có 2 lượt ca');
  });

  it('vai trò không có ca nào thì không bị coi là tuyển dư', () => {
    const shifts = [shift('chef', '06:00', '11:00', 2)];
    const v = staffingVerdict({ chef: 2, waiter: 4, shipper: 3 }, shifts, servings);
    expect(v.tone).not.toBe('rose');
  });

  describe('số đề xuất cho nút "Dùng số đề xuất"', () => {
    it('thiếu người → nâng lên đúng mức cao điểm, vai trò khác giữ nguyên', () => {
      const shifts = [shift('chef', '06:00', '12:00', 2), shift('chef', '10:00', '16:00', 2)];
      const v = staffingVerdict({ chef: 2, waiter: 4, shipper: 3 }, shifts, servings);
      // cao điểm bếp = 4; phục vụ/giao hàng không có ca nên giữ nguyên
      expect(v.suggested).toEqual({ chef: 4, waiter: 4, shipper: 3 });
    });

    it('tuyển dư → hạ về đúng tổng lượt ca', () => {
      const shifts = [shift('chef', '06:00', '11:00', 1), shift('chef', '11:00', '16:00', 1)];
      const v = staffingVerdict({ chef: 5, waiter: 4, shipper: 3 }, shifts, servings);
      expect(v.suggested?.chef).toBe(2);
    });

    it('đã hợp lệ → không đề xuất gì (nút không hiện)', () => {
      const shifts = [shift('chef', '06:00', '11:00', 2), shift('chef', '11:00', '16:00', 2)];
      const v = staffingVerdict({ chef: 2, waiter: 4, shipper: 3 }, shifts, servings);
      expect(v.suggested).toBeUndefined();
    });
  });
});
