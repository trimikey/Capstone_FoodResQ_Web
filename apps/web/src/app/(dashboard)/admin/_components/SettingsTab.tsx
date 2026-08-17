'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAdminConfigs, useSetConfig, type SystemConfigItem } from '@/hooks/useAdmin';
import { Skeleton } from './admin-shared';

function ConfigRow({ cfg }: { cfg: SystemConfigItem }) {
  const setConfig = useSetConfig();
  const [val, setVal] = useState(String(cfg.value));
  const dirty = Number(val) !== cfg.value;
  const isToggle = cfg.min === 0 && cfg.max === 1 && cfg.unit === '0/1';

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
    <div className="px-6 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="font-bold text-neutral-900 text-sm">{cfg.label}</p>
        <p className="text-xs text-neutral-500 mt-0.5">{cfg.description}</p>
        <p className="text-[11px] text-neutral-400 mt-1">Khoảng cho phép: {cfg.min}–{cfg.max} {cfg.unit} · mặc định {cfg.default}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isToggle ? (
          <button
            type="button"
            onClick={() => setVal(Number(val) === 1 ? '0' : '1')}
            className={`relative h-9 w-16 rounded-full border transition-colors ${
              Number(val) === 1 ? 'border-emerald-600 bg-emerald-600' : 'border-neutral-200 bg-neutral-200'
            }`}
            aria-pressed={Number(val) === 1}
          >
            <span
              className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-transform ${
                Number(val) === 1 ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        ) : (
          <div className="relative">
            <input
              type="number"
              value={val}
              min={cfg.min}
              max={cfg.max}
              onChange={(e) => setVal(e.target.value)}
              className="w-24 bg-white border border-neutral-200 rounded-xl py-2.5 pl-3 pr-10 text-sm font-bold text-neutral-900 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400 font-medium pointer-events-none">{cfg.unit}</span>
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
