'use client';

import { useEffect, useState } from 'react';

/**
 * Đếm ngược hạn nhận đơn.
 *
 * Tự giữ interval riêng nên chỉ mình cái chip này vẽ lại mỗi giây, thay vì bắt cả trang
 * (bản đồ, lịch sử, thống kê) render theo.
 *
 * Hết giờ vẫn giữ nguyên thẻ đơn thay vì tự ẩn: danh sách làm mới mỗi 20 giây và server
 * đã loại đơn quá hạn, nên để nó tự biến mất ở lượt làm mới — ẩn ngay tại chỗ sẽ khiến
 * đơn chớp tắt nếu đồng hồ máy client lệch vài giây so với server.
 */
export default function ClaimCountdown({
  expiresAt,
  scheduled,
}: {
  expiresAt: string;
  /** Đơn hẹn giờ đóng sớm trước giờ hẹn — nói rõ để shipper không tưởng bị cắt oan. */
  scheduled: boolean;
}) {
  const [msLeft, setMsLeft] = useState(() => new Date(expiresAt).getTime() - Date.now());

  useEffect(() => {
    const tick = () => setMsLeft(new Date(expiresAt).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const expired = msLeft <= 0;
  const totalSec = Math.max(0, Math.floor(msLeft / 1000));
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  // Dưới 1 tiếng thì đếm từng giây (lúc này mỗi phút đều đáng giá); dài hơn thì giờ/phút
  // là đủ, đếm giây chỉ gây sốt ruột vô ích.
  const text = expired
    ? 'Đã hết hạn nhận'
    : hh > 0
      ? `Còn ${hh}h${String(mm).padStart(2, '0')} để nhận`
      : `Còn ${mm}:${String(ss).padStart(2, '0')} để nhận`;

  const urgent = !expired && msLeft <= 5 * 60_000;
  const tone = expired
    ? 'bg-neutral-100 text-neutral-500'
    : urgent
      ? 'bg-rose-50 text-rose-700'
      : 'bg-amber-50 text-amber-700';

  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}
      title={
        scheduled
          ? 'Đơn hẹn giờ đóng nhận trước giờ hẹn 15 phút để shipper còn kịp tới lấy hàng'
          : 'Hết hạn mà không ai nhận thì đơn bị huỷ và người nhận được báo đặt lại'
      }
    >
      <span className="material-symbols-outlined text-[13px]">
        {expired ? 'timer_off' : 'timer'}
      </span>
      {text}
    </span>
  );
}
