'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAdvanceTask, type MyTask } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

export const TASK_NEXT: Record<
  string,
  (role: string) => { label: string; needsPhoto: boolean } | null
> = {
  assigned: () => ({ label: 'Điểm danh tại bếp', needsPhoto: false }),
  checked_in: (role) => ({
    label: role === 'chef' ? 'Bắt đầu nấu (chụp nguyên liệu)' : 'Bắt đầu làm việc',
    needsPhoto: role === 'chef',
  }),
  in_progress: (role) => ({
    label: role === 'shipper' ? 'Hoàn thành (ảnh đã giao)' : 'Hoàn thành (ảnh kết quả)',
    needsPhoto: true,
  }),
};

function getCheckInLocation(): Promise<{ lng: number; lat: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ định vị.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lng: position.coords.longitude, lat: position.coords.latitude }),
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Hãy cho phép vị trí để điểm danh tại bếp.'
            : error.code === error.TIMEOUT
              ? 'Không lấy được vị trí kịp thời. Hãy thử lại.'
              : 'Không lấy được vị trí hiện tại. Hãy kiểm tra GPS và thử lại.';
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  });
}

export function CampaignTaskAction({ t, className }: { t: MyTask; className?: string }) {
  const advance = useAdvanceTask();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isLocating, setIsLocating] = useState(false);
  const next = TASK_NEXT[t.status]?.(t.role) ?? null;

  async function advanceTask(photo?: File) {
    try {
      const location = t.status === 'assigned' ? await getCheckInLocation() : undefined;
      const res = await advance.mutateAsync({ assignmentId: t.id, photo, ...location });
      toast.success(
        res.pointsAwarded
          ? `Hoàn thành! +${res.pointsAwarded} điểm cống hiến`
          : 'Đã cập nhật bước công việc.',
      );
    } catch (error) {
      toast.error(errMsg(error, 'Cập nhật thất bại'));
    } finally {
      setIsLocating(false);
    }
  }

  function handleAction() {
    if (!next || isLocating || advance.isPending) return;
    if (next.needsPhoto) {
      fileRef.current?.click();
      return;
    }
    setIsLocating(true);
    void advanceTask();
  }

  if (!next) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleAction}
        disabled={isLocating || advance.isPending}
        className={className ?? 'mt-3 w-full py-2 bg-[#236c2a] hover:bg-[#1a4f1f] text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5'}
      >
        {next.needsPhoto && <span className="material-symbols-outlined text-[16px]">photo_camera</span>}
        {isLocating ? 'Đang lấy vị trí...' : advance.isPending ? 'Đang xử lý...' : next.label}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const photo = event.target.files?.[0];
          if (photo) void advanceTask(photo);
          event.target.value = '';
        }}
      />
    </>
  );
}
