'use client';

import { useState } from 'react';
import { useCreateReport } from '@/hooks/useReports';
import { ReportReason, ReportTargetType } from '@foodresq/types';

interface ReportIssueModalProps {
  /** Loại đối tượng bị báo cáo */
  targetKind: ReportTargetType.RESERVATION | ReportTargetType.LISTING;
  targetId: string;
  /** Tiêu đề listing (để hiển thị cho người dùng) */
  listingTitle: string;
  /** Callback khi submit thành công */
  onClose: () => void;
}

// Mỗi reason kèm label tiếng Việt + mô tả ngắn cho UX
const REASON_OPTIONS: { value: ReportReason; label: string; hint: string; icon: string }[] = [
  {
    value: ReportReason.SPOILED_FOOD,
    label: 'Thực phẩm bị hỏng',
    hint: 'Có mùi lạ, mốc, ôi thiu…',
    icon: 'sick',
  },
  {
    value: ReportReason.UNSAFE_FOOD,
    label: 'Không đảm bảo an toàn',
    hint: 'Bao bì rách, nhãn mác sai, không rõ nguồn gốc',
    icon: 'health_and_safety',
  },
  {
    value: ReportReason.HOARDING,
    label: 'Đặt nhiều không dùng hết',
    hint: 'Nghi ngờ gom hàng hoặc bán lại',
    icon: 'inventory_2',
  },
  {
    value: ReportReason.NO_SHOW_PROVIDER,
    label: 'Nhà cung cấp không giao',
    hint: 'Đến nơi mà không có người / không nhận đơn',
    icon: 'storefront',
  },
  {
    value: ReportReason.FAKE_ACCOUNT,
    label: 'Tài khoản giả mạo',
    hint: 'Thông tin nghi ngờ không trung thực',
    icon: 'person_off',
  },
  {
    value: ReportReason.OTHER,
    label: 'Vấn đề khác',
    hint: 'Mô tả chi tiết bên dưới',
    icon: 'more_horiz',
  },
];

export default function ReportIssueModal({
  targetKind,
  targetId,
  listingTitle,
  onClose,
}: ReportIssueModalProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const createReport = useCreateReport();

  const submit = async () => {
    if (!reason) return;
    try {
      await createReport.mutateAsync({
        targetType: targetKind,
        targetId,
        reason,
        description: description.trim() || undefined,
      });
      onClose();
    } catch {
      // hook tự log; toast xử lý ở parent nếu cần
    }
  };

  const selected = REASON_OPTIONS.find((r) => r.value === reason);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={() => !createReport.isPending && onClose()}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-1">
          <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined">report</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base text-neutral-900">Báo cáo vấn đề</h3>
            <p className="text-xs text-neutral-500 mt-0.5 truncate">{listingTitle}</p>
          </div>
          <button
            onClick={onClose}
            disabled={createReport.isPending}
            className="text-neutral-400 hover:text-neutral-700 disabled:opacity-50"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <p className="text-xs text-neutral-500 mt-3 mb-4 leading-relaxed">
          Báo cáo của bạn sẽ được đội ngũ quản trị xem xét. Các báo cáo có căn cứ sẽ giúp cộng đồng an toàn hơn.
        </p>

        <p className="text-sm font-bold text-neutral-800 mb-2">Vấn đề bạn gặp phải</p>
        <div className="space-y-2 mb-4">
          {REASON_OPTIONS.map((opt) => {
            const active = reason === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setReason(opt.value)}
                disabled={createReport.isPending}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors disabled:opacity-50 ${
                  active
                    ? 'border-rose-300 bg-rose-50'
                    : 'border-neutral-200 hover:border-neutral-300 bg-white'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    active ? 'bg-rose-600 text-white' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{opt.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`font-bold text-sm ${active ? 'text-rose-900' : 'text-neutral-800'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">{opt.hint}</p>
                </div>
                {active && (
                  <span className="material-symbols-outlined text-rose-600 self-center">check_circle</span>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-sm font-bold text-neutral-800 mb-1.5">
          Mô tả chi tiết {reason !== ReportReason.OTHER && <span className="text-neutral-400 font-normal">(tuỳ chọn)</span>}
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            selected?.value === ReportReason.SPOILED_FOOD
              ? 'VD: Phần cơm có mùi chua, bao bì không kín...'
              : selected?.value === ReportReason.NO_SHOW_PROVIDER
                ? 'VD: Đến điểm lấy lúc 18h nhưng cửa hàng đóng cửa, không ai nghe máy...'
                : 'Mô tả thêm để admin xử lý nhanh hơn'
          }
          rows={3}
          maxLength={1000}
          disabled={createReport.isPending}
          className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-200 resize-none disabled:opacity-50"
        />

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={createReport.isPending}
            className="flex-1 py-2.5 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            Đóng
          </button>
          <button
            onClick={submit}
            disabled={createReport.isPending || !reason}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {createReport.isPending ? (
              <>
                <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-3.5 h-3.5" />
                Đang gửi...
              </>
            ) : (
              'Gửi báo cáo'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
