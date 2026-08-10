'use client';

import Link from 'next/link';
import { useManageContext, STATUS_META } from '../../../_components/ManageShell';
import { campaignStartWindow } from '@/lib/campaign-schedule';

/**
 * Trạng thái chiến dịch: đang ở giai đoạn nào, mốc nào đã qua, và còn hành động gì.
 *
 * Các nút Hoàn tất / Huỷ dùng chung modal của ManageShell (`openAction`) để logic
 * xác nhận + gọi API nằm một chỗ, không nhân bản ở từng trang.
 */

type StageKey = 'draft' | 'open' | 'in_progress' | 'done';

const STAGES: Array<{ key: StageKey; label: string; desc: string; icon: string }> = [
  { key: 'draft', label: 'Chờ duyệt', desc: 'Quản trị viên xem xét yêu cầu tạo chiến dịch.', icon: 'pending' },
  { key: 'open', label: 'Đang tuyển', desc: 'Chiến dịch công khai, tình nguyện viên đăng ký ca.', icon: 'campaign' },
  { key: 'in_progress', label: 'Đang diễn ra', desc: 'Bếp hoạt động — TNV điểm danh và cập nhật công việc.', icon: 'play_circle' },
  { key: 'done', label: 'Kết thúc', desc: 'Đã hoàn tất hoặc bị huỷ — chỉ còn xem lại số liệu.', icon: 'flag' },
];

function stageOf(status: string): StageKey {
  if (status === 'draft') return 'draft';
  if (status === 'open') return 'open';
  if (status === 'in_progress') return 'in_progress';
  return 'done';
}

export default function CampaignStatusPage() {
  const { campaign: c, openAction } = useManageContext();
  const meta = STATUS_META[c.status] ?? { label: c.status, chip: 'cm-chip cm-chip--ink', icon: 'help' };
  const current = stageOf(c.status);
  const currentIndex = STAGES.findIndex((s) => s.key === current);
  const isClosed = c.status === 'completed' || c.status === 'cancelled';
  const startWindow = campaignStartWindow(c);

  const totalNeeded = c.chefSlotsNeeded + c.waiterSlotsNeeded + c.shipperSlotsNeeded;
  const totalFilled = c.chefSlotsFilled + c.waiterSlotsFilled + c.shipperSlotsFilled;
  const pendingCount = (c.participants ?? []).filter((p) => (p.status ?? 'pending') === 'pending').length;
  const served = c.distributionSummary?.servingsServed ?? 0;
  const target = c.expectedServings ?? 0;

  return (
    <div className="space-y-4">
      <section className="cm-manage-card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="cm-manage-card-title">
              <span className="material-symbols-outlined text-[20px]">flag</span>
              Trạng thái chiến dịch
            </h2>
            <p className="cm-manage-card-sub">Giai đoạn hiện tại và các hành động còn lại.</p>
          </div>
          <span className={meta.chip}>
            <span className="material-symbols-outlined text-[14px]">{meta.icon}</span>
            {meta.label}
          </span>
        </div>

        <ol className="mt-5 space-y-0">
          {STAGES.map((s, i) => {
            const done = i < currentIndex || (isClosed && s.key === 'done');
            const active = s.key === current;
            return (
              <li key={s.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      active
                        ? 'bg-[#236c2a] text-white'
                        : done
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-neutral-100 text-neutral-400'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {done && !active ? 'check' : s.icon}
                    </span>
                  </span>
                  {i < STAGES.length - 1 && <span className="w-px flex-1 bg-neutral-200 my-1" />}
                </div>
                <div className="pb-5 min-w-0">
                  <p className={`text-sm font-bold ${active ? 'text-neutral-900' : 'text-neutral-500'}`}>
                    {s.label}
                    {active && <span className="ml-2 text-[11px] font-bold text-emerald-700">← hiện tại</span>}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">{s.desc}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title">
          <span className="material-symbols-outlined text-[20px]">insights</span>
          Số liệu nhanh
        </h2>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Nhân sự" value={`${totalFilled}/${totalNeeded}`} unit="người" />
          <Stat label="Chờ duyệt" value={String(pendingCount)} unit="đăng ký" tone={pendingCount > 0 ? 'amber' : undefined} />
          <Stat label="Đã phát" value={String(served)} unit="suất" />
          <Stat
            label="Mục tiêu"
            value={target > 0 ? `${Math.round((served / target) * 100)}%` : '—'}
            unit={target > 0 ? `của ${target}` : 'chưa đặt'}
          />
        </div>

        {pendingCount > 0 && (
          <Link
            href={`/campaigns/${c.id}/manage/registrations`}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:underline"
          >
            <span className="material-symbols-outlined text-[15px]">pending_actions</span>
            Có {pendingCount} đăng ký chờ duyệt — xem ngay
          </Link>
        )}
      </section>

      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title">
          <span className="material-symbols-outlined text-[20px]">bolt</span>
          Hành động
        </h2>

        {isClosed ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-semibold text-neutral-600">
            <span className="material-symbols-outlined text-[15px] shrink-0">lock</span>
            Chiến dịch đã kết thúc — không còn thao tác nào. Số liệu vẫn xem lại được ở các tab bên trái.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {c.status === 'in_progress' && (
              <button
                type="button"
                onClick={() => openAction('complete')}
                className="cm-manage-cta-primary inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">edit_note</span>
                Kết thúc &amp; nhập số suất
              </button>
            )}
            {c.status === 'open' && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-600">
                <span className="material-symbols-outlined text-[15px]">info</span>
                {startWindow.canStart
                  ? 'Đã tới giờ — bấm “Bắt đầu” ở đầu trang quản lý.'
                  : startWindow.message}
              </span>
            )}
            {(c.status === 'open' || c.status === 'in_progress') && (
              <button
                type="button"
                onClick={() => openAction('cancel')}
                className="cm-manage-cta-secondary inline-flex items-center gap-1.5 !text-rose-700"
              >
                <span className="material-symbols-outlined text-[16px]">cancel</span>
                Huỷ chiến dịch
              </button>
            )}
            <Link
              href={`/campaigns/${c.id}/edit`}
              className="cm-manage-cta-secondary inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              Yêu cầu thay đổi
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: 'amber';
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-neutral-150 bg-neutral-50'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold tabular-nums text-neutral-900">{value}</p>
      <p className="text-[11px] text-neutral-500">{unit}</p>
    </div>
  );
}
