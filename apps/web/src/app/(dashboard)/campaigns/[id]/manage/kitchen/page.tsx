'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useManageContext } from '../../../_components/ManageShell';
import { useReviewQcStep, type DishProcessItem, type DishStep } from '@/hooks/useCampaigns';
import { errMsg, mediaUrl } from '@/lib/utils';

/**
 * Tab "Quy trình bếp" — tổ chức theo dõi TNV đang làm gì trong bếp (4 khâu mỗi món,
 * ai làm, ảnh bằng chứng) và DUYỆT ẢNH khâu QC: chef chụp ảnh QC xong thì món bị
 * giữ ở trạng thái chờ duyệt, tổ chức duyệt xong khâu "Sẵn sàng xuất phát" mới mở.
 */

const STEP_STATUS_LABEL: Record<string, string> = {
  locked: 'Chưa mở',
  available: 'Đang làm',
  done: 'Xong',
};

export default function KitchenProcessPage() {
  const { campaign: c } = useManageContext();
  const dishes = c.dishSteps ?? [];

  const pendingReviews = dishes.reduce(
    (sum, d) =>
      sum + d.steps.filter((s) => s.stepOrder === 3 && s.status === 'done' && s.reviewStatus === 'pending').length,
    0,
  );

  if (c.status !== 'in_progress') {
    return (
      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title !mb-1">
          <span className="material-symbols-outlined">skillet</span>
          Quy trình bếp
        </h2>
        <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center text-xs text-neutral-500">
          Quy trình bếp chỉ hiển thị khi chiến dịch đang diễn ra. Bắt đầu chiến dịch để theo dõi
          các khâu Sơ chế → Nấu → QC → Sẵn sàng xuất phát của từng món.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="cm-manage-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="cm-manage-card-title !mb-1">
              <span className="material-symbols-outlined">skillet</span>
              Quy trình bếp ({dishes.length} món)
            </h2>
            <p className="cm-manage-card-sub !mt-0">
              Theo dõi TNV làm từng khâu và duyệt ảnh QC — món chỉ được chuyển sang
              &quot;Sẵn sàng xuất phát&quot; sau khi bạn duyệt ảnh.
            </p>
          </div>
          {pendingReviews > 0 && (
            <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800">
              {pendingReviews} ảnh QC chờ duyệt
            </span>
          )}
        </div>
      </section>

      {dishes.length === 0 ? (
        <section className="cm-manage-card">
          <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center text-xs text-neutral-500">
            Chưa có món nào trong thực đơn — thêm món ở tab &quot;Thực đơn &amp; Vật phẩm&quot;.
          </p>
        </section>
      ) : (
        dishes.map((dish) => <DishCard key={dish.id} dish={dish} campaignId={c.id} />)
      )}
    </div>
  );
}

function DishCard({ dish, campaignId }: { dish: DishProcessItem; campaignId: string }) {
  const doneCount = dish.steps.filter((s) => s.effectiveStatus === 'done').length;
  const finalDone = dish.steps.some((s) => s.stepOrder === 4 && s.effectiveStatus === 'done');

  return (
    <section className="cm-manage-card !p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-3.5">
        <div className="min-w-0">
          <p className="font-extrabold text-neutral-900">{dish.name}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {dish.plannedServings ? `${dish.plannedServings} suất · ` : ''}
            {doneCount}/{dish.steps.length} khâu hoàn thành
          </p>
        </div>
        {finalDone ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">
            ✓ Sẵn sàng xuất phát
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-600">
            Đang chế biến
          </span>
        )}
      </div>

      <ol className="grid grid-cols-1 divide-y divide-neutral-100 md:grid-cols-4 md:divide-x md:divide-y-0">
        {dish.steps.map((step) => (
          <StepReviewCell key={step.id} step={step} campaignId={campaignId} />
        ))}
      </ol>
    </section>
  );
}

function StepReviewCell({ step, campaignId }: { step: DishStep; campaignId: string }) {
  const review = useReviewQcStep();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const isDone = step.effectiveStatus === 'done';
  const isQcStep = step.stepOrder === 3;
  const needsReview = isQcStep && step.status === 'done' && step.reviewStatus === 'pending';

  async function submit(action: 'approve' | 'reject') {
    if (action === 'reject' && !reason.trim()) {
      toast.error('Nhập lý do từ chối để chef biết cần chỉnh gì.');
      return;
    }
    try {
      await review.mutateAsync({
        campaignId,
        stepId: step.id,
        action,
        reason: action === 'reject' ? reason.trim() : undefined,
      });
      toast.success(
        action === 'approve'
          ? 'Đã duyệt ảnh QC — khâu "Sẵn sàng xuất phát" được mở cho chef.'
          : 'Đã từ chối — chef sẽ được báo để kiểm tra lại món và chụp ảnh mới.',
      );
      setRejecting(false);
      setReason('');
    } catch (e) {
      toast.error(errMsg(e, 'Không thể gửi kết quả duyệt'));
    }
  }

  const tone = needsReview
    ? 'bg-amber-50/70'
    : isDone
      ? 'bg-emerald-50/50'
      : step.effectiveStatus === 'available'
        ? 'bg-white'
        : 'bg-neutral-50 opacity-80';

  return (
    <li className={`flex flex-col gap-2 p-4 ${tone}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold text-neutral-900">{step.stepName}</p>
        <span className="text-[10px] font-bold text-neutral-400">Khâu {step.stepOrder} · {step.scheduledTime}</span>
      </div>

      <span
        className={`self-start rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
          isDone
            ? 'bg-emerald-100 text-emerald-800'
            : step.effectiveStatus === 'available'
              ? 'bg-sky-100 text-sky-800'
              : 'bg-neutral-200 text-neutral-600'
        }`}
      >
        {STEP_STATUS_LABEL[step.effectiveStatus] ?? step.effectiveStatus}
      </span>

      {step.proofUrl && (
        <a href={mediaUrl(step.proofUrl)} target="_blank" rel="noreferrer" title="Mở ảnh gốc">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(step.proofUrl)}
            alt={`Ảnh bằng chứng ${step.stepName}`}
            className={`h-24 w-full rounded-lg border object-cover ${
              needsReview ? 'border-amber-300 ring-1 ring-amber-200' : 'border-neutral-200'
            }`}
          />
        </a>
      )}

      {step.completedAt && (
        <p className="text-[10px] text-neutral-500">
          {new Date(step.completedAt).toLocaleString('vi-VN', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
          })}
          {step.completedByVolunteer?.user.fullName ? ` · ${step.completedByVolunteer.user.fullName}` : ''}
        </p>
      )}
      {step.note && <p className="text-[10px] italic text-neutral-500">Ghi chú: {step.note}</p>}

      {/* ── Duyệt ảnh QC ── */}
      {needsReview && (
        <div className="mt-auto space-y-1.5 rounded-lg border border-amber-200 bg-white p-2">
          <p className="text-[11px] font-extrabold text-amber-800">
            Ảnh QC chờ bạn duyệt — duyệt xong chef mới xác nhận được &quot;Sẵn sàng xuất phát&quot;.
          </p>
          {rejecting ? (
            <>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Lý do từ chối (vd: món chưa đủ chín, trình bày chưa đạt…)"
                className="w-full resize-none rounded-md border border-neutral-200 px-2 py-1.5 text-xs outline-none focus:border-rose-400"
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void submit('reject')}
                  disabled={review.isPending}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {review.isPending ? 'Đang gửi…' : 'Xác nhận từ chối'}
                </button>
                <button
                  type="button"
                  onClick={() => { setRejecting(false); setReason(''); }}
                  disabled={review.isPending}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[11px] font-bold text-neutral-600 hover:bg-neutral-50"
                >
                  Hủy
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => void submit('approve')}
                disabled={review.isPending}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[14px]">check</span>
                {review.isPending ? 'Đang duyệt…' : 'Duyệt ảnh'}
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={review.isPending}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
                Từ chối
              </button>
            </div>
          )}
        </div>
      )}

      {isQcStep && step.reviewStatus === 'approved' && (
        <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
          <span className="material-symbols-outlined text-[13px]">verified</span>
          Ảnh đã được duyệt
          {step.reviewedAt ? ` · ${new Date(step.reviewedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </p>
      )}
      {isQcStep && step.reviewStatus === 'rejected' && (
        <p className="rounded-md bg-rose-50 px-2 py-1.5 text-[11px] font-semibold text-rose-700">
          Món đã bị huỷ — QC không đạt: {step.reviewNote}
        </p>
      )}
    </li>
  );
}
