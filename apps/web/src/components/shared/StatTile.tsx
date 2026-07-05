// Ô số liệu dùng chung. `align='left'` (dashboard) hoặc 'center' (trang công khai).
export function StatTile({
  icon,
  value,
  label,
  accent = 'text-emerald-600',
  align = 'left',
}: {
  icon: string;
  value: string | number;
  label: string;
  accent?: string;
  align?: 'left' | 'center';
}) {
  if (align === 'center') {
    return (
      <div className="bg-white border border-neutral-150 rounded-2xl p-4 text-center">
        <span className={`material-symbols-outlined text-[24px] ${accent}`}>{icon}</span>
        <p className="font-extrabold text-xl text-neutral-900 mt-1">{value}</p>
        <p className="text-[11px] text-neutral-500">{label}</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-neutral-150 p-4 flex flex-col gap-1">
      <span className={`material-symbols-outlined text-[22px] ${accent}`}>{icon}</span>
      <span className="font-extrabold text-2xl text-neutral-900 leading-none">{value}</span>
      <span className="text-[11px] text-neutral-500 font-medium">{label}</span>
    </div>
  );
}
