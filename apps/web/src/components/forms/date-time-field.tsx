import { combineToIso } from '@/lib/listing-form';

export function DateTimeField({
  label,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  hint,
}: {
  label: string;
  dateValue: string;
  timeValue: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-neutral-500 font-medium uppercase tracking-wide">
        {label}
      </label>
      <div className="grid grid-cols-[1fr_112px] gap-2 items-stretch">
        <div className="relative">
          <input
            type="date"
            value={dateValue}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#236c2a]/20 text-sm transition-colors"
          />
        </div>
        <div className="relative">
          <input
            type="time"
            value={timeValue}
            onChange={(e) => onTimeChange(e.target.value)}
            className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#236c2a]/20 text-sm transition-colors"
          />
        </div>
      </div>
      {hint && <p className="text-[11px] text-neutral-400 font-normal">{hint}</p>}
    </div>
  );
}

export function dateTimeFormValue(date: string, time: string): string {
  return combineToIso(date, time);
}

export function dateTimeDisplay(form: { pickupEndDate?: string; pickupEndTime?: string }): string {
  if (!form.pickupEndDate || !form.pickupEndTime) return '—';
  const iso = combineToIso(form.pickupEndDate, form.pickupEndTime);
  const d = new Date(iso);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
