'use client';

import { useState, useRef, useEffect } from 'react';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  minTime?: string;
}

export function TimePicker({ value, onChange, minTime }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState('12');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('PM');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const [h, m] = value.split(':');
      let hour = parseInt(h, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12 || 12;
      setSelectedHour(hour.toString().padStart(2, '0'));
      setSelectedMinute(m || '00');
      setSelectedAmPm(ampm);
    }
  }, [value]);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
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

  function isTimeDisabled(hour: string, minute: string, ampm: 'AM' | 'PM') {
    if (!minTime) return false;
    
    let hour24 = parseInt(hour, 10);
    if (ampm === 'PM' && hour24 !== 12) hour24 += 12;
    if (ampm === 'AM' && hour24 === 12) hour24 = 0;
    
    const [minH, minM] = minTime.split(':');
    const minHour = parseInt(minH, 10);
    const minMinute = parseInt(minM, 10);
    
    const timeValue = hour24 * 60 + parseInt(minute, 10);
    const minValue = minHour * 60 + minMinute;
    
    return timeValue < minValue;
  }

  function handleConfirm(e?: React.MouseEvent) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    let hour = parseInt(selectedHour, 10);
    if (selectedAmPm === 'PM' && hour !== 12) hour += 12;
    if (selectedAmPm === 'AM' && hour === 12) hour = 0;
    const timeStr = `${hour.toString().padStart(2, '0')}:${selectedMinute}`;
    onChange(timeStr);
    setIsOpen(false);
  }

  function formatDisplayTime() {
    return `${selectedHour}:${selectedMinute} ${selectedAmPm}`;
  }

  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 pr-10 bg-white focus:outline-none focus:ring-2 focus:ring-[#236c2a]/20 text-sm transition-colors text-left relative cursor-pointer"
      >
        <span className="block truncate">{formatDisplayTime()}</span>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-white rounded-xl shadow-2xl border border-neutral-200 p-4 min-w-[320px]">
          <div className="flex gap-2 items-end">
            <div className="w-16">
              <label className="text-xs text-neutral-500 font-medium mb-1 block text-center">Giờ</label>
              <div className="h-36 overflow-y-auto border border-neutral-200 rounded-lg bg-white">
                {hours.map((h) => {
                  const disabled = isTimeDisabled(h, selectedMinute, selectedAmPm);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={(e) => { 
                        e.stopPropagation();
                        e.preventDefault();
                        if (!disabled) setSelectedHour(h); 
                      }}
                      disabled={disabled}
                      className={`w-full px-2 py-1 text-sm text-center hover:bg-emerald-50 transition-colors cursor-pointer ${
                        selectedHour === h 
                          ? 'bg-emerald-100 text-emerald-700 font-medium' 
                          : disabled 
                            ? 'text-neutral-300 cursor-not-allowed' 
                            : ''
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-16">
              <label className="text-xs text-neutral-500 font-medium mb-1 block text-center">Phút</label>
              <div className="h-36 overflow-y-auto border border-neutral-200 rounded-lg bg-white">
                {minutes.map((m) => {
                  const disabled = isTimeDisabled(selectedHour, m, selectedAmPm);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={(e) => { 
                        e.stopPropagation();
                        e.preventDefault();
                        if (!disabled) setSelectedMinute(m); 
                      }}
                      disabled={disabled}
                      className={`w-full px-2 py-1 text-sm text-center hover:bg-emerald-50 transition-colors cursor-pointer ${
                        selectedMinute === m 
                          ? 'bg-emerald-100 text-emerald-700 font-medium' 
                          : disabled 
                            ? 'text-neutral-300 cursor-not-allowed' 
                            : ''
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-neutral-500 font-medium text-center">Buổi</label>
              <button
                type="button"
                onClick={(e) => { 
                  e.stopPropagation();
                  e.preventDefault();
                  if (!isTimeDisabled(selectedHour, selectedMinute, 'AM')) {
                    setSelectedAmPm('AM'); 
                  }
                }}
                className={`w-12 px-2 py-2 text-sm rounded-lg transition-colors font-medium cursor-pointer ${
                  selectedAmPm === 'AM'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : isTimeDisabled(selectedHour, selectedMinute, 'AM')
                      ? 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-emerald-50'
                }`}
              >
                AM
              </button>
              <button
                type="button"
                onClick={(e) => { 
                  e.stopPropagation();
                  e.preventDefault();
                  if (!isTimeDisabled(selectedHour, selectedMinute, 'PM')) {
                    setSelectedAmPm('PM'); 
                  }
                }}
                className={`w-12 px-2 py-2 text-sm rounded-lg transition-colors font-medium cursor-pointer ${
                  selectedAmPm === 'PM'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : isTimeDisabled(selectedHour, selectedMinute, 'PM')
                      ? 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-emerald-50'
                }`}
              >
                PM
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className="w-full mt-4 bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            Xác nhận
          </button>
          </div>
        </>
      )}
    </div>
  );
}

export { TimePicker as default };
