'use client';

import { useId, useState } from 'react';

export interface TrendPoint {
  label: string;
  value: number;
}

/**
 * Biểu đồ đường + vùng tô cho chuỗi thời gian (SVG thuần, không thêm thư viện).
 *
 * Vẽ theo viewBox cố định rồi để `preserveAspectRatio="none"` co giãn theo bề rộng
 * container — nhờ vậy không cần đo DOM, tránh layout-shift và chạy được cả khi in.
 */
export function TrendChart({
  points,
  color = '#236c2a',
  unit = '',
  height = 260,
}: {
  points: TrendPoint[];
  color?: string;
  unit?: string;
  height?: number;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return <EmptyChart height={height} />;
  }

  const W = 600;
  const H = 220;
  const PAD_L = 44;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 28;

  const max = Math.max(...points.map((p) => p.value));
  // Trục Y luôn có "trần" > 0, nếu không toàn số 0 sẽ chia cho 0 → NaN trong path.
  const top = niceCeil(max || 1);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Một điểm duy nhất thì không có "khoảng cách" — đặt nó vào giữa thay vì chia cho 0.
  const x = (i: number) =>
    points.length === 1 ? PAD_L + innerW / 2 : PAD_L + (i * innerW) / (points.length - 1);
  const y = (v: number) => PAD_T + innerH - (v / top) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${PAD_T + innerH} L${x(0)},${PAD_T + innerH} Z`;
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => top * f);

  return (
    <div className="relative" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
        role="img"
        aria-label={`Biểu đồ xu hướng ${unit}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(v)}
              y2={y(v)}
              stroke="#e5e7eb"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text x={PAD_L - 8} y={y(v) + 4} textAnchor="end" className="fill-neutral-400 text-[11px]">
              {fmtCompact(v)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {points.map((p, i) => (
          <g key={p.label}>
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={hover === i ? 5 : 3.5}
              fill="#fff"
              stroke={color}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
            {/* Vùng bắt chuột rộng cả cột để không phải trỏ trúng chấm nhỏ 3px */}
            <rect
              x={x(i) - innerW / Math.max(points.length, 2) / 2}
              y={PAD_T}
              width={innerW / Math.max(points.length, 2)}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
            <text
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className={`text-[11px] ${hover === i ? 'fill-neutral-900 font-bold' : 'fill-neutral-500'}`}
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg print:hidden"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: `${(y(points[hover].value) / H) * 100}%`,
          }}
        >
          {fmtNumber(points[hover].value)} {unit}
          <span className="block text-[10px] font-normal text-neutral-300">{points[hover].label}</span>
        </div>
      )}
    </div>
  );
}

/** Biểu đồ cột dọc — dùng cho số suất ăn / người được giúp theo tháng. */
export function BarChart({
  points,
  color = '#236c2a',
  unit = '',
  height = 260,
}: {
  points: TrendPoint[];
  color?: string;
  unit?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <EmptyChart height={height} />;

  const max = Math.max(...points.map((p) => p.value));
  const top = niceCeil(max || 1);

  return (
    <div className="flex flex-col" style={{ height }}>
      <div className="flex flex-1 items-end gap-2 border-b border-neutral-200 pb-0">
        {points.map((p, i) => (
          <div
            key={p.label}
            className="group relative flex flex-1 flex-col items-center justify-end"
            style={{ height: '100%' }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg print:hidden">
                {fmtNumber(p.value)} {unit}
              </div>
            )}
            <span className="mb-1 text-[11px] font-bold tabular-nums text-neutral-600">
              {p.value > 0 ? fmtCompact(p.value) : ''}
            </span>
            <div
              className="w-full max-w-[46px] rounded-t-lg transition-all"
              style={{
                // Cột giá trị 0 vẫn để 3px làm "chân đế" cho người dùng thấy có mốc đó.
                height: `${Math.max((p.value / top) * 100, p.value > 0 ? 4 : 1.5)}%`,
                backgroundColor: color,
                opacity: hover === null || hover === i ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {points.map((p, i) => (
          <span
            key={p.label}
            className={`flex-1 text-center text-[11px] ${
              hover === i ? 'font-bold text-neutral-900' : 'text-neutral-500'
            }`}
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Vòng tròn tỷ lệ (donut) — dùng cho phân bổ trạng thái đơn. */
export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  size = 190,
}: {
  slices: { label: string; value: number; color: string }[];
  centerLabel: string;
  centerValue: string;
  size?: number;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
          <circle cx="80" cy="80" r={R} fill="none" stroke="#f1f5f2" strokeWidth="20" />
          {total > 0 &&
            slices
              .filter((s) => s.value > 0)
              .map((s) => {
                const len = (s.value / total) * C;
                const dash = `${len} ${C - len}`;
                const el = (
                  <circle
                    key={s.label}
                    cx="80"
                    cy="80"
                    r={R}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="20"
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return el;
              })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold tabular-nums text-neutral-900">{centerValue}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            {centerLabel}
          </span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1 truncate text-neutral-700">{s.label}</span>
            <span className="shrink-0 font-bold tabular-nums text-neutral-900">{s.value}</span>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-neutral-400">
              {total > 0 ? `${Math.round((s.value / total) * 100)}%` : '0%'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Thanh ngang xếp hạng — dùng cho phân bổ theo nhóm thực phẩm / top bài đăng. */
export function RankBars({
  rows,
  unit = '',
  color = '#236c2a',
}: {
  rows: { label: string; value: number; sub?: string }[];
  unit?: string;
  color?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-400">Chưa có dữ liệu</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-medium text-neutral-700">{r.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-bold text-neutral-900">{fmtNumber(r.value)}</span>
              <span className="ml-1 text-xs text-neutral-400">{unit}</span>
              {r.sub && <span className="ml-2 text-xs text-neutral-400">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, backgroundColor: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-200 text-neutral-400"
      style={{ height }}
    >
      <span className="material-symbols-outlined text-[32px]">bar_chart</span>
      <p className="text-sm">Chưa có dữ liệu để vẽ biểu đồ</p>
    </div>
  );
}

/** Làm tròn trần trục Y lên mốc "đẹp" (1/2/5 × 10^n) để nhãn lưới không lẻ. */
function niceCeil(v: number) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const n = v / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
}

function fmtCompact(v: number) {
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fmtNumber(v: number) {
  return Number.isInteger(v) ? v.toLocaleString('vi-VN') : v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}
