'use client';

import '../../campaign-tokens.css';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  useCampaignManageDetail,
  useCampaignChangeRequests,
  useSubmitCampaignChange,
  useCancelCampaignChange,
  type CampaignChangeRequest,
} from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

/**
 * Chỉnh sửa chiến dịch — thực chất là GỬI YÊU CẦU THAY ĐỔI chờ admin duyệt.
 *
 * Chiến dịch đã công khai và đã có TNV đăng ký theo giờ/địa điểm cũ, nên tổ chức
 * không được sửa thẳng vào dữ liệu. Backend chỉ nhận qua `campaign_change_requests`,
 * admin duyệt rồi mới áp vào chiến dịch thật.
 */

type FormState = {
  scheduledDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  kitchenAddress: string;
  chefSlotsNeeded: string;
  waiterSlotsNeeded: string;
  shipperSlotsNeeded: string;
  reason: string;
};

const STATUS_META: Record<CampaignChangeRequest['status'], { label: string; cls: string }> = {
  pending: { label: 'Chờ admin duyệt', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Đã duyệt', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Bị từ chối', cls: 'bg-rose-100 text-rose-700' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-neutral-200 text-neutral-600' },
};

/** `2026-08-08T00:00:00Z` → `2026-08-08` cho <input type="date">. */
function toDateInput(v: string | null | undefined): string {
  return v ? new Date(v).toISOString().slice(0, 10) : '';
}

export default function CampaignEditPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const { data: c, isLoading, isError } = useCampaignManageDetail(id);
  const { data: history } = useCampaignChangeRequests(id, !!id);
  const submit = useSubmitCampaignChange();
  const cancelChange = useCancelCampaignChange();

  const [f, setF] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Khởi tạo form từ dữ liệu chiến dịch ở lần render đầu có dữ liệu. Không dùng
  // useEffect + setState (React 19 chặn) — chỉ cần giá trị nền khi f còn null.
  const base: FormState = {
    scheduledDate: toDateInput(c?.scheduledDate),
    endDate: toDateInput(c?.endDate),
    startTime: c?.startTime ?? '',
    endTime: c?.endTime ?? '',
    kitchenAddress: c?.kitchenAddress ?? '',
    chefSlotsNeeded: String(c?.chefSlotsNeeded ?? 0),
    waiterSlotsNeeded: String(c?.waiterSlotsNeeded ?? 0),
    shipperSlotsNeeded: String(c?.shipperSlotsNeeded ?? 0),
    reason: '',
  };
  const form = f ?? base;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF({ ...form, [k]: v });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[k as string];
      return next;
    });
  };

  const pending = (history ?? []).filter((h) => h.status === 'pending');

  if (isLoading) {
    return <div className="cm-scope cm-manage-page"><div className="h-64 skeleton rounded-2xl" /></div>;
  }
  if (isError || !c) {
    return (
      <div className="cm-scope cm-manage-page text-center py-20">
        <span className="material-symbols-outlined text-rose-600 text-[40px]">error</span>
        <p className="font-bold text-neutral-700 mt-3">Không tìm thấy chiến dịch</p>
        <Link href="/campaigns?tab=mine" className="cm-btn-ember inline-flex mt-5">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  /** Chỉ gửi field ĐÃ ĐỔI — gửi cả form thì admin không biết tổ chức muốn sửa gì. */
  function buildChangedPayload() {
    const changed: Record<string, string | number> = {};
    if (form.scheduledDate !== base.scheduledDate) changed.scheduledDate = form.scheduledDate;
    if (form.endDate !== base.endDate) changed.endDate = form.endDate;
    if (form.startTime !== base.startTime) changed.startTime = form.startTime;
    if (form.endTime !== base.endTime) changed.endTime = form.endTime;
    if (form.kitchenAddress.trim() !== base.kitchenAddress) {
      changed.kitchenAddress = form.kitchenAddress.trim();
    }
    (['chefSlotsNeeded', 'waiterSlotsNeeded', 'shipperSlotsNeeded'] as const).forEach((k) => {
      if (form[k] !== base[k]) changed[k] = Number(form[k]);
    });
    return changed;
  }

  function validate(changed: Record<string, string | number>): boolean {
    const next: Record<string, string> = {};
    if (form.startTime && form.endTime && form.endTime <= form.startTime) {
      next.endTime = 'Giờ kết thúc phải sau giờ bắt đầu';
    }
    if (form.endDate && form.scheduledDate && form.endDate < form.scheduledDate) {
      next.endDate = 'Ngày kết thúc phải từ ngày bắt đầu trở đi';
    }
    if (form.kitchenAddress.trim().length > 0 && form.kitchenAddress.trim().length < 5) {
      next.kitchenAddress = 'Địa chỉ tối thiểu 5 ký tự';
    }
    (['chefSlotsNeeded', 'waiterSlotsNeeded', 'shipperSlotsNeeded'] as const).forEach((k) => {
      const v = Number(form[k]);
      if (!Number.isInteger(v) || v < 0) next[k] = 'Phải là số nguyên ≥ 0';
      else if (v > 50) next[k] = 'Tối đa 50 người';
    });
    // Giảm số người xuống dưới số ĐÃ DUYỆT thì những người thừa ra không biết xử lý sao.
    const filled = {
      chefSlotsNeeded: c!.chefSlotsFilled,
      waiterSlotsNeeded: c!.waiterSlotsFilled,
      shipperSlotsNeeded: c!.shipperSlotsFilled,
    };
    (Object.keys(filled) as Array<keyof typeof filled>).forEach((k) => {
      if (changed[k] !== undefined && Number(changed[k]) < filled[k]) {
        next[k] = `Đã duyệt ${filled[k]} người — không giảm xuống thấp hơn`;
      }
    });
    if (form.reason.trim().length > 0 && form.reason.trim().length < 10) {
      next.reason = 'Lý do nên dài ít nhất 10 ký tự';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const changed = buildChangedPayload();
    if (Object.keys(changed).length === 0) {
      toast.info('Bạn chưa thay đổi thông tin nào.');
      return;
    }
    if (!validate(changed)) {
      toast.error('Vui lòng kiểm tra lại các trường được tô đỏ.');
      return;
    }
    if (pending.length > 0) {
      toast.error('Đang có một yêu cầu chờ duyệt — huỷ nó trước khi gửi yêu cầu mới.');
      return;
    }
    try {
      await submit.mutateAsync({
        id,
        input: { ...changed, ...(form.reason.trim() ? { reason: form.reason.trim() } : {}) },
      });
      toast.success('Đã gửi yêu cầu thay đổi. Chờ quản trị viên duyệt.');
      setF(null);
    } catch (err) {
      toast.error(errMsg(err, 'Gửi yêu cầu thất bại'));
    }
  }

  const changedCount = Object.keys(buildChangedPayload()).length;
  const err = (k: string) => (errors[k] ? '!border-rose-500 !ring-1 !ring-rose-200' : '');

  return (
    <div className="cm-scope">
      <div className="cm-manage-page space-y-5">
        <header className="bg-white rounded-2xl border border-neutral-150 p-5">
          <div className="flex items-start gap-3">
            {/* Lối thoát rõ ràng ở ĐẦU trang — trước đây chỉ có link "Quay lại" nằm
                tận cuối form, phải cuộn hết mới thấy. */}
            <Link
              href={`/campaigns/${id}/manage`}
              aria-label="Quay lại trang quản lý"
              title="Quay lại trang quản lý"
              className="shrink-0 w-9 h-9 rounded-xl border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">
                Chỉnh sửa chiến dịch
              </p>
              <h1 className="mt-1 text-xl font-extrabold text-neutral-900">{c.title}</h1>
            </div>
            <Link
              href={`/campaigns/${id}/manage`}
              aria-label="Đóng"
              className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </Link>
          </div>
          <p className="mt-2.5 text-sm text-neutral-500">
            Chiến dịch đã công khai và có tình nguyện viên đăng ký theo lịch cũ, nên thay đổi
            phải được <b>quản trị viên duyệt</b> trước khi áp dụng.
          </p>
        </header>

        {pending.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
              Đang có {pending.length} yêu cầu chờ duyệt
            </p>
            <p className="text-xs text-amber-800 mt-1">
              Chỉ được có một yêu cầu chờ duyệt tại một thời điểm. Huỷ yêu cầu cũ nếu muốn sửa lại.
            </p>
            <div className="mt-3 space-y-2">
              {pending.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 flex-1 text-neutral-700">
                    {h.reason || 'Không ghi lý do'}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await cancelChange.mutateAsync(h.id);
                        toast.success('Đã huỷ yêu cầu.');
                      } catch (e) {
                        toast.error(errMsg(e, 'Huỷ thất bại'));
                      }
                    }}
                    disabled={cancelChange.isPending}
                    className="shrink-0 font-bold text-rose-700 hover:underline disabled:opacity-50"
                  >
                    Huỷ yêu cầu
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-neutral-150 p-5 space-y-5">
          <section>
            <h2 className="cm-form-block-label">
              <span className="material-symbols-outlined">event</span>Thời gian
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="cm-field-label">Ngày bắt đầu</span>
                <input
                  type="date"
                  value={form.scheduledDate}
                  onChange={(e) => set('scheduledDate', e.target.value)}
                  className={`cm-input ${err('scheduledDate')}`}
                />
              </label>
              <label className="block">
                <span className="cm-field-label">Ngày kết thúc</span>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => set('endDate', e.target.value)}
                  className={`cm-input ${err('endDate')}`}
                />
                {errors.endDate && <FieldError msg={errors.endDate} />}
              </label>
              <label className="block">
                <span className="cm-field-label">Giờ bắt đầu</span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => set('startTime', e.target.value)}
                  className={`cm-input ${err('startTime')}`}
                />
              </label>
              <label className="block">
                <span className="cm-field-label">Giờ kết thúc</span>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => set('endTime', e.target.value)}
                  className={`cm-input ${err('endTime')}`}
                />
                {errors.endTime && <FieldError msg={errors.endTime} />}
              </label>
            </div>
          </section>

          <section>
            <h2 className="cm-form-block-label">
              <span className="material-symbols-outlined">place</span>Địa điểm bếp
            </h2>
            <input
              value={form.kitchenAddress}
              onChange={(e) => set('kitchenAddress', e.target.value)}
              placeholder="Địa chỉ bếp"
              className={`cm-input ${err('kitchenAddress')}`}
            />
            {errors.kitchenAddress && <FieldError msg={errors.kitchenAddress} />}
          </section>

          <section>
            <h2 className="cm-form-block-label">
              <span className="material-symbols-outlined">groups</span>Nhân sự
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ['chefSlotsNeeded', 'Đầu bếp', c.chefSlotsFilled],
                  ['waiterSlotsNeeded', 'Phục vụ', c.waiterSlotsFilled],
                  ['shipperSlotsNeeded', 'Giao hàng', c.shipperSlotsFilled],
                ] as const
              ).map(([key, label, filled]) => (
                <label key={key} className="block">
                  <span className="cm-field-label">{label}</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                    className={`cm-input ${err(key)}`}
                  />
                  <span className="cm-field-hint">Đã duyệt: {filled}</span>
                  {errors[key] && <FieldError msg={errors[key]} />}
                </label>
              ))}
            </div>
          </section>

          <section>
            <h2 className="cm-form-block-label">
              <span className="material-symbols-outlined">edit_note</span>Lý do thay đổi
            </h2>
            <textarea
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Vì sao cần thay đổi? Admin dựa vào đây để duyệt nhanh hơn."
              className={`cm-input ${err('reason')}`}
            />
            {errors.reason && <FieldError msg={errors.reason} />}
          </section>

          <div className="flex items-center gap-3 border-t border-neutral-100 pt-4">
            <Link href={`/campaigns/${id}/manage`} className="cm-btn-cancel">
              Quay lại
            </Link>
            <span className="text-xs text-neutral-500">
              {changedCount === 0 ? 'Chưa có thay đổi nào' : `${changedCount} thay đổi`}
            </span>
            <button
              type="submit"
              disabled={submit.isPending || changedCount === 0 || pending.length > 0}
              className="cm-btn-submit ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              {submit.isPending ? 'Đang gửi...' : 'Gửi yêu cầu thay đổi'}
            </button>
          </div>
        </form>

        {(history ?? []).length > 0 && (
          <section className="bg-white rounded-2xl border border-neutral-150 p-5">
            <h2 className="font-bold text-neutral-900 mb-3">Lịch sử yêu cầu</h2>
            <ul className="space-y-2">
              {(history ?? []).map((h) => {
                const meta = STATUS_META[h.status];
                return (
                  <li
                    key={h.id}
                    className="flex items-start gap-3 rounded-xl border border-neutral-150 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-neutral-800">{h.reason || 'Không ghi lý do'}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        {[
                          h.scheduledDate && `ngày → ${toDateInput(h.scheduledDate)}`,
                          h.startTime && `giờ → ${h.startTime}`,
                          h.endTime && `→ ${h.endTime}`,
                          h.kitchenAddress && 'đổi địa điểm',
                          h.chefSlotsNeeded != null && `bếp → ${h.chefSlotsNeeded}`,
                          h.waiterSlotsNeeded != null && `phục vụ → ${h.waiterSlotsNeeded}`,
                          h.shipperSlotsNeeded != null && `giao hàng → ${h.shipperSlotsNeeded}`,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Không có thay đổi'}
                      </p>
                      {h.reviewNote && (
                        <p className="text-[11px] text-neutral-600 mt-1 italic">
                          Admin: {h.reviewNote}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${meta.cls}`}
                    >
                      {meta.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function FieldError({ msg }: { msg: string }) {
  return (
    <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
      <span className="material-symbols-outlined text-[13px]">error</span>
      {msg}
    </p>
  );
}
