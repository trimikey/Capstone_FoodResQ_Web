import { formatCountdown, getCountdownState } from './useCountdown';

function atMs(iso: string): number {
  return new Date(iso).getTime();
}

describe('useCountdown', () => {
  it('trả về thời gian còn lại theo cấu hình server, không hard-code 30 phút', () => {
    const now = atMs('2026-08-17T03:30:00.000Z');
    expect(getCountdownState('2026-08-17T03:45:00.000Z', now)).toEqual({
      remainingSeconds: 900,
      expired: false,
    });
    expect(getCountdownState('2026-08-17T04:15:00.000Z', now)).toEqual({
      remainingSeconds: 2700,
      expired: false,
    });
  });

  it('đã qua hạn thì expired và còn lại 0', () => {
    const now = atMs('2026-08-17T03:46:00.000Z');
    expect(getCountdownState('2026-08-17T03:45:00.000Z', now)).toEqual({
      remainingSeconds: 0,
      expired: true,
    });
  });

  it('thiếu expiresAt thì không tự phát minh thời hạn', () => {
    expect(getCountdownState(null)).toEqual({ remainingSeconds: null, expired: false });
    expect(getCountdownState(undefined)).toEqual({ remainingSeconds: null, expired: false });
    expect(getCountdownState('not-a-date')).toEqual({ remainingSeconds: null, expired: false });
  });

  it('định dạng countdown theo mm:ss và hh:mm:ss', () => {
    expect(formatCountdown(90)).toBe('01:30');
    expect(formatCountdown(3661)).toBe('01:01:01');
    expect(formatCountdown(0)).toBe('00:00');
  });
});
