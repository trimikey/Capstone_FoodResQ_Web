import { combineToIso } from '@/lib/listing-form';
import { TimePicker } from './TimePicker';
import { DatePicker } from './DatePicker';

export function DateTimeField({
  label,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  hint,
  minDate,
  minTime,
}: {
  label: string;
  dateValue: string;
  timeValue: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  hint?: string;
  minDate?: Date;
  minTime?: string;
}) {
  function handleDateChange(v: string) {
    onDateChange(v);
    onTimeChange('');
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-neutral-500 font-medium uppercase tracking-wide block">
        {label}
      </label>
      <div className="space-y-2">
        <DatePicker value={dateValue} onChange={handleDateChange} minDate={minDate} />
        <TimePicker value={timeValue} onChange={onTimeChange} minTime={minTime} />
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
  const [year, month, day] = form.pickupEndDate.split('-');
  return `${day}/${month}/${year}, ${form.pickupEndTime}`;
}
