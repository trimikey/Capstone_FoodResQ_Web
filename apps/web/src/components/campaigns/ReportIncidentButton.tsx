'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import { useReportCampaignIncident, type IncidentContext } from '@/hooks/useCampaigns';
import { INCIDENT_CONTEXT_LABEL, INCIDENT_REASONS } from '@/lib/campaign-incidents';
import { errMsg } from '@/lib/utils';

/**
 * Nút "Báo sự cố" cho shipper khi đi lấy nguyên liệu / đi phát suất ăn của chiến dịch.
 * Chọn lý do có sẵn hoặc nhập tay, ảnh tuỳ chọn — tổ chức được báo ngay.
 * Không dùng cho luồng giao hàng đơn lẻ (deliveries).
 */
export default function ReportIncidentButton({
  campaignId,
  context,
  referenceId,
  subject,
  compact = false,
}: {
  campaignId: string;
  context: IncidentContext;
  /** ID đơn nguyên liệu (pickup) hoặc đợt phát (distribution). */
  referenceId?: string;
  /** Việc đang làm, hiện trong tiêu đề hộp thoại (vd "Gạo sạch · Vựa gạo"). */
  subject?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 items-center gap-1 rounded-xl border border-rose-200 bg-white font-bold text-rose-600 transition-colors hover:bg-rose-50 ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
        }`}
      >
        <span className="material-symbols-outlined text-[15px]">report</span>
        Báo sự cố
      </button>
      {open && (
        <ReportIncidentModal
          campaignId={campaignId}
          context={context}
          referenceId={referenceId}
          subject={subject}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ReportIncidentModal({
  campaignId,
  context,
  referenceId,
  subject,
  onClose,
}: {
  campaignId: string;
  context: IncidentContext;
  referenceId?: string;
  subject?: string;
  onClose: () => void;
}) {
  const report = useReportCampaignIncident();
  const [reasonCode, setReasonCode] = useState('');
  const [detail, setDetail] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // null = chưa chọn — bắt shipper nói rõ còn đi tiếp được không, tổ chức xử lý theo đó.
  const [canContinue, setCanContinue] = useState<boolean | null>(null);
  const [delayMinutes, setDelayMinutes] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const reasons = INCIDENT_REASONS[context];

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function submit() {
    if (!reasonCode) return toast.error('Chọn loại sự cố.');
    if (reasonCode === 'other' && !detail.trim()) {
      return toast.error('Mô tả ngắn sự cố bạn đang gặp.');
    }
    if (canContinue === null) return toast.error('Cho biết bạn còn tiếp tục được không.');
    try {
      await report.mutateAsync({
        campaignId,
        context,
        referenceId,
        reasonCode,
        detail: detail.trim() || undefined,
        photo,
        canContinue,
        delayMinutes: canContinue ? delayMinutes : undefined,
      });
      toast.success(
        canContinue
          ? 'Đã báo sự cố — tổ chức đã nhận được thông báo.'
          : 'Đã báo sự cố và trả việc — tổ chức sẽ đổi người khác thay bạn.',
      );
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Không gửi được báo cáo sự cố'));
    }
  }

  return (
    <Modal
      onClose={onClose}
      align="center"
      className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-neutral-150 bg-white elevation-3"
    >
      <div className="shrink-0 bg-rose-600 px-6 py-5 text-white">
        <h3 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="material-symbols-outlined">report</span>
          Báo sự cố · {INCIDENT_CONTEXT_LABEL[context]}
        </h3>
        {subject && <p className="mt-1 truncate text-xs text-white/85">{subject}</p>}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-600">
            Chuyện gì đang xảy ra? <span className="text-rose-500">*</span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {reasons.map((r) => (
              <button
                key={r.code}
                type="button"
                aria-pressed={reasonCode === r.code}
                onClick={() => setReasonCode(r.code)}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                  reasonCode === r.code
                    ? 'border-rose-500 bg-rose-50 text-rose-800'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:border-rose-300'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{r.icon}</span>
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-600">
            Bạn còn tiếp tục được không? <span className="text-rose-500">*</span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={canContinue === true}
              onClick={() => setCanContinue(true)}
              className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                canContinue === true
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:border-emerald-300'
              }`}
            >
              <span className="block font-bold">Vẫn tiếp tục</span>
              <span className="text-[11px]">Chỉ báo để tổ chức nắm, có thể trễ</span>
            </button>
            <button
              type="button"
              aria-pressed={canContinue === false}
              onClick={() => setCanContinue(false)}
              className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                canContinue === false
                  ? 'border-rose-500 bg-rose-50 text-rose-800'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:border-rose-300'
              }`}
            >
              <span className="block font-bold">Không thể tiếp tục</span>
              <span className="text-[11px]">Trả việc để tổ chức đổi người khác</span>
            </button>
          </div>
          {canContinue === true && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-neutral-600">Trễ khoảng:</span>
              {[0, 15, 30, 60].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDelayMinutes(m)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                    delayMinutes === m
                      ? 'border-emerald-500 bg-emerald-600 text-white'
                      : 'border-neutral-200 bg-white text-neutral-600'
                  }`}
                >
                  {m === 0 ? 'Không trễ' : `${m} phút`}
                </button>
              ))}
            </div>
          )}
          {canContinue === false && (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
              Việc này sẽ được gỡ khỏi danh sách của bạn và trở về chờ tổ chức phân công người khác.
              Bạn không bị trừ uy tín khi báo sự cố hợp lệ.
            </p>
          )}
        </div>

        <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-neutral-600">
          Mô tả thêm {reasonCode === 'other' && <span className="text-rose-500">*</span>}
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="VD: xe thủng lốp ở đường Võ Văn Ngân, dự kiến trễ 30 phút."
            className="input-base resize-none normal-case"
          />
        </label>

        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">Ảnh hiện trường (tuỳ chọn)</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f && f.type.startsWith('image/')) setPhoto(f);
            }}
          />
          <div className="flex items-center gap-3">
            {preview && photo ? (
              <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-neutral-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Ảnh sự cố" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setPhoto(null);
                    setPreview(null);
                  }}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                  aria-label="Xoá ảnh"
                >
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200"
            >
              <span className="material-symbols-outlined text-[15px]">add_a_photo</span>
              {photo ? 'Đổi ảnh' : 'Chụp / tải ảnh'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 border-t border-neutral-100 p-4">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-bold text-neutral-700 hover:bg-neutral-50"
        >
          Huỷ
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={report.isPending}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">send</span>
          {report.isPending ? 'Đang gửi…' : 'Gửi báo cáo'}
        </button>
      </div>
    </Modal>
  );
}
