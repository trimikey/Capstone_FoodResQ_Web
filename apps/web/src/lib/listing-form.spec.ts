import {
  combineToIso,
  formatVietnamDate,
  formatVietnamDateTime,
  formatVietnamTime,
  toLocalInput,
  toIso,
} from './listing-form';

describe('listing form timezone conversion', () => {
  it('lưu đúng giờ Provider nhập theo múi giờ Việt Nam', () => {
    expect(combineToIso('2026-08-17', '14:45')).toBe('2026-08-17T07:45:00.000Z');
    expect(combineToIso('2026-08-17', '21:44')).toBe('2026-08-17T14:44:00.000Z');
    expect(combineToIso('2026-08-18', '05:00')).toBe('2026-08-17T22:00:00.000Z');
  });

  it('đưa timestamp đã lưu về đúng ngày và giờ Việt Nam cho form Provider', () => {
    expect(toLocalInput('2026-08-17T07:45:00.000Z')).toEqual({
      date: '2026-08-17',
      time: '14:45',
    });
    expect(toLocalInput('2026-08-17T17:00:00.000Z')).toEqual({
      date: '2026-08-18',
      time: '00:00',
    });
  });

  it('giữ cùng một giờ Việt Nam trên mọi máy, kể cả khi môi trường chạy UTC', () => {
    const endTime = '2026-08-17T22:00:00.000Z';

    expect(formatVietnamTime(endTime)).toBe('05:00');
    expect(formatVietnamDate(endTime)).toBe('18/08/2026');
    expect(formatVietnamDateTime(endTime)).toBe('18/08/2026 05:00');
    expect(toIso('2026-08-18T05:00')).toBe(endTime);
  });
});
