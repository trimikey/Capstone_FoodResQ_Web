'use client';

/* Hallmark · component: filter-bar · genre: editorial · theme: studio
 * purpose: compact filter row placed between header card and table
 */

import type { ReactNode } from 'react';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: FilterOption<T>[];
  right?: ReactNode;
}

export default function FilterBar<T extends string>({ value, onChange, options, right }: Props<T>) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-neutral-150 rounded-2xl px-2 py-2 shadow-sm">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                active
                  ? 'bg-emerald-700 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {opt.label}
              {typeof opt.count === 'number' && (
                <span
                  className={`px-1.5 rounded-full text-[10px] font-extrabold ${
                    active ? 'bg-white/20 text-white' : 'bg-neutral-150 text-neutral-500'
                  }`}
                >
                  {opt.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {right && <div className="flex items-center gap-2 px-1">{right}</div>}
    </div>
  );
}
