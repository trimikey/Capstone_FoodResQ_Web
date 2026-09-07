'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAdminConfigs, useSetConfig, type SystemConfigItem } from '@/hooks/useAdmin';
import { Skeleton } from './admin-shared';

/** 480 → "08:00". Dùng cho các cấu hình lưu bằng số phút tính từ 00:00. */
function minuteLabel(min: number): string {
  if (!Number.isFinite(min)) return '--:--';
  const clamped = Math.max(0, Math.min(1440, Math.round(min)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function ConfigRow({ cfg }: { cfg: SystemConfigItem }) {
  const setConfig = useSetConfig();
  const [val, setVal] = useState(String(cfg.value));
  const dirty = Number(val) !== cfg.value;
  const isToggle = cfg.min === 0 && cfg.max === 1 && cfg.unit === '0/1';
  // Cấu hình lưu bằng phút-từ-nửa-đêm: hiện luôn giờ tương ứng để admin khỏi nhẩm
  // 1350 là mấy giờ. Vẫn giữ ô nhập số vì mốc 1440 (24:00) không gõ được bằng input
  // giờ, mà đó lại là cách mở 24/7 khi cần test.
  const isMinuteOfDay = cfg.display === 'minute-of-day';

  async function save() {
    const n = Number(val);
    if (Number.isNaN(n) || n < cfg.min || n > cfg.max) {
      toast.error(`${cfg.label} phải trong khoảng ${cfg.min}–${cfg.max} ${cfg.unit}.`);
      return;
    }
    try {
      await setConfig.mutateAsync({ key: cfg.key, value: n });
      toast.success(`Đã cập nhật "${cfg.label}"`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Cập nhật thất bại';
      toast.error(msg);
    }
  }

  return (
    // flex-wrap: đơn vị hoặc nhãn dài làm khối điều khiển rộng ra thì nó xuống dòng,
    // thay vì tràn ra ngoài thẻ.
    <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-[220px] flex-1">
        <p className="font-bold text-neutral-900 text-sm">{cfg.label}</p>
        <p className="text-xs text-neutral-500 mt-0.5">{cfg.description}</p>
        <p className="text-[11px] text-neutral-400 mt-1">
          Khoảng cho phép:{' '}
          {isMinuteOfDay
            ? `${minuteLabel(cfg.min)}–${minuteLabel(cfg.max)} · mặc định ${minuteLabel(cfg.default)}`
            : `${cfg.min}–${cfg.max} ${cfg.unit} · mặc định ${cfg.default}`}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isToggle ? (
          <button
            type="button"
            onClick={() => setVal(Number(val) === 1 ? '0' : '1')}
            className={`relative h-9 w-20 rounded-full border px-2 text-[11px] font-extrabold transition-colors ${
              Number(val) === 1 ? 'border-emerald-600 bg-emerald-600' : 'border-neutral-200 bg-neutral-200'
            }`}
            aria-pressed={Number(val) === 1}
            aria-label={`${cfg.label}: ${Number(val) === 1 ? 'Bật' : 'Tắt'}`}
          >
            <span className={`absolute inset-y-0 flex items-center ${Number(val) === 1 ? 'left-3 text-white' : 'right-3 text-neutral-500'}`}>
              {Number(val) === 1 ? 'Bật' : 'Tắt'}
            </span>
            <span
              className={`absolute left-1 top-1 h-7 w-7 rounded-full bg-white shadow transition-transform ${
                Number(val) === 1 ? 'translate-x-11' : 'translate-x-0'
              }`}
            />
          </button>
        ) : (
          // Đơn vị nằm CẠNH ô nhập, không chồng lên: trước đây nó được đặt tuyệt đối
          // bên trong ô với chừa sẵn 40px, nên đơn vị dài hơn ("phút từ 00:00") đè
          // thẳng lên con số. Để bên ngoài thì dài bao nhiêu cũng không hỏng.
          <div className="text-right">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={val}
                min={cfg.min}
                max={cfg.max}
                onChange={(e) => setVal(e.target.value)}
                className="w-24 bg-white border border-neutral-200 rounded-xl py-2.5 px-3 text-sm font-bold text-neutral-900 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <span className="text-[11px] text-neutral-400 font-medium whitespace-nowrap">
                {cfg.unit}
              </span>
            </div>
            {isMinuteOfDay && (
              <p className="mt-1 text-[11px] font-bold text-emerald-700">
                = {minuteLabel(Number(val))}
              </p>
            )}
          </div>
        )}
        <button
          onClick={save}
          disabled={!dirty || setConfig.isPending}
          className="px-4 py-2.5 bg-[#166534] hover:bg-[#14532d] text-white rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Lưu
        </button>
      </div>
    </div>
  );
}

export default function SettingsTab() {
  const { data, isLoading } = useAdminConfigs();

  if (isLoading) return <div className="max-w-3xl mx-auto"><Skeleton /></div>;

  const groups = (data ?? []).reduce<Record<string, SystemConfigItem[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Cài đặt hệ thống</h2>
        <p className="text-sm text-neutral-500 mt-1">Chỉnh quy tắc nghiệp vụ — có hiệu lực ngay, không cần deploy lại.</p>
      </div>

      {Object.entries(groups).map(([group, items]) => (
        <div key={group} className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-[#f9faf9] border-b border-neutral-150">
            <h3 className="font-bold text-neutral-900">{group}</h3>
          </div>
          <div className="divide-y divide-neutral-100">
            {items.map((c) => <ConfigRow key={c.key} cfg={c} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
