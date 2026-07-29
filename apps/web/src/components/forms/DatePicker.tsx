'use client';

import { useState, useRef, useEffect } from 'react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  minDate?: Date;
}

export function DatePicker({ value, onChange, minDate }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const [y, m] = value.split('-');
      return new Date(parseInt(y), parseInt(m) - 1, 1);
    }
    return new Date();
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    value ? new Date(value + 'T00:00:00') : null
  );
  const containerRef = useRef<HTMLDivElement>(null);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!isOpen) {
      if (value) {
        const [y, m] = value.split('-');
        setViewDate(new Date(parseInt(y), parseInt(m) - 1, 1));
      } else {
        setViewDate(new Date());
      }
    }
    setIsOpen(!isOpen);
  }

  useEffect(() => {
    if (!isOpen) return;
    
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    }
    
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  function handleSelectDate(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    setSelectedDate(date);
    setIsOpen(false);
  }

  function getMonthDays(year: number, month: number) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (Date | null)[] = [];
    
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  }

  function prevMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  }

  function nextMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  }

  function formatDisplayDate() {
    if (!selectedDate) return 'Chọn ngày';
    const d = selectedDate;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  const monthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
  ];
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days = getMonthDays(year, month);

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date) => {
    return selectedDate && date.toDateString() === selectedDate.toDateString();
  };

  const isDisabled = (date: Date) => {
    if (minDate) {
      const min = new Date(minDate);
      min.setHours(0, 0, 0, 0);
      return date < min;
    }
    return false;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 pr-10 bg-white focus:outline-none focus:ring-2 focus:ring-[#236c2a]/20 text-sm transition-colors text-left relative cursor-pointer"
      >
        <span className={`block truncate ${selectedDate ? 'text-neutral-900' : 'text-neutral-400'}`}>
          {formatDisplayDate()}
        </span>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-white rounded-xl shadow-2xl border border-neutral-200 p-4 min-w-[320px]">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prevMonth(); }}
              className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="font-semibold text-neutral-800 text-sm">
              {monthNames[month]} {year}
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); nextMonth(); }}
              className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {dayNames.map((name) => (
              <div key={name} className="text-center text-[10px] font-medium text-neutral-500 py-1">
                {name}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="w-8 h-8" />;
              }
              
              const disabled = isDisabled(date);
              const selected = isSelected(date);
              const today = isToday(date);
              
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    e.preventDefault();
                    if (!disabled) handleSelectDate(date); 
                  }}
                  disabled={disabled}
                  className={`
                    w-8 h-8 rounded-lg text-xs font-medium transition-colors cursor-pointer
                    ${disabled 
                      ? 'text-neutral-300 cursor-not-allowed' 
                      : selected 
                        ? 'bg-emerald-600 text-white shadow-md' 
                        : today 
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                          : 'hover:bg-emerald-50 text-neutral-700'
                    }
                  `}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={(e) => { 
                e.stopPropagation(); 
                e.preventDefault();
                const today = new Date();
                if (!isDisabled(today)) {
                  handleSelectDate(today);
                }
              }}
              className="w-full text-center text-xs text-emerald-600 hover:text-emerald-700 font-medium cursor-pointer"
            >
              Hôm nay
            </button>
          </div>
          </div>
        </>
      )}
    </div>
  );
}

export { DatePicker as default };
