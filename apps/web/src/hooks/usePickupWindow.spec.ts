import { getPickupWindowState } from './usePickupWindow';

/** Tạo epoch từ ngày/giờ người dùng thấy tại Việt Nam. */
const vn = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).getTime();

const pickupStartTime = '2026-08-17T15:40:00.000Z'; // 22:40 VN
const pickupEndTime = '2026-08-17T16:39:00.000Z'; // 23:39 VN

const stateAt = (date: string, time: string) =>
  getPickupWindowState(pickupStartTime, pickupEndTime, vn(date, time));

describe('getPickupWindowState', () => {
  it('mở đúng trong khoảng Provider đã đặt', () => {
    expect(stateAt('2026-08-17', '23:00')).toEqual({
      notYetOpen: false,
      closed: false,
      isOpen: true,
      minutesLeft: 39,
    });
  });

  it('hiện chưa mở trước mốc bắt đầu', () => {
    expect(stateAt('2026-08-17', '22:30')).toEqual({
      notYetOpen: true,
      closed: false,
      isOpen: false,
      minutesLeft: null,
    });
  });

  it('chặn từ đúng phút hạn lấy trở đi', () => {
    expect(stateAt('2026-08-17', '23:39')).toEqual({
      notYetOpen: false,
      closed: true,
      isOpen: false,
      minutesLeft: null,
    });
  });

  it('không bị đóng sớm bởi khung giờ hằng ngày của listing cũ', () => {
    const start = '2026-08-17T16:35:00.000Z'; // 23:35 VN
    const end = '2026-08-18T05:04:00.000Z'; // 12:04 VN ngày hôm sau

    expect(getPickupWindowState(start, end, vn('2026-08-17', '23:36'))).toEqual({
      notYetOpen: false,
      closed: false,
      isOpen: true,
      minutesLeft: 748,
    });
  });

  it('giữ mốc end tuyệt đối là hạn cứng', () => {
    expect(stateAt('2026-08-18', '06:00')).toEqual({
      notYetOpen: false,
      closed: true,
      isOpen: false,
      minutesLeft: null,
    });
  });
});
