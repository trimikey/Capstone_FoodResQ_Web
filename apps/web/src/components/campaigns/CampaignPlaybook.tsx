'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Quy trình tổ chức một chiến dịch từ thiện.
 * Hiển thị dưới dạng dropdown để trang gọn, mở ra khi cần xem chi tiết.
 *
 * Mỗi giai đoạn có: mô tả ngắn, danh sách bước cần làm, tip nhỏ, và mức thời gian ước tính.
 * Dữ liệu đặt trong file để dễ chỉnh (không cần BE).
 */

export type CampaignPhaseKey =
  | 'plan'
  | 'recruit'
  | 'prep'
  | 'cook'
  | 'distribute'
  | 'report';

export interface CampaignPhase {
  key: CampaignPhaseKey;
  title: string;
  window: string; // khoảng thời gian dự kiến so với ngày diễn ra
  icon: string;
  tone: 'sky' | 'honey' | 'mint' | 'ember' | 'emerald' | 'rose';
  summary: string;
  steps: string[];
  tips: string[];
  deliverables: string[]; // đầu ra kỳ vọng
}

export const CAMPAIGN_PLAYBOOK: CampaignPhase[] = [
  {
    key: 'plan',
    title: 'Lên kế hoạch & đăng ký',
    window: 'Trước 7–14 ngày',
    icon: 'edit_calendar',
    tone: 'sky',
    summary:
      'Chốt mục tiêu, ngân sách, thực đơn, số suất dự kiến, địa điểm, đối tượng thụ hưởng và thời gian. Gửi hồ sơ để FoodResQ duyệt chiến dịch.',
    steps: [
      'Xác định bếp/quán phụ trách và công suất suất/ngày.',
      'Chốt thực đơn (món chính, món phụ, đồ uống) và nguyên liệu dự kiến.',
      'Tạo chiến dịch trên FoodResQ: tiêu đề, ảnh bìa, mô tả, lịch trình hoạt động.',
      'Điền nhu cầu nhân lực theo 3 vai trò: đầu bếp, phục vụ, giao hàng.',
      'Gửi hồ sơ để admin duyệt (status chuyển từ draft → open).',
    ],
    tips: [
      'Đặt ngày diễn ra trùng giờ bếp rảnh — tránh cao điểm lễ/tết.',
      'Mô tả rõ đối tượng nhận (công nhân, học sinh, bệnh nhân…) để TNV dễ đăng ký.',
    ],
    deliverables: ['Chiến dịch ở trạng thái open', 'Lịch trình hoạt động cơ bản'],
  },
  {
    key: 'recruit',
    title: 'Tuyển tình nguyện viên',
    window: 'Trước 3–7 ngày',
    icon: 'groups',
    tone: 'honey',
    summary:
      'Chia ca trực cụ thể (sơ chế / nấu / vận chuyển), duyệt đăng ký TNV và phân công vai trò phù hợp.',
    steps: [
      'Vào tab "Lịch trình" của trang quản lý, bấm "Thêm ca" và bẻ nhỏ khung giờ.',
      'Đặt số người cần (slotsNeeded) cho từng ca theo năng lực thực tế.',
      'Duyệt đơn đăng ký trong tab "Đăng ký chờ duyệt" (ưu tiên đúng vai trò).',
      'Gửi nhắc nhở cho TNV đã duyệt trước ngày diễn ra 1 ngày.',
    ],
    tips: [
      'Mỗi ca nên có ít nhất 1 TNV giàu kinh nghiệm làm "trưởng ca".',
      'Không nên để 1 người đăng ký cả 3 vai trò trong cùng ngày.',
    ],
    deliverables: ['Đủ slotsFilled cho mỗi ca', 'TNV đã nhận thông báo'],
  },
  {
    key: 'prep',
    title: 'Sơ chế & chuẩn bị',
    window: 'Trước 4–8 giờ',
    icon: 'content_cut',
    tone: 'ember',
    summary:
      'Nhận nguyên liệu (đặt mua hoặc nhận quyên góp), sơ chế rau củ, vo gạo, pha chế, kiểm tra dụng cụ và bếp.',
    steps: [
      'Check-in đầu ca (sơ chế) trên app.',
      'Kiểm tra nguồn nước, ga, thiết bị bếp.',
      'Rửa / cắt / phân loại nguyên liệu theo thực đơn.',
      'Cân đo khẩu phần để ước lượng tổng suất đạt được.',
    ],
    tips: [
      'Giữ lại phần nguyên liệu dư để quyết định món thay thế nếu thiếu.',
      'Chụp ảnh "trước khi nấu" để làm bằng chứng ESG.',
    ],
    deliverables: ['Nguyên liệu đã sơ chế', 'Ảnh check-in ca'],
  },
  {
    key: 'cook',
    title: 'Nấu nướng',
    window: 'Ngày D — sáng/trưa',
    icon: 'soup_kitchen',
    tone: 'mint',
    summary:
      'Vận hành bếp theo thực đơn: xào, nấu, hấp… đảm bảo VSATTP và đủ khẩu phần theo mục tiêu đề ra.',
    steps: [
      'TNV ca nấu check-in và bắt đầu chế biến.',
      'Kiểm tra nhiệt độ, thời gian nấu từng món.',
      'Đong gói từng suất ăn vào hộp/túi theo khẩu phần đã tính.',
      'Lưu ảnh "món đã nấu" vào bằng chứng chiến dịch.',
    ],
    tips: [
      'Ưu tiên nấu món chính trước, món phụ sau.',
      'Nếu thiếu suất → báo charity sớm để điều phối nguồn bổ sung.',
    ],
    deliverables: ['Suất ăn đã hoàn thành', 'Ảnh QC món'],
  },
  {
    key: 'distribute',
    title: 'Phân phối suất ăn',
    window: 'Ngày D — sau khi nấu xong',
    icon: 'takeout_dining',
    tone: 'emerald',
    summary:
      'Phát suất cho người nhận theo từng đợt. Ghi nhận số suất, số người và ghi chú vận hành.',
    steps: [
      'Vào tab "Phân phối suất ăn" → bấm "Tạo đợt mới".',
      'Điền tên đợt (tuỳ chọn), số suất phát, số người nhận, suất thừa.',
      'Ghi chú địa điểm, giờ phát, đối tượng cụ thể.',
      'Lặp lại cho mỗi đợt (trưa/chiều/tối hoặc theo địa điểm).',
    ],
    tips: [
      'Mỗi đợt nên phát 50–200 suất để dễ kiểm soát.',
      'Cập nhật đợt ngay khi kết thúc, không để cuối ngày mới ghi.',
    ],
    deliverables: ['Các đợt phát được ghi nhận', 'Tổng suất ≈ mục tiêu'],
  },
  {
    key: 'report',
    title: 'Tổng kết & báo cáo',
    window: 'Ngày D+1 đến D+3',
    icon: 'verified',
    tone: 'rose',
    summary:
      'Tổng kết số liệu, đánh giá mức độ hài lòng, xuất báo cáo ESG và đóng chiến dịch.',
    steps: [
      'Đối chiếu actualServings với expectedServings để tính % hoàn thành.',
      'Thu thập cảm nhận TNV (tab "Cảm nhận" ở trang chi tiết chiến dịch).',
      'Xuất CSV báo cáo từ tab Phân phối suất ăn.',
      'Đổi trạng thái chiến dịch sang "completed" và chốt hồ sơ.',
    ],
    tips: [
      'Cảm nhận TNV giúp cải thiện chiến dịch sau.',
      'Báo cáo CSV có thể gửi nhà tài trợ làm bằng chứng ESG.',
    ],
    deliverables: ['Báo cáo CSV', 'Trạng thái completed', 'Cảm nhận đã thu thập'],
  },
];

const TONE_BG: Record<CampaignPhase['tone'], string> = {
  sky: 'bg-sky-50 border-sky-200 text-sky-900',
  honey: 'bg-amber-50 border-amber-200 text-amber-900',
  mint: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  ember: 'bg-orange-50 border-orange-200 text-orange-900',
  emerald: 'bg-green-50 border-green-200 text-green-900',
  rose: 'bg-rose-50 border-rose-200 text-rose-900',
};

const TONE_ICON: Record<CampaignPhase['tone'], string> = {
  sky: 'bg-sky-100 text-sky-700',
  honey: 'bg-amber-100 text-amber-700',
  mint: 'bg-emerald-100 text-emerald-700',
  ember: 'bg-orange-100 text-orange-700',
  emerald: 'bg-green-100 text-green-700',
  rose: 'bg-rose-100 text-rose-700',
};

interface Props {
  /** Tiêu đề hiển thị trên trigger. */
  label?: string;
  /** Hiển thị ở dạng inline (không bị bo vào card) hay card. Mặc định = card. */
  variant?: 'card' | 'inline';
  /** Phase nào đang active để highlight (theo status campaign). */
  highlightKey?: CampaignPhaseKey | null;
  /** Chỉ hiển thị một số phase (mặc định = tất cả). */
  visibleKeys?: CampaignPhaseKey[];
}

export default function CampaignPlaybook({
  label = 'Quy trình tổ chức',
  variant = 'card',
  highlightKey = null,
  visibleKeys,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<CampaignPhaseKey>(
    highlightKey ?? 'plan',
  );
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Đóng dropdown khi click ra ngoài / nhấn ESC.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const phases = visibleKeys
    ? CAMPAIGN_PLAYBOOK.filter((p) => visibleKeys.includes(p.key))
    : CAMPAIGN_PLAYBOOK;

  const active =
    phases.find((p) => p.key === activeKey) ?? phases[0] ?? CAMPAIGN_PLAYBOOK[0];

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={
        variant === 'card'
          ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors'
          : 'inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900'
      }
    >
      <span className="material-symbols-outlined text-[16px]">
        {open ? 'close' : 'route'}
      </span>
      {open ? 'Đóng' : label}
    </button>
  );

  return (
    <div ref={wrapRef} className={variant === 'card' ? 'cm-card p-5' : ''}>
      {variant === 'card' && (
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">
              route
            </span>
            <h3 className="font-extrabold text-neutral-900">
              Quy trình tổ chức chiến dịch
            </h3>
          </div>
          {trigger}
        </div>
      )}

      {variant === 'inline' && (
        <div className="flex items-center gap-2">
          {trigger}
          <p className="text-xs text-neutral-500">
            {phases.length} giai đoạn · dành cho charity owner
          </p>
        </div>
      )}

      {!open && variant === 'card' && (
        <p className="text-sm text-neutral-600 leading-relaxed">
          Xem gợi ý theo từng giai đoạn (lên kế hoạch → tuyển người → sơ chế → nấu
          → phát → tổng kết) để tránh bỏ sót bước.
        </p>
      )}

      {!open && variant === 'inline' && null}

      {open && (
        <div className={variant === 'card' ? 'mt-4' : 'mt-3'}>
          {/* Thanh chọn phase */}
          <div
            role="tablist"
            className="flex flex-wrap gap-2 pb-3 border-b border-neutral-200"
          >
            {phases.map((p) => {
              const isActive = p.key === activeKey;
              const isHighlighted = p.key === highlightKey;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveKey(p.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    isActive
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : isHighlighted
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:border-emerald-300'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {p.icon}
                  </span>
                  {p.title}
                  {isHighlighted && (
                    <span className="ml-1 text-[10px] uppercase tracking-wide">
                      · đang tới
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Nội dung phase */}
          {active && (
            <div className="mt-4">
              <div
                className={`rounded-2xl border p-4 ${TONE_BG[active.tone]}`}
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <span
                    className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${TONE_ICON[active.tone]}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {active.icon}
                    </span>
                  </span>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-extrabold text-base">
                        {active.title}
                      </h4>
                      <span className="cm-chip cm-chip--ink !text-[10px]">
                        {active.window}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed mt-1">
                      {active.summary}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-80 mb-2">
                      Các bước thực hiện
                    </p>
                    <ol className="space-y-1.5 text-sm">
                      {active.steps.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-white/70 text-[11px] font-extrabold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-80 mb-2">
                      Mẹo nhỏ
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      {active.tips.map((t, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="material-symbols-outlined text-[14px] mt-0.5">
                            tips_and_updates
                          </span>
                          <span className="leading-relaxed">{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-80 mb-2">
                      Đầu ra kỳ vọng
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      {active.deliverables.map((d, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="material-symbols-outlined text-[14px] mt-0.5">
                            check_circle
                          </span>
                          <span className="leading-relaxed">{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Điều hướng prev / next */}
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const idx = phases.findIndex((p) => p.key === activeKey);
                    if (idx > 0) setActiveKey(phases[idx - 1].key);
                  }}
                  disabled={phases.findIndex((p) => p.key === activeKey) === 0}
                  className="inline-flex items-center gap-1 text-xs font-bold text-neutral-700 hover:text-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    chevron_left
                  </span>
                  Giai đoạn trước
                </button>
                <span className="text-[11px] font-bold text-neutral-500">
                  {phases.findIndex((p) => p.key === activeKey) + 1}/
                  {phases.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const idx = phases.findIndex((p) => p.key === activeKey);
                    if (idx < phases.length - 1)
                      setActiveKey(phases[idx + 1].key);
                  }}
                  disabled={
                    phases.findIndex((p) => p.key === activeKey) ===
                    phases.length - 1
                  }
                  className="inline-flex items-center gap-1 text-xs font-bold text-neutral-700 hover:text-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Giai đoạn sau
                  <span className="material-symbols-outlined text-[16px]">
                    chevron_right
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}