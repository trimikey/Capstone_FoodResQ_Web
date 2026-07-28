'use client';

/* Hallmark · component: data-table · genre: editorial · theme: studio
 * purpose: tabular shell used by Listings + Orders tables. Columns are caller-supplied
 * to keep data shape in the page (single source of truth).
 */

import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  empty?: ReactNode;
  loading?: boolean;
  skeletonRows?: number;
  onRowClick?: (row: T) => void;
  /** Compact row height for order-style lists. */
  dense?: boolean;
}

export default function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  loading,
  skeletonRows = 5,
  onRowClick,
  dense = false,
}: Props<T>) {
  return (
    <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50/60 border-b border-neutral-150">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  className={`px-4 md:px-5 py-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-450 ${
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                  } ${c.className ?? ''}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={`sk-${i}`} className="border-b border-neutral-100 last:border-b-0">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 md:px-5 py-3">
                      <div className="h-3 w-3/4 skeleton" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 md:px-5 py-10 text-center">
                  {empty ?? (
                    <div className="flex flex-col items-center gap-2 text-neutral-450">
                      <span className="material-symbols-outlined text-[40px] text-neutral-250">inbox</span>
                      <p className="text-sm font-bold">Chưa có dữ liệu</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={rowKey(row, idx)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-neutral-100 last:border-b-0 transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-neutral-50/60' : 'hover:bg-neutral-50/40'
                  }`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 md:px-5 ${dense ? 'py-2.5' : 'py-3.5'} text-neutral-700 ${
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                      } ${c.className ?? ''}`}
                    >
                      {c.cell(row, idx)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
