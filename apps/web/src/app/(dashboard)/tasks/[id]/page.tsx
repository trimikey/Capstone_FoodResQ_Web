'use client';

import { useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTask, useAdvanceTask, type TaskDetail } from '@/hooks/useCampaigns';
import { errMsg, mediaUrl } from '@/lib/utils';
import { ROLE_META } from '../../campaigns/_components/RoleBadge';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-neutral-200 rounded ${className ?? ''}`} />;
}

const TASK_STATUS_META: Record<string, { label: string; chip: string; color: string }> = {
  pending: { label: 'Chờ duyệt', chip: 'cm-chip cm-chip--honey', color: 'text-honey-700' },
  rejected: { label: 'Bị từ chối', chip: 'cm-chip cm-chip--rose', color: 'text-rose-600' },
  assigned: { label: 'Đã nhận việc', chip: 'cm-chip cm-chip--sky', color: 'text-sky-700' },
  checked_in: { label: 'Đã điểm danh', chip: 'cm-chip cm-chip--mint', color: 'text-emerald-700' },
  in_progress: { label: 'Đang làm', chip: 'cm-chip cm-chip--honey', color: 'text-honey-700' },
  completed: { label: 'Hoàn thành', chip: 'cm-chip cm-chip--mint', color: 'text-emerald-700' },
  absent: { label: 'Vắng', chip: 'cm-chip cm-chip--rose', color: 'text-rose-600' },
  cancelled: { label: 'Đã huỷ', chip: 'cm-chip cm-chip--ink', color: 'text-neutral-600' },
};

const ROLE_ICONS: Record<string, string> = {
  chef: 'soup_kitchen',
  waiter: 'room_service',
  shipper: 'local_shipping',
};

const TASK_STEPS = [
  { key: 'assigned', label: 'Nhận việc', icon: 'task_alt' },
  { key: 'checked_in', label: 'Điểm danh', icon: 'how_to_reg' },
  { key: 'in_progress', label: 'Đang làm', icon: 'restaurant' },
  { key: 'completed', label: 'Hoàn thành', icon: 'verified' },
];

function chainItemColor(done: boolean, inProgress: boolean, total: number, completed: number): string {
  if (total === 0) return 'bg-neutral-200';
  if (completed === total) return 'bg-emerald-500';
  if (inProgress) return 'bg-amber-400';
  if (done) return 'bg-emerald-400';
  return 'bg-neutral-200';
}

const TASK_NEXT: Record<string, (role: string) => { label: string; needsPhoto: boolean } | null> = {
  assigned: () => ({ label: 'Điểm danh tại bếp', needsPhoto: false }),
  checked_in: (role) => ({
    label: role === 'chef' ? 'Bắt đầu nấu (chụp nguyên liệu)' : 'Bắt đầu làm việc',
    needsPhoto: role === 'chef',
  }),
  in_progress: (role) => ({
    label: role === 'shipper' ? 'Hoàn thành giao (chụp ảnh)' : 'Hoàn thành (chụp ảnh kết quả)',
    needsPhoto: true,
  }),
};

/** Tính trạng thái thời gian của 1 nhiệm vụ trong ca so với hiện tại.
 *  time format từ scheduleItems: "06:00 - 08:00" hoặc "06:00 - 07:00"
 */
type TaskTimeStatus = {
  /** Phút đã trôi qua so với mốc bắt đầu (âm = chưa tới, 0+ = đã tới) */
  diffMinutes: number;
  status: 'upcoming' | 'on_time' | 'late' | 'past';
  /** Số phút trễ (chỉ khi status = 'late') */
  lateMinutes: number;
  /** true nếu đang trong khoảng thời gian thực hiện */
  isActive: boolean;
};

function parseTimeRange(datePart: string, timeStr: string | undefined, now: Date): TaskTimeStatus | null {
  if (!timeStr) return null;
  const parts = timeStr.split('-').map((s) => s.trim());
  if (parts.length === 0) return null;

  const toDate = (hhmm: string): Date | null => {
    const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date(`${datePart}T${m[1].padStart(2, '0')}:${m[2]}:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const start = toDate(parts[0]);
  const end = parts[1] ? toDate(parts[1]) : null;
  if (!start) return null;

  const startMs = start.getTime();
  const nowMs = now.getTime();
  const diffMinutes = Math.floor((nowMs - startMs) / 60_000);
  const lateMinutes = Math.max(0, diffMinutes);

  const isActive = end ? nowMs >= startMs && nowMs <= end.getTime() : nowMs >= startMs;
  const isPast = end ? nowMs > end.getTime() : false;

  let status: TaskTimeStatus['status'];
  if (isPast) status = 'past';
  else if (isActive && diffMinutes >= 0) status = diffMinutes > 0 ? 'late' : 'on_time';
  else status = 'upcoming';

  return { diffMinutes, status, lateMinutes, isActive };
}

/** Sidebar trái: hiện đầy đủ nhiệm vụ + ca + chain */
function TaskSidebar({ task }: { task: TaskDetail }) {
  const fullSchedule = task.campaign.scheduleItems ?? [];
  const matchingItems = fullSchedule.filter((s) => task.taskList.includes(s.label));

  return (
    <aside className="bg-white rounded-2xl border border-neutral-200 p-4 lg:sticky lg:top-4 space-y-5">
      {/* Ca trực */}
      {task.shift && (
        <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-4 text-white shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold opacity-80 tracking-wider mb-1">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            Ca trực của bạn
          </div>
          <div className="font-bold text-base">{task.shift.label}</div>
          <div className="text-emerald-100 text-xs mt-1">
            {task.shift.startTime} – {task.shift.endTime}
          </div>
        </div>
      )}

      {/* Nhiệm vụ */}
      <div>
        <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">checklist</span>
          Nhiệm vụ của bạn trong ca
          {matchingItems.length > 0 && (
            <span className="ml-auto text-emerald-600">({matchingItems.length})</span>
          )}
        </h3>

        {matchingItems.length > 0 ? (
          <div className="relative pl-5">
            <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-emerald-200" />
            <ol className="space-y-3">
              {matchingItems.map((item, i) => (
                <li key={i} className="relative">
                  <div className="absolute -left-[12px] top-1.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white shadow-sm" />
                  <div className="rounded-lg bg-emerald-50/50 border border-emerald-100 p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="material-symbols-outlined text-emerald-600 text-[12px]">schedule</span>
                      <span className="text-[10px] font-bold text-emerald-700">{item.time}</span>
                    </div>
                    <p className="text-[13px] text-neutral-800 leading-snug">{item.label}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : task.taskList.length > 0 ? (
          <ol className="space-y-1.5 list-decimal list-inside">
            {task.taskList.map((label, i) => (
              <li key={i} className="text-[13px] text-neutral-700 ml-1 leading-snug">{label}</li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-neutral-400 italic">
            Tổ chức chưa tạo nhiệm vụ cụ thể cho ca này.
          </p>
        )}
      </div>

      {/* Chain vai trò */}
      <div>
        <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">groups</span>
          Tiến độ team
        </h3>
        <div className="space-y-2">
          {task.chainStatus.map((r) => {
            const isMe = r.role === task.role;
            const isBlocked = task.blockedBy?.role === r.role;
            return (
              <div
                key={r.role}
                className={`flex items-center gap-3 rounded-lg p-2.5 border ${
                  isMe
                    ? 'bg-emerald-50 border-emerald-300'
                    : isBlocked
                      ? 'bg-rose-50 border-rose-200'
                      : 'bg-neutral-50 border-neutral-200'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    isMe ? 'ring-2 ring-emerald-600 ring-offset-1' : ''
                  } ${chainItemColor(r.done, r.inProgress > 0, r.total, r.completed)}`}
                >
                  <span className="material-symbols-outlined text-white text-[16px]">{ROLE_ICONS[r.role]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-neutral-800">{r.label}</span>
                    {isMe && (
                      <span className="text-[9px] font-bold uppercase bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">
                        Bạn
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {r.total > 0 ? (
                      <>
                        <span className="font-bold text-emerald-600">{r.completed}/{r.total}</span> đã xong
                        {r.inProgress > 0 && (
                          <span className="ml-1 text-amber-600">· {r.inProgress} đang làm</span>
                        )}
                      </>
                    ) : (
                      'Chưa có TNV'
                    )}
                  </div>
                </div>
                {r.total > 0 && r.completed === r.total && (
                  <span className="material-symbols-outlined text-emerald-500 text-[18px]">check_circle</span>
                )}
              </div>
            );
          })}
        </div>

        {task.blockedBy && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-200 p-2.5">
            <span className="material-symbols-outlined text-rose-500 text-[16px]">lock</span>
            <p className="text-[11px] font-semibold text-rose-700">
              Bạn đang chờ <strong>{task.blockedBy.label}</strong>
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Thanh bước tiến trình cá nhân */
function StepProgress({ status }: { status: string }) {
  const stepIdx = TASK_STEPS.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center gap-0">
      {TASK_STEPS.map((s, i) => {
        const done = i <= stepIdx;
        const isCurrent = i === stepIdx;
        return (
          <div key={s.key} className="flex items-center">
            {i > 0 && (
              <div className={`w-12 h-0.5 mx-1 ${i <= stepIdx ? 'bg-emerald-500' : 'bg-neutral-200'}`} />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  done ? 'bg-emerald-500' : 'bg-neutral-200'
                } ${isCurrent ? 'ring-2 ring-emerald-600 ring-offset-2' : ''}`}
              >
                <span className={`material-symbols-outlined text-white text-[16px] ${done ? '' : 'text-neutral-400'}`}>
                  {done ? s.icon : 'radio_button_unchecked'}
                </span>
              </div>
              <span className={`text-[10px] font-medium ${done ? 'text-emerald-700' : 'text-neutral-400'}`}>
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Nút hành động kế tiếp */
function ActionButton({ task }: { task: TaskDetail }) {
  const advance = useAdvanceTask();
  const fileRef = useRef<HTMLInputElement>(null);
  const campaignRunning = task.campaign.status === 'in_progress';
  const next = TASK_NEXT[task.status]?.(task.role) ?? null;
  const canAct = campaignRunning && next && !task.blockedBy;

  async function go(photo?: File) {
    try {
      const res = await advance.mutateAsync({ assignmentId: task.id, photo });
      toast.success(
        res.pointsAwarded
          ? `Hoàn thành! +${res.pointsAwarded} điểm cống hiến 🎉`
          : 'Đã cập nhật bước',
      );
    } catch (e) {
      toast.error(errMsg(e, 'Thao tác thất bại'));
    }
  }

  function onClick() {
    if (!canAct) return;
    if (next!.needsPhoto) fileRef.current?.click();
    else void go();
  }

  if (!canAct) return null;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={advance.isPending}
        className="w-full py-3 bg-[#236c2a] hover:bg-[#1a4f1f] text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {next?.needsPhoto && (
          <span className="material-symbols-outlined text-[18px]">photo_camera</span>
        )}
        {advance.isPending ? 'Đang xử lý...' : next?.label}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void go(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** Ảnh minh chứng đã tải lên */
function ProofPhotos({ task }: { task: TaskDetail }) {
  const photos: { url: string; label: string; time: string | null }[] = [];
  if (task.ingredientProofUrl) {
    photos.push({ url: task.ingredientProofUrl, label: 'Ảnh nguyên liệu', time: null });
  }
  if (task.cookedProofUrl) {
    photos.push({ url: task.cookedProofUrl, label: 'Ảnh món đã nấu', time: null });
  }
  if (task.distributionProofUrl) {
    photos.push({ url: task.distributionProofUrl, label: 'Ảnh đã giao', time: null });
  }
  if (photos.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Ảnh minh chứng</h3>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <div key={i} className="relative group">
            <img
              src={mediaUrl(p.url)}
              alt={p.label}
              className="w-full aspect-square object-cover rounded-lg border border-neutral-200"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 rounded-b-lg px-1 py-0.5">
              <p className="text-[9px] text-white font-medium truncate">{p.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Chi tiết menu cho chef/waiter */
function MenuDetails({ task }: { task: TaskDetail }) {
  if (task.role === 'shipper') return null;
  if (!task.campaign.menuItems.length) return null;

  return (
    <div className="mt-4">
      <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Thực đơn</h3>
      <div className="space-y-2">
        {task.campaign.menuItems.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg bg-honey-50 border border-honey-100 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-honey-500 text-[16px]">restaurant</span>
              <span className="text-sm font-medium text-neutral-800">
                {m.customName ?? 'Món ăn'}
              </span>
            </div>
            {m.plannedServings && (
              <span className="text-xs font-bold text-honey-700">
                {m.plannedServings} phần
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Chi tiết nguyên liệu cho chef */
function DonationsDetails({ task }: { task: TaskDetail }) {
  if (task.role !== 'chef') return null;
  if (!task.campaign.donationsReceived.length) return null;

  return (
    <div className="mt-4">
      <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Nguyên liệu đã nhận</h3>
      <div className="space-y-1">
        {task.campaign.donationsReceived.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-sm text-neutral-700">
            <span className="material-symbols-outlined text-emerald-500 text-[14px]">check_circle</span>
            <span>{d.itemName}</span>
            {d.quantity && <span className="text-neutral-400 text-xs">· {d.quantity}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: task, isLoading, error } = useTask(id);
  const rm = task ? ROLE_META[task.role] : null;
  const st = task ? TASK_STATUS_META[task.status] ?? { label: task.status, chip: '', color: '' } : null;

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-[340px_1fr] gap-4">
        <Skeleton className="h-96 w-full" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <span className="material-symbols-outlined text-neutral-300 text-6xl mb-4">error_outline</span>
        <h2 className="text-lg font-bold text-neutral-700">Không tìm thấy công việc</h2>
        <p className="text-sm text-neutral-400 mt-2">Công việc này có thể đã bị xoá hoặc bạn không có quyền xem.</p>
        <Link href="/campaigns?tab=tasks" className="mt-4 inline-flex items-center gap-1 text-sm text-emerald-700 font-semibold">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-neutral-500 mb-4 hover:text-neutral-700 transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Quay lại
      </button>

      {/* Banner cảnh báo tổng thể nếu có task đang trễ */}
      {(() => {
        const fullSch = task.campaign.scheduleItems ?? [];
        const matching = fullSch.filter((s) => task.taskList.includes(s.label));
        const datePart2 = task.campaign.scheduledDate?.slice(0, 10);
        const now2 = new Date();
        const lateMatches = matching.filter((s) => {
          const t = parseTimeRange(datePart2 ?? '', s.time, now2);
          return t && t.status === 'late';
        });
        const maxLate = lateMatches.reduce((max, s) => {
          const t = parseTimeRange(datePart2 ?? '', s.time, now2);
          return Math.max(max, t?.lateMinutes ?? 0);
        }, 0);
        if (lateMatches.length === 0) return null;
        return (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-300 p-3">
            <span className="material-symbols-outlined text-amber-600 text-[20px]">warning</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">
                Đang trễ {maxLate} phút so với lịch trình
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Có {lateMatches.length} nhiệm vụ đã tới giờ nhưng chưa hoàn thành. Bạn vẫn có thể thực hiện ngay.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          {rm && (
            <span className={`badge ${rm.badge} mb-2`}>
              <span className="material-symbols-outlined text-[14px]">{rm.icon}</span>
              {rm.label}
            </span>
          )}
          <h1 className="text-lg font-bold text-neutral-900">{task.campaign.title}</h1>
        </div>
        {st && <span className={st.chip}>{st.label}</span>}
      </div>

      {/* Thông tin chiến dịch (compact) */}
      <div className="bg-white rounded-xl border border-neutral-200 p-3 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-neutral-400 text-[16px]">event</span>
          <span className="text-neutral-700">
            {new Date(task.campaign.scheduledDate).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-neutral-400 text-[16px]">schedule</span>
          <span className="text-neutral-700">{task.campaign.startTime} – {task.campaign.endTime}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-neutral-400 text-[16px] mt-0.5">place</span>
          <span className="text-neutral-700 truncate">{task.campaign.kitchenAddress}</span>
        </div>
      </div>

      {/* ── Layout 2 cột: sidebar trái (nhiệm vụ) + main phải ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* SIDEBAR TRÁI: ca + nhiệm vụ + chain */}
        <TaskSidebar task={task} />

        {/* MAIN PHẢI: progress + media + actions */}
        <main className="space-y-4">
          {/* Tiến trình cá nhân */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4">Tiến trình của bạn</h3>
            <StepProgress status={task.status} />
            {/* Nút hành động của bước hiện tại (Điểm danh → Bắt đầu → Hoàn thành). Tự ẩn khi
                đã xong / chiến dịch chưa chạy / đang bị chặn bởi vai trò khác. */}
            <div className="mt-5">
              <ActionButton task={task} />
            </div>
          </div>

          {/* Menu & donations */}
          <MenuDetails task={task} />
          <DonationsDetails task={task} />

          {/* Proof photos */}
          <ProofPhotos task={task} />

          {/* Status message */}
          {task.status === 'pending' && (
            <div className="flex items-center gap-2 rounded-lg bg-honey-50 border border-honey-200 p-3">
              <span className="material-symbols-outlined text-honey-500 text-[20px]">hourglass_top</span>
              <p className="text-sm font-medium text-honey-700">Chờ quản trị viên duyệt đăng ký của bạn.</p>
            </div>
          )}
          {task.status === 'completed' && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
              <span className="material-symbols-outlined text-emerald-500 text-[20px]">verified</span>
              <p className="text-sm font-medium text-emerald-700">
                {task.pointsAwarded
                  ? `Công việc hoàn thành! Bạn nhận được ${task.pointsAwarded} điểm cống hiến.`
                  : 'Công việc hoàn thành! Cảm ơn bạn.'}
              </p>
            </div>
          )}
          {task.blockedBy && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3">
              <span className="material-symbols-outlined text-rose-500 text-[20px]">lock</span>
              <div>
                <p className="text-sm font-semibold text-rose-700">Bạn đang bị chặn</p>
                <p className="text-xs text-rose-600 mt-0.5">
                  {task.blockedBy.label} chưa bắt đầu nấu. Bạn phải đợi họ hoàn thành trước khi có thể tiếp tục.
                </p>
              </div>
            </div>
          )}
          {task.campaign.status !== 'in_progress' && !['completed', 'cancelled'].includes(task.status) && (
            <div className="flex items-center gap-2 rounded-lg bg-neutral-50 border border-neutral-200 p-3">
              <span className="material-symbols-outlined text-neutral-400 text-[20px]">schedule</span>
              <p className="text-sm text-neutral-600">Chiến dịch chưa bắt đầu. Hãy quay lại khi đến giờ.</p>
            </div>
          )}

          {/* Navigation links */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Link
              href={`/campaigns/${task.campaign.id}`}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-neutral-200 bg-white px-3 text-[11px] font-bold text-neutral-600 transition-colors hover:bg-neutral-50"
            >
              <span className="material-symbols-outlined text-[15px]">visibility</span>
              Chi tiết chiến dịch
            </Link>
            {(task.role === 'chef' || task.role === 'waiter') && (
              <Link
                href={`/kitchen/${task.campaign.id}`}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-honey-100 bg-honey-50 px-3 text-[11px] font-bold text-honey-700 transition-colors hover:bg-honey-100"
              >
                <span className="material-symbols-outlined text-[15px]">soup_kitchen</span>
                {task.role === 'chef' ? 'Nhật ký ATTP' : 'Ghi phân phát'}
              </Link>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}