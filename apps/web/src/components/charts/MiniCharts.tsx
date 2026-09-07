'use client';

import { useMemo, useState } from 'react';

/**
 * Bộ biểu đồ SVG tự vẽ cho các trang báo cáo — không kéo thêm thư viện.
 *
 * Theo quy tắc dataviz: màu phân loại gán theo thứ tự cố định (không xoay vòng),
 * nhãn số đặt trực tiếp hoặc hiện khi hover thay vì tô mọi điểm, chữ luôn dùng mực
 * trung tính (màu chỉ nằm ở ô vuông chú giải), nét mảnh, khe 2px giữa các mảng màu.
 * Palette 4 màu lấy từ nhận diện dự án và đã chạy qua validator CVD (pass; contrast
 * WARN → mọi biểu đồ đều kèm nhãn số trực tiếp và bảng số liệu bên dưới).
 */
export const CHART_COLORS = ['#377e3c', '#c9871a', '#3aa6dd', '#7c5cbf'] as const;

const fmt = (n: number) => n.toLocaleString('vi-VN');

// ─── Biểu đồ tròn (donut) ────────────────────────────────────────────────────
export function DonutChart({
  data,
  unit,
}: {
  data: Array<{ label: string; value: number }>;
  unit: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) {
    return <p className="py-8 text-center text-xs text-neutral-400">Chưa có dữ liệu.</p>;
  }
  const R = 56;
  const C = 2 * Math.PI * R;
  // Cộng dồn bằng reduce thuần thay vì biến ngoài closure — render phải thuần khiết.
  const slices = data.reduce<
    Array<{ label: string; value: number; frac: number; dash: number; offset: number; color: string }>
  >((acc, d, i) => {
    const frac = d.value / total;
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
    acc.push({ ...d, frac, dash: frac * C, offset, color: CHART_COLORS[i % CHART_COLORS.length] });
    return acc;
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label={`Biểu đồ tròn, tổng ${fmt(total)} ${unit}`}>
        {slices.map((sl) => (
          <circle
            key={sl.label}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={sl.color}
            strokeWidth="20"
            /* Khe 2px giữa các mảng: rút ngắn dash một chút. */
            strokeDasharray={`${Math.max(0, sl.dash - 2)} ${C - Math.max(0, sl.dash - 2)}`}
            strokeDashoffset={-sl.offset}
            transform="rotate(-90 70 70)"
          >
            <title>{`${sl.label}: ${fmt(sl.value)} ${unit} (${Math.round(sl.frac * 100)}%)`}</title>
          </circle>
        ))}
        <text x="70" y="66" textAnchor="middle" className="fill-neutral-900" fontSize="20" fontWeight="800">
          {fmt(total)}
        </text>
        <text x="70" y="82" textAnchor="middle" className="fill-neutral-500" fontSize="10">
          {unit}
        </text>
      </svg>
      {/* Chú giải kèm nhãn số trực tiếp — nghĩa vụ từ WARN contrast của palette. */}
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((sl) => (
          <li key={sl.label} className="flex items-center gap-2 text-xs">
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: sl.color }} />
            <span className="min-w-0 flex-1 truncate text-neutral-700">{sl.label}</span>
            <span className="shrink-0 font-bold text-neutral-900">
              {fmt(sl.value)} <span className="font-normal text-neutral-400">({Math.round(sl.frac * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Biểu đồ núi (area, một chuỗi) ───────────────────────────────────────────
export function AreaChart({
  data,
  unit,
}: {
  data: Array<{ label: string; value: number }>;
  unit: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 180;
  const PAD = { top: 18, right: 12, bottom: 26, left: 40 };

  const { points, maxV } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.value));
    const iw = W - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;
    const step = data.length > 1 ? iw / (data.length - 1) : 0;
    const pts = data.map((d, i) => ({
      ...d,
      x: PAD.left + (data.length > 1 ? i * step : iw / 2),
      y: PAD.top + ih - (d.value / max) * ih,
    }));
    return { points: pts, maxV: max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (data.length === 0) {
    return <p className="py-8 text-center text-xs text-neutral-400">Chưa có dữ liệu.</p>;
  }

  const baseline = H - PAD.bottom;
  const areaPath =
    `M ${points[0].x} ${baseline} ` +
    points.map((p) => `L ${p.x} ${p.y}`).join(' ') +
    ` L ${points[points.length - 1].x} ${baseline} Z`;
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const hoverBandW = points.length > 1 ? points[1].x - points[0].x : 40;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[420px]"
        role="img"
        aria-label={`Biểu đồ vùng ${data.length} mốc, đỉnh ${fmt(maxV)} ${unit}`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Lưới ngang lặng lẽ — vài vạch là đủ đọc thang. */}
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = PAD.top + (H - PAD.top - PAD.bottom) * (1 - f);
          return (
            <g key={f}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#e7e5e4" strokeWidth="1" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="9" className="fill-neutral-400">
                {fmt(Math.round(maxV * f))}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="#377e3c" opacity="0.16" />
        <path d={linePath} fill="none" stroke="#377e3c" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={`${p.label}-${i}`}>
            {/* Vùng bắt hover rộng hơn điểm — mốc 3px thì không ai trỏ trúng. */}
            <rect
              x={p.x - hoverBandW / 2}
              y={PAD.top}
              width={hoverBandW}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
            <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill="#377e3c" stroke="#fff" strokeWidth="2" />
            {hover === i && (
              <g>
                <line x1={p.x} x2={p.x} y1={PAD.top} y2={baseline} stroke="#a8a29e" strokeDasharray="3 3" strokeWidth="1" />
                <text
                  x={Math.min(Math.max(p.x, 70), W - 70)}
                  y={PAD.top - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  className="fill-neutral-900"
                >
                  {fmt(p.value)} {unit} · {p.label}
                </text>
              </g>
            )}
          </g>
        ))}
        {/* Nhãn trục X: mốc đầu / giữa / cuối — đủ định vị, không chen chúc. */}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1]
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .map((i) => (
            <text key={i} x={points[i].x} y={H - 8} textAnchor="middle" fontSize="9" className="fill-neutral-500">
              {points[i].label}
            </text>
          ))}
      </svg>
    </div>
  );
}

// ─── Thanh ngang so sánh hai đại lượng mỗi hàng (đặt vs thực nhận) ───────────
export function PairedBars({
  data,
  unitLabel,
  seriesLabels,
}: {
  data: Array<{ label: string; a: number; b: number }>;
  unitLabel: string;
  seriesLabels: [string, string];
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-xs text-neutral-400">Chưa có dữ liệu.</p>;
  }
  const maxV = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[11px] text-neutral-600">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px]" style={{ background: CHART_COLORS[1] }} />
          {seriesLabels[0]}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px]" style={{ background: CHART_COLORS[0] }} />
          {seriesLabels[1]}
        </span>
      </div>
      {data.map((d) => (
        <div key={d.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 flex-1 truncate font-semibold text-neutral-800">{d.label}</span>
            <span className="shrink-0 text-neutral-500">
              {fmt(d.b)}/{fmt(d.a)} {unitLabel}
            </span>
          </div>
          {/* Hai thanh mảnh chồng hàng, khe nhỏ, đầu bo 4px về phía giá trị. */}
          <div className="space-y-0.5">
            <div
              className="h-2 rounded-r-[4px]"
              style={{ width: `${(d.a / maxV) * 100}%`, background: CHART_COLORS[1], opacity: 0.55 }}
              title={`${seriesLabels[0]}: ${fmt(d.a)} ${unitLabel}`}
            />
            <div
              className="h-2 rounded-r-[4px]"
              style={{ width: `${(d.b / maxV) * 100}%`, background: CHART_COLORS[0] }}
              title={`${seriesLabels[1]}: ${fmt(d.b)} ${unitLabel}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Bảng số liệu kèm theo (nghĩa vụ của contrast WARN) ──────────────────────
export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  if (rows.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[11px] font-bold text-emerald-700 hover:underline">
        Xem bảng số liệu
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[320px] text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-[10px] uppercase tracking-wide text-neutral-400">
              {headers.map((h) => (
                <th key={h} className="py-1.5 pr-3 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className={`py-1.5 pr-3 ${j === 0 ? 'text-neutral-700' : 'font-semibold text-neutral-900'}`}>
                    {typeof cell === 'number' ? fmt(cell) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
