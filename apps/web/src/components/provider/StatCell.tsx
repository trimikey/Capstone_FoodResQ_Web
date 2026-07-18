'use client';

/* Hallmark · component: stat-cell · genre: editorial · theme: studio
 * purpose: 4-up KPI cell used in the dashboard top row.
 */

import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'flat';
  icon?: string;
  tone?: 'sage' | 'honey' | 'sky' | 'neutral';
}

const TONE: Record<NonNullable<Props['tone']>, { ring: string; bg: string; icon: string }> = {
  sage:    { ring: 'ring-emerald-100',  bg: 'bg-emerald-50',  icon: 'text-emerald-700' },
  honey:   { ring: 'ring-honey-100',    bg: 'bg-honey-50',    icon: 'text-honey-700'   },
  sky:     { ring: 'ring-sky-100',      bg: 'bg-sky-50',      icon: 'text-sky-700'     },
  neutral: { ring: 'ring-neutral-150',  bg: 'bg-neutral-50',  icon: 'text-neutral-700' },
};

export default function StatCell({ label, value, delta, deltaTone = 'flat', icon, tone = 'sage' }: Props) {
  const t = TONE[tone];
  return (
    <div className={`bg-white rounded-2xl border border-neutral-150 shadow-sm p-4 md:p-5 ring-1 ${t.ring}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-neutral-450">{label}</p>
        {icon && (
          <span className={`w-8 h-8 rounded-xl ${t.bg} flex items-center justify-center`}>
            <span className={`material-symbols-outlined text-[18px] ${t.icon}`}>{icon}</span>
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl md:text-[28px] leading-none font-extrabold text-neutral-900">{value}</p>
      {delta && (
        <p
          className={`mt-2 text-[11px] font-bold flex items-center gap-1 ${
            deltaTone === 'up' ? 'text-emerald-700' : deltaTone === 'down' ? 'text-rose-600' : 'text-neutral-500'
          }`}
        >
          <span className="material-symbols-outlined text-[12px]">
            {deltaTone === 'up' ? 'trending_up' : deltaTone === 'down' ? 'trending_down' : 'remove'}
          </span>
          {delta}
        </p>
      )}
    </div>
  );
}
