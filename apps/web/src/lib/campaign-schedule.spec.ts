import {
  campaignStartWindow,
  findOverlapping,
  shiftsOverlap,
  vnDateTimeToUtc,
  CAMPAIGN_START_LEAD_HOURS,
} from './campaign-schedule';

/** Chiến dịch 08/08/2026, 08:00–12:00 giờ VN. */
const campaign = { scheduledDate: '2026-08-08T00:00:00.000Z', startTime: '08:00' };

/** `HH:mm` ngày dd/08/2026 GIỜ VN → epoch ms, để viết test theo giờ người dùng thấy. */
const vn = (day: number, hhmm: string) => vnDateTimeToUtc(`2026-08-${String(day).padStart(2, '0')}`, hhmm);

describe('vnDateTimeToUtc', () => {
  it('08:00 giờ VN = 01:00 UTC cùng ngày', () => {
    expect(new Date(vnDateTimeToUtc('2026-08-08', '08:00')).toISOString()).toBe(
      '2026-08-08T01:00:00.000Z',
    );
  });

  it('05:00 giờ VN vẫn là ngày HÔM TRƯỚC theo UTC', () => {
    expect(new Date(vnDateTimeToUtc('2026-08-08', '05:00')).toISOString()).toBe(
      '2026-08-07T22:00:00.000Z',
    );
  });
});

describe('campaignStartWindow', () => {
  it(`mở được từ ${CAMPAIGN_START_LEAD_HOURS}h trước mốc bắt đầu (tối hôm trước)`, () => {
    // 08:00 ngày 08 trừ 12h = 20:00 ngày 07 giờ VN
    expect(campaignStartWindow(campaign, vn(7, '20:00')).canStart).toBe(true);
    expect(campaignStartWindow(campaign, vn(7, '19:59')).canStart).toBe(false);
  });

  it('05:00 sáng ĐÚNG NGÀY diễn ra phải mở được — đây là ca đi chợ/nhận nguyên liệu', () => {
    // Luật cũ so theo ngày UTC nên khung 00:00–07:00 giờ VN bị chặn oan.
    const w = campaignStartWindow(campaign, vn(8, '05:00'));
    expect(w.canStart).toBe(true);
  });

  it('trong giờ diễn ra vẫn mở được', () => {
    expect(campaignStartWindow(campaign, vn(8, '09:30')).canStart).toBe(true);
  });

  it('hết ngày diễn ra thì quá hạn', () => {
    expect(campaignStartWindow(campaign, vn(8, '23:58')).canStart).toBe(true);
    const late = campaignStartWindow(campaign, vn(9, '00:30'));
    expect(late.canStart).toBe(false);
    expect(late.reason).toBe('too_late');
  });

  it('chiến dịch nhiều ngày dùng endDate làm mốc hết hạn', () => {
    const multi = { ...campaign, endDate: '2026-08-10T00:00:00.000Z' };
    expect(campaignStartWindow(multi, vn(10, '20:00')).canStart).toBe(true);
    expect(campaignStartWindow(multi, vn(11, '00:30')).canStart).toBe(false);
  });

  it('còn xa thì báo số ngày', () => {
    const w = campaignStartWindow(campaign, vn(1, '08:00'));
    expect(w.canStart).toBe(false);
    expect(w.reason).toBe('too_early');
    expect(w.canStart === false && w.message).toMatch(/ngày/);
  });

  it('sắp mở thì báo số giờ', () => {
    const w = campaignStartWindow(campaign, vn(7, '15:00'));
    expect(w.canStart === false && w.message).toMatch(/giờ/);
  });

  it.each([
    [{ scheduledDate: null, startTime: '08:00' }],
    [{ scheduledDate: '2026-08-08', startTime: null }],
    [{}],
  ])('thiếu ngày/giờ thì KHÔNG mặc định cho bật: %p', (input) => {
    // Date không hợp lệ cho ra NaN, mọi so sánh với NaN đều false — nếu không chặn
    // riêng thì hàm sẽ trả canStart:true và nút hiện sáng rồi bấm vào ăn lỗi BE.
    expect(campaignStartWindow(input).canStart).toBe(false);
  });
});

describe('shiftsOverlap', () => {
  const s = (id: string, startTime: string, endTime: string) => ({ id, startTime, endTime });

  it('ca nối tiếp KHÔNG tính là trùng — bàn giao xong đi tiếp được', () => {
    expect(shiftsOverlap(s('a', '06:00', '11:00'), s('b', '11:00', '16:00'))).toBe(false);
  });

  it('ca gối đầu là trùng', () => {
    expect(shiftsOverlap(s('a', '06:00', '12:00'), s('b', '10:00', '16:00'))).toBe(true);
  });

  it('ca lồng trong ca khác là trùng', () => {
    expect(shiftsOverlap(s('a', '06:00', '18:00'), s('b', '11:00', '13:00'))).toBe(true);
  });

  it('ca rời nhau hoàn toàn thì không trùng', () => {
    expect(shiftsOverlap(s('a', '06:00', '08:00'), s('b', '14:00', '16:00'))).toBe(false);
  });

  it('giờ hỏng thì coi như không trùng — validate riêng ở nơi nhập liệu', () => {
    expect(shiftsOverlap(s('a', 'xx', '08:00'), s('b', '06:00', '10:00'))).toBe(false);
  });
});

describe('findOverlapping', () => {
  const s = (id: string, label: string, startTime: string, endTime: string) => ({
    id,
    label,
    startTime,
    endTime,
  });
  const picked = [s('1', 'Ca sáng', '06:00', '11:00'), s('2', 'Ca chiều', '13:00', '17:00')];

  it('trả về ca đụng đầu tiên', () => {
    expect(findOverlapping(s('3', 'Ca nấu', '10:00', '14:00'), picked)?.label).toBe('Ca sáng');
  });

  it('không đụng ai thì trả null — 2 ca nối tiếp đều chọn được', () => {
    expect(findOverlapping(s('3', 'Ca trưa', '11:00', '13:00'), picked)).toBeNull();
  });

  it('bỏ qua chính nó (ca đang được tick)', () => {
    expect(findOverlapping(s('1', 'Ca sáng', '06:00', '11:00'), picked)).toBeNull();
  });
});
