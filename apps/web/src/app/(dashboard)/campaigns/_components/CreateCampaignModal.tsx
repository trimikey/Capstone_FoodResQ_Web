'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { type CreateCampaignInput, useUploadCampaignImage } from '@/hooks/useCampaigns';
import { useMe } from '@/hooks/useProfile';
import { reverseGeocode } from '@/lib/geocode';
import { errMsg, mediaUrl } from '@/lib/utils';
import {
  MenuSuggestions,
  SupplySuggestions,
} from '@/components/campaigns/CreateCampaignSuggestions';
import {
  balanceMenuServings,
  type MenuTemplate,
  type SupplyTemplate,
} from '@/components/campaigns/create-campaign-templates';

const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), { ssr: false });

type Step = 1 | 2 | 3 | 4 | 5;
type Period = 'midnight' | 'morning' | 'afternoon' | 'evening';
type StaffRole = 'chef' | 'waiter' | 'shipper';
type MenuRow = {
  name: string;
  type: string;
  plannedServings?: number;
  servingsLocked?: boolean;
};

const PERIODS: Array<{ id: Period; label: string; time: string; start: string; end: string; order: number; endDayOffset: number }> = [
  { id: 'midnight', label: 'Ca khuya', time: '00:00–06:00', start: '00:00', end: '06:00', order: 0, endDayOffset: 0 },
  { id: 'morning', label: 'Ca sáng', time: '06:00–12:00', start: '06:00', end: '12:00', order: 1, endDayOffset: 0 },
  { id: 'afternoon', label: 'Ca chiều', time: '12:00–18:00', start: '12:00', end: '18:00', order: 2, endDayOffset: 0 },
  { id: 'evening', label: 'Ca tối', time: '18:00–24:00', start: '18:00', end: '00:00', order: 3, endDayOffset: 1 },
];

const ROLES: Array<{ id: StaffRole; label: string }> = [
  { id: 'chef', label: 'Đầu bếp' },
  { id: 'waiter', label: 'Phục vụ' },
  { id: 'shipper', label: 'Giao hàng' },
];

const STEPS = [
  ['Thông tin & địa điểm', 'info'],
  ['Thực đơn & số suất', 'restaurant_menu'],
  ['Ca & nhân sự', 'groups'],
  ['Tuyển & ngày vận hành', 'event'],
  ['Kiểm tra & gửi', 'fact_check'],
] as const;

function dateAfter(days: number) {
  const d = new Date(Date.now() + 7 * 3600_000);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function localVn(date: string, time: string) {
  return new Date(`${date}T${time}:00+07:00`);
}

function toVnLocalInput(date: Date) {
  const vn = new Date(date.getTime() + 7 * 3600_000);
  return vn.toISOString().slice(0, 16);
}

function nowVnLocalInput() {
  return toVnLocalInput(new Date());
}

function parseVnLocal(value: string) {
  return new Date(`${value}:00+07:00`);
}

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function formatDuration(minutes: number) {
  const absoluteMinutes = Math.abs(minutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const remainingMinutes = absoluteMinutes % 60;
  return `${hours} giờ${remainingMinutes ? ` ${remainingMinutes} phút` : ''}`;
}

function suggestedStaff(servings: number, role: StaffRole) {
  if (role === 'chef') return Math.max(1, Math.ceil(servings / 50));
  if (role === 'waiter') return Math.max(1, Math.ceil(servings / 40));
  return Math.max(1, Math.ceil(servings / 80));
}

interface Props {
  onClose: () => void;
  onSubmit: (input: CreateCampaignInput) => Promise<unknown>;
  pending: boolean;
}

export default function CreateCampaignModal({ onClose, onSubmit, pending }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kitchenAddress, setKitchenAddress] = useState('');
  const [addressSource, setAddressSource] = useState<'manual' | 'profile' | 'current'>('manual');
  const [locating, setLocating] = useState(false);
  const [lng, setLng] = useState(106.6297);
  const [lat, setLat] = useState(10.8231);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [expectedServings, setExpectedServings] = useState<number | ''>('');
  const [expectedServingsError, setExpectedServingsError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuRow[]>([
    { name: '', type: 'lunch' },
  ]);
  const [supplies, setSupplies] = useState<Array<{ name: string; quantity?: number; unit?: string }>>([]);
  const [scheduledDate, setScheduledDate] = useState(dateAfter(7));
  const [endDate, setEndDate] = useState('');
  const [activePeriods, setActivePeriods] = useState<Period[]>(['morning']);
  const [recruitmentStartAt, setRecruitmentStartAt] = useState(() => toVnLocalInput(new Date(Date.now() + 3600_000)));
  const [recruitmentEndAt, setRecruitmentEndAt] = useState('');
  const [staffing, setStaffing] = useState<Record<string, number>>({
    'morning:chef': 2, 'morning:waiter': 3, 'morning:shipper': 2,
  });
  const { data: me } = useMe();
  const profileAddress = me?.receiver?.address ?? me?.provider?.address ?? '';
  const profileLat = me?.receiver?.lat ?? me?.provider?.lat ?? null;
  const profileLng = me?.receiver?.lng ?? me?.provider?.lng ?? null;

  const selectedPeriods = useMemo(() => PERIODS.filter((period) => activePeriods.includes(period.id)), [activePeriods]);
  const firstPeriod = selectedPeriods[0] ?? PERIODS[1];
  const lastPeriod = selectedPeriods[selectedPeriods.length - 1] ?? PERIODS[1];
  const effectiveEndDate = endDate || scheduledDate;
  const operationStartAt = localVn(scheduledDate, firstPeriod.start);
  const operationEndAt = useMemo(() => {
    const result = localVn(effectiveEndDate, lastPeriod.end);
    if (lastPeriod.endDayOffset) result.setUTCDate(result.getUTCDate() + lastPeriod.endDayOffset);
    return result;
  }, [effectiveEndDate, lastPeriod]);
  const recruitmentBufferMinutes = useMemo(() => {
    if (!recruitmentEndAt) return null;
    const recruitmentEnd = parseVnLocal(recruitmentEndAt);
    if (!Number.isFinite(recruitmentEnd.getTime())) return null;
    return Math.floor((operationStartAt.getTime() - recruitmentEnd.getTime()) / 60_000);
  }, [operationStartAt, recruitmentEndAt]);
  const recruitmentBufferIsTooShort = recruitmentBufferMinutes !== null && recruitmentBufferMinutes < 360;
  const minRecruitmentStartAt = nowVnLocalInput();
  const expectedServingsValue = expectedServings === '' ? 0 : expectedServings;
  const servingsRef = useRef(expectedServingsValue);

  function updateExpectedServings(rawValue: string) {
    if (!/^\d*$/.test(rawValue)) {
      setExpectedServingsError('Chỉ được nhập số nguyên, không được nhập chữ hoặc ký tự đặc biệt.');
      return;
    }

    const value = rawValue === '' ? '' : Number(rawValue);
    const numericValue = value === '' ? 0 : value;
    if (value !== '' && value < 1) {
      setExpectedServingsError('Số suất dự kiến phải lớn hơn 0.');
    } else if (value !== '' && value > 100000) {
      setExpectedServingsError('Số suất dự kiến không được vượt quá 100.000.');
    } else {
      setExpectedServingsError(null);
    }
    servingsRef.current = numericValue;
    setExpectedServings(value);
    setMenu((rows) => balanceMenuServings(rows, numericValue));
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    function onInsert(event: Event) {
      const { kind, payload } = (
        event as CustomEvent<{ kind: string; payload: unknown }>
      ).detail;

      if (kind === 'supply') {
        const item = payload as SupplyTemplate;
        setSupplies((rows) =>
          rows.some((row) => row.name.trim().toLowerCase() === item.name.trim().toLowerCase())
            ? rows
            : [...rows, { name: item.name, quantity: item.quantity, unit: item.unit }],
        );
      } else if (kind === 'menu') {
        const item = payload as MenuTemplate;
        setMenu((rows) => {
          if (rows.some((row) => row.name.trim().toLowerCase() === item.name.trim().toLowerCase())) {
            return rows;
          }
          const withoutBlankStarter = rows.filter((row) => row.name.trim());
          return balanceMenuServings(
            [...withoutBlankStarter, { name: item.name, type: item.type }],
            servingsRef.current,
          );
        });
      }
    }

    function onRemove(event: Event) {
      const { kind, payload } = (
        event as CustomEvent<{ kind: string; payload: unknown }>
      ).detail;
      if (kind === 'menu') {
        const item = payload as MenuTemplate;
        setMenu((rows) =>
          balanceMenuServings(
            rows.filter((row) => row.name.trim().toLowerCase() !== item.name.trim().toLowerCase()),
            servingsRef.current,
          ),
        );
      }
    }

    window.addEventListener('cm:insert-template', onInsert as EventListener);
    window.addEventListener('cm:remove-template', onRemove as EventListener);
    return () => {
      window.removeEventListener('cm:insert-template', onInsert as EventListener);
      window.removeEventListener('cm:remove-template', onRemove as EventListener);
    };
  }, []);

  function togglePeriod(id: Period) {
    const next = activePeriods.includes(id) ? activePeriods.filter((period) => period !== id) : [...activePeriods, id];
    setActivePeriods(PERIODS.filter((period) => next.includes(period.id)).map((period) => period.id));
  }

  function useRegisteredAddress() {
    if (!profileAddress.trim()) {
      toast.error('Hồ sơ chưa có địa chỉ mặc định. Bạn có thể cập nhật trong trang Hồ sơ.');
      return;
    }
    setKitchenAddress(profileAddress);
    if (profileLat != null && profileLng != null) {
      setLat(profileLat);
      setLng(profileLng);
    }
    setAddressSource('profile');
    toast.success('Đã dùng địa chỉ mặc định trong hồ sơ.');
  }

  function useCurrentLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Trình duyệt này không hỗ trợ định vị.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const nextLat = coords.latitude;
        const nextLng = coords.longitude;
        setLat(nextLat);
        setLng(nextLng);
        const address = await reverseGeocode(nextLat, nextLng);
        setKitchenAddress(address ?? `${nextLat.toFixed(6)}, ${nextLng.toFixed(6)}`);
        setAddressSource('current');
        setLocating(false);
        toast.success('Đã cập nhật vị trí hiện tại trên bản đồ.');
      },
      (error) => {
        setLocating(false);
        const message = error.code === error.PERMISSION_DENIED
          ? 'Bạn đã từ chối quyền vị trí. Hãy cấp quyền trong trình duyệt hoặc chọn trên bản đồ.'
          : 'Không thể xác định vị trí hiện tại. Hãy thử lại hoặc chọn trên bản đồ.';
        toast.error(message);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  function periodsAreContiguous() {
    const orders = selectedPeriods.map((period) => period.order);
    return orders.length > 0 && orders.every((order, index) => index === 0 || order === orders[index - 1] + 1);
  }

  function validateExpectedServings() {
    if (expectedServingsError) return expectedServingsError;
    if (expectedServings === '') return 'Vui lòng nhập số suất dự kiến.';
    if (expectedServings < 1) return 'Số suất dự kiến phải lớn hơn 0.';
    if (expectedServings > 100000) return 'Số suất dự kiến không được vượt quá 100.000.';
    return null;
  }

  function validate(current: Step) {
    if (current === 1) {
      if (title.trim().length < 5) return 'Tiêu đề phải có ít nhất 5 ký tự.';
      if (kitchenAddress.trim().length < 5) return 'Vui lòng nhập địa chỉ bếp.';
    }
    if (current === 2) {
      const servingsError = validateExpectedServings();
      if (servingsError) return servingsError;
      if (!menu.some((item) => item.name.trim() && item.type)) return 'Chiến dịch phải có ít nhất một món.';
    }
    if (current === 3) {
      if (!periodsAreContiguous()) return 'Hãy chọn ít nhất một ca và các ca phải liên tiếp.';
      if (totalShiftSlots < 1) return 'Phải có ít nhất một vị trí tình nguyện viên cần tuyển.';
    }
    if (current === 4) {
      const start = parseVnLocal(recruitmentStartAt);
      const end = parseVnLocal(recruitmentEndAt);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 'Thời gian tuyển không hợp lệ.';
      if (start.getTime() < Date.now() - 60_000) return 'Thời gian mở tuyển không được ở quá khứ.';
      if (start >= end) return 'Thời gian mở tuyển phải trước thời gian đóng tuyển.';
      if (!scheduledDate || scheduledDate < dateAfter(1)) {
        return 'Ngày vận hành phải từ ngày mai trở đi.';
      }
      if (endDate && endDate < scheduledDate) return 'Ngày kết thúc không được trước ngày bắt đầu.';
      if (recruitmentBufferMinutes === null || recruitmentBufferIsTooShort) {
        return 'Ca đầu tiên phải bắt đầu sau thời gian đóng tuyển ít nhất 6 giờ.';
      }
    }
    return null;
  }

  function nextStep() {
    const error = validate(step);
    if (error) {
      if (step === 2) {
        const servingsError = validateExpectedServings();
        if (servingsError) setExpectedServingsError(servingsError);
      }
      return toast.error(error);
    }
    setStep((step + 1) as Step);
  }

  const totalShiftSlots = selectedPeriods.reduce(
    (sum, period) => sum + ROLES.reduce((roleSum, role) => roleSum + (staffing[`${period.id}:${role.id}`] ?? 0), 0), 0,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    for (const candidate of [1, 2, 3, 4] as Step[]) {
      const error = validate(candidate);
      if (error) {
        if (candidate === 2) {
          const servingsError = validateExpectedServings();
          if (servingsError) setExpectedServingsError(servingsError);
        }
        setStep(candidate);
        toast.error(error);
        return;
      }
    }
    const shifts = selectedPeriods.flatMap((period) => ROLES.flatMap((role) => {
      const slotsNeeded = staffing[`${period.id}:${role.id}`] ?? 0;
      return slotsNeeded > 0 ? [{ label: `${period.label} — ${role.label}`, period: period.id, role: role.id, slotsNeeded }] : [];
    }));
    try {
      await onSubmit({
        title: title.trim(), description: description.trim() || undefined, kitchenAddress: kitchenAddress.trim(), lng, lat,
        scheduledDate, endDate: endDate || undefined,
        recruitmentStartAt: `${recruitmentStartAt}:00+07:00`, recruitmentEndAt: `${recruitmentEndAt}:00+07:00`,
        expectedServings: expectedServingsValue, imageUrls: imageUrl ? [imageUrl] : undefined,
        menuItems: menu.filter((item) => item.name.trim()).map((item) => ({ name: item.name.trim(), type: item.type, plannedServings: item.plannedServings })),
        supplyItems: supplies.filter((item) => item.name.trim()).map((item) => ({ ...item, name: item.name.trim(), unit: item.unit?.trim() || undefined })),
        shifts,
      });
      toast.success('Đã gửi kế hoạch chiến dịch để admin duyệt.');
      onClose();
    } catch (error) {
      toast.error(errMsg(error, 'Không thể tạo chiến dịch'));
    }
  }

  return (
    <div
      className="cm-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cm-create-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cm-modal cm-create-modal">
        <form onSubmit={submit}>
          <div className="cm-modal-header">
            <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-200">Yêu cầu mới · Chờ admin duyệt</p><h2 id="cm-create-title" className="text-2xl font-extrabold text-white">Tạo chiến dịch mới</h2><p className="mt-1 text-sm text-white/80">Hoàn thành 5 bước. Dữ liệu chỉ được gửi sau khi bạn kiểm tra lại.</p></div>
            <button type="button" onClick={onClose} className="cm-modal-close" aria-label="Đóng"><span className="material-symbols-outlined">close</span></button>
          </div>

          <nav className="cm-stepper" aria-label="Các bước tạo chiến dịch">
            {STEPS.map(([label, icon], index) => {
              const number = (index + 1) as Step;
              return <button type="button" key={label} onClick={() => number < step && setStep(number)} className={`cm-stepper-item ${step === number ? 'is-active' : ''} ${step > number ? 'is-done' : ''}`}><span className="cm-stepper-dot"><span className="material-symbols-outlined text-[16px]">{step > number ? 'check' : icon}</span></span><span className="cm-stepper-text"><span className="cm-stepper-index">Bước {number}</span><span className="cm-stepper-label">{label}</span></span></button>;
            })}
          </nav>

          <div className="cm-modal-body"><div className="mx-auto w-full max-w-5xl space-y-4">
            {step === 1 && <>
              <Block title="Thông tin cơ bản" icon="info"><input className="cm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tên chiến dịch *" maxLength={255} /><textarea className="cm-input mt-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả đối tượng phục vụ và mục tiêu chiến dịch" rows={3} maxLength={5000} /></Block>
              <Block
                title="Địa điểm bếp"
                icon="place"
                description="Chọn địa chỉ đã đăng ký, lấy vị trí hiện tại hoặc nhập và đặt ghim thủ công."
              >
                <div className="cm-address-actions" aria-label="Cách chọn địa chỉ">
                  <button
                    type="button"
                    className={`cm-address-option ${addressSource === 'profile' ? 'is-active' : ''}`}
                    onClick={useRegisteredAddress}
                    disabled={!profileAddress.trim()}
                    title={!profileAddress.trim() ? 'Hồ sơ chưa có địa chỉ mặc định' : profileAddress}
                  >
                    <span className="material-symbols-outlined">home_pin</span>
                    <span><strong>Địa chỉ đã đăng ký</strong><small>{profileAddress.trim() || 'Chưa có trong hồ sơ'}</small></span>
                  </button>
                  <button
                    type="button"
                    className={`cm-address-option ${addressSource === 'current' ? 'is-active' : ''}`}
                    onClick={useCurrentLocation}
                    disabled={locating}
                    aria-busy={locating}
                  >
                    <span className={`material-symbols-outlined ${locating ? 'animate-spin' : ''}`}>{locating ? 'progress_activity' : 'my_location'}</span>
                    <span><strong>{locating ? 'Đang xác định…' : 'Vị trí hiện tại'}</strong><small>Cho phép trình duyệt truy cập GPS</small></span>
                  </button>
                </div>
                <label className="cm-field-label" htmlFor="cm-kitchen-address">Địa chỉ bếp <span aria-hidden="true">*</span></label>
                <input id="cm-kitchen-address" className="cm-input" value={kitchenAddress} onChange={(e) => { setKitchenAddress(e.target.value); setAddressSource('manual'); }} placeholder="Ví dụ: 123 Nguyễn Văn A, TP.HCM" aria-required="true" />
                <p className="cm-field-helper"><span className="material-symbols-outlined">touch_app</span>Bạn cũng có thể bấm hoặc kéo ghim trên bản đồ để chọn chính xác vị trí.</p>
                <div className="h-64 overflow-hidden rounded-2xl border border-neutral-200"><LocationPicker lng={lng} lat={lat} address={kitchenAddress} onPick={(nextLng, nextLat, address) => { setLng(nextLng); setLat(nextLat); if (address) setKitchenAddress(address); }} /></div>
              </Block>
              <Block title="Ảnh bìa" icon="image"><ImageUploader value={imageUrl} onChange={setImageUrl} /></Block>
            </>}

            {step === 2 && <>
              <Block
                title="Số suất và thực đơn"
                icon="restaurant_menu"
                description="Chọn món gợi ý để điền nhanh, sau đó điều chỉnh bữa ăn và số suất nếu cần."
              >
                <label className="cm-field-label" htmlFor="cm-expected-servings">Số suất dự kiến</label>
                <input
                  id="cm-expected-servings"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`cm-input ${expectedServingsError ? 'border-rose-500 ring-2 ring-rose-100' : ''}`}
                  value={expectedServings}
                  onChange={(e) => updateExpectedServings(e.target.value)}
                  onBlur={() => {
                    if (expectedServings === '') setExpectedServingsError('Vui lòng nhập số suất dự kiến.');
                  }}
                  placeholder="Ví dụ: 200"
                  aria-invalid={Boolean(expectedServingsError)}
                  aria-describedby={expectedServingsError ? 'cm-expected-servings-error' : 'cm-expected-servings-help'}
                />
                {expectedServingsError ? (
                  <p id="cm-expected-servings-error" className="mt-2 flex items-center gap-1 text-xs font-semibold text-rose-600" role="alert" aria-live="polite">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    {expectedServingsError}
                  </p>
                ) : (
                  <p id="cm-expected-servings-help" className="cm-field-helper">Nhập tổng số phần ăn dự kiến của toàn chiến dịch.</p>
                )}
                <div className="cm-suggestion-bar">
                  <div>
                    <strong>Chưa biết chọn món nào?</strong>
                    <span>Dùng mẫu phổ biến hoặc gợi ý theo nguyên liệu đã nhập.</span>
                  </div>
                  <MenuSuggestions
                    supplies={supplies.filter((item) => item.name.trim())}
                    expectedServings={expectedServingsValue}
                    currentMenuCount={menu.filter((item) => item.name.trim()).length}
                  />
                </div>
                <div className="cm-repeat">
                  {menu.map((item, index) => <div key={index} className="cm-repeat-row cm-repeat-row--menu">
                    <input className="cm-input" value={item.name} onChange={(e) => setMenu(menu.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} placeholder="Ví dụ: Cơm thịt kho trứng" aria-label={`Tên món ${index + 1}`} />
                    <select className="cm-input" value={item.type} onChange={(e) => setMenu(menu.map((row, i) => i === index ? { ...row, type: e.target.value } : row))} aria-label={`Bữa ăn cho món ${index + 1}`}><option value="breakfast">Bữa sáng</option><option value="lunch">Bữa trưa</option><option value="dinner">Bữa tối</option></select>
                    <input type="number" min={0} className="cm-input" value={item.plannedServings ?? ''} onChange={(e) => setMenu(balanceMenuServings(menu.map((row, i) => i === index ? { ...row, plannedServings: e.target.value === '' ? undefined : Number(e.target.value), servingsLocked: e.target.value !== '' } : row), expectedServingsValue))} placeholder="Số suất" aria-label={`Số suất món ${index + 1}`} />
                    <RemoveButton onClick={() => setMenu(balanceMenuServings(menu.filter((_, i) => i !== index), expectedServingsValue))} />
                  </div>)}
                  <AddButton onClick={() => setMenu(balanceMenuServings([...menu, { name: '', type: 'lunch' }], expectedServingsValue))}>Thêm món</AddButton>
                </div>
              </Block>
              <Block
                title="Nguyên liệu và vật phẩm"
                icon="inventory_2"
                description="Không bắt buộc. Thêm nguyên liệu để hệ thống lọc gợi ý món ăn phù hợp hơn."
              >
                <div className="cm-suggestion-bar cm-suggestion-bar--compact">
                  <span>Điền nhanh danh sách nguyên liệu theo quy mô chiến dịch.</span>
                  <SupplySuggestions expectedServings={expectedServingsValue} />
                </div>
                <div className="cm-repeat">
                  {supplies.map((item, index) => <div key={index} className="cm-repeat-row cm-repeat-row--supplies">
                    <input className="cm-input" value={item.name} onChange={(e) => setSupplies(supplies.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} placeholder="Ví dụ: Gạo sạch" aria-label={`Tên vật phẩm ${index + 1}`} />
                    <input type="number" min={0} className="cm-input" value={item.quantity ?? ''} onChange={(e) => setSupplies(supplies.map((row, i) => i === index ? { ...row, quantity: e.target.value === '' ? undefined : Number(e.target.value) } : row))} placeholder="SL" aria-label={`Số lượng vật phẩm ${index + 1}`} />
                    <input className="cm-input" value={item.unit ?? ''} onChange={(e) => setSupplies(supplies.map((row, i) => i === index ? { ...row, unit: e.target.value } : row))} placeholder="kg" aria-label={`Đơn vị vật phẩm ${index + 1}`} />
                    <RemoveButton onClick={() => setSupplies(supplies.filter((_, i) => i !== index))} />
                  </div>)}
                  <AddButton onClick={() => setSupplies([...supplies, { name: '' }])}>Thêm vật phẩm</AddButton>
                </div>
              </Block>
            </>}

            {step === 3 && <>
              <Block title="Chọn các ca cần tuyển" icon="schedule">
                <p className="mb-3 text-xs text-neutral-500">Chọn các ca hoạt động liên tiếp để lập nhu cầu nhân sự cho chiến dịch.</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {PERIODS.map((period) => <button key={period.id} type="button" onClick={() => togglePeriod(period.id)} className={`rounded-2xl border p-4 text-left ${activePeriods.includes(period.id) ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-neutral-200 bg-white'}`}><span className="block text-sm font-extrabold">{period.label}</span><span className="text-xs">{period.time}</span></button>)}
                </div>
                {!periodsAreContiguous() && <p className="mt-2 text-xs font-bold text-rose-600">Các ca phải liên tiếp, không được bỏ trống ca ở giữa.</p>}
              </Block>
              <Block title="Định biên nhân sự theo từng ca" icon="groups"><p className="mb-3 text-xs text-neutral-500">Nhập số tình nguyện viên cần tuyển cho từng vai trò. Chiến dịch chỉ bắt đầu khi các vị trí yêu cầu đã đủ người xác nhận.</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Ca</th>{ROLES.map((role) => <th className="p-2" key={role.id}>{role.label}</th>)}</tr></thead><tbody>{selectedPeriods.map((period) => <tr className="border-b" key={period.id}><td className="p-2 font-bold">{period.label}<span className="block text-xs font-normal text-neutral-500">{period.time}</span></td>{ROLES.map((role) => { const key = `${period.id}:${role.id}`; return <td className="p-2" key={role.id}><input type="number" min={0} max={100} className="cm-input w-24" value={staffing[key] ?? 0} onChange={(e) => setStaffing({ ...staffing, [key]: Number(e.target.value) })} onFocus={(e) => { if (Number(e.currentTarget.value) === 0) setStaffing({ ...staffing, [key]: suggestedStaff(expectedServingsValue, role.id) }); }} /></td>; })}</tr>)}</tbody></table></div><p className="mt-3 text-xs font-bold text-neutral-600">Tổng nhu cầu: {totalShiftSlots} lượt ca. Một người có thể nhận nhiều ca liền kề.</p></Block>
            </>}

            {step === 4 && <>
              <Block title="Khoảng thời gian tuyển riêng" icon="event_available">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-bold text-neutral-600">
                    Mở tuyển
                    <input type="datetime-local" className="cm-input mt-1" value={recruitmentStartAt} min={minRecruitmentStartAt} onChange={(e) => setRecruitmentStartAt(e.target.value)} />
                  </label>
                  <label className="text-xs font-bold text-neutral-600">
                    Đóng tuyển
                    <input type="datetime-local" className="cm-input mt-1" value={recruitmentEndAt} min={recruitmentStartAt || minRecruitmentStartAt} onChange={(e) => setRecruitmentEndAt(e.target.value)} />
                  </label>
                </div>
                <p className="mt-3 text-xs text-neutral-500">Khoảng đệm được tự động tính từ lúc đóng tuyển đến giờ bắt đầu ca đầu tiên và phải đạt tối thiểu 6 giờ.</p>
              </Block>
              <Block title="Ngày vận hành chiến dịch" icon="calendar_month">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-bold text-neutral-600">
                    Ngày bắt đầu
                    <input
                      type="date"
                      className={`cm-input mt-1 ${recruitmentBufferIsTooShort ? 'border-rose-500 ring-2 ring-rose-100' : ''}`}
                      value={scheduledDate}
                      min={dateAfter(1)}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      aria-invalid={recruitmentBufferIsTooShort}
                      aria-describedby={recruitmentBufferMinutes !== null ? 'cm-operation-date-rule' : undefined}
                    />
                  </label>
                  <label className="text-xs font-bold text-neutral-600">
                    Ngày kết thúc
                    <input type="date" className="cm-input mt-1" value={endDate} min={scheduledDate} onChange={(e) => setEndDate(e.target.value)} />
                  </label>
                </div>
                {recruitmentBufferMinutes !== null && (
                  <p id="cm-operation-date-rule" className={`mt-3 rounded-xl p-3 text-xs font-semibold ${recruitmentBufferIsTooShort ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-900'}`} role={recruitmentBufferIsTooShort ? 'alert' : undefined}>
                    {recruitmentBufferMinutes < 0
                      ? `Ca đầu tiên đang bắt đầu trước thời gian đóng tuyển ${formatDuration(recruitmentBufferMinutes)}.`
                      : `Khoảng đệm tự động: ${formatDuration(recruitmentBufferMinutes)} — ${recruitmentBufferIsTooShort ? 'chưa đạt quy định tối thiểu 6 giờ.' : 'đã đạt quy định tối thiểu 6 giờ.'}`}
                  </p>
                )}
                <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">Vận hành: {formatDateTime(operationStartAt)} → {formatDateTime(operationEndAt)}</p>
              </Block>
            </>}

            {step === 5 && <><Block title="Tổng quan trước khi gửi" icon="fact_check"><Summary label="Chiến dịch" value={title} /><Summary label="Thực đơn" value={`${menu.filter((item) => item.name.trim()).length} món · ${expectedServingsValue} suất`} /><Summary label="Vận hành" value={`${formatDateTime(operationStartAt)} → ${formatDateTime(operationEndAt)}`} /><Summary label="Tuyển tình nguyện viên" value={`${formatDateTime(parseVnLocal(recruitmentStartAt))} → ${formatDateTime(parseVnLocal(recruitmentEndAt))}`} /><Summary label="Nhu cầu" value={`${totalShiftSlots} lượt ca; kiểm tra đủ 100% riêng từng ca/vai trò`} /></Block><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Sau khi admin duyệt, hệ thống tự mở/đóng tuyển. Chiến dịch tự bắt đầu đúng giờ nếu tất cả ca đã đủ người xác nhận; không có nút bắt đầu thủ công.</div></>}
          </div></div>

          <div className="cm-modal-footer"><button type="button" onClick={onClose} className="cm-btn-cancel">Huỷ</button>{step > 1 && <button type="button" onClick={() => setStep((step - 1) as Step)} className="cm-btn-cancel cm-btn-back"><span className="material-symbols-outlined text-[18px]">arrow_back</span>Quay lại</button>}{step < 5 ? <button type="button" onClick={nextStep} className="cm-btn-submit">Tiếp tục<span className="material-symbols-outlined text-[18px]">arrow_forward</span></button> : <button type="submit" disabled={pending} className="cm-btn-submit">{pending ? 'Đang gửi…' : 'Gửi yêu cầu duyệt'}</button>}</div>
        </form>
      </div>
    </div>
  );
}

function Block({ title, icon, description, children }: { title: string; icon: string; description?: string; children: React.ReactNode }) {
  return <section className="cm-form-block"><div className="cm-form-block-heading"><h3 className="cm-form-block-label"><span className="material-symbols-outlined">{icon}</span>{title}</h3>{description && <p>{description}</p>}</div>{children}</section>;
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="cm-repeat-add"><span className="material-symbols-outlined text-[15px]">add</span>{children}</button>;
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="cm-repeat-remove" aria-label="Xoá"><span className="material-symbols-outlined text-[18px]">close</span></button>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[180px_1fr] gap-3 border-b border-neutral-100 py-3 last:border-0"><span className="text-xs font-bold uppercase text-neutral-500">{label}</span><span className="text-sm font-semibold text-neutral-900">{value}</span></div>;
}

function ImageUploader({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const upload = useUploadCampaignImage();
  const ref = useRef<HTMLInputElement>(null);
  return <div className="flex items-center gap-3">{value && <img src={mediaUrl(value)} alt="Ảnh chiến dịch" className="h-20 w-28 rounded-xl object-cover" />}<button type="button" className="cm-repeat-add" disabled={upload.isPending} onClick={() => ref.current?.click()}>{upload.isPending ? 'Đang tải…' : value ? 'Đổi ảnh' : 'Tải ảnh lên'}</button>{value && <button type="button" className="text-xs font-bold text-rose-600" onClick={() => onChange(null)}>Xoá</button>}<input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const result = await upload.mutateAsync(file); onChange(result.url); } catch (error) { toast.error(errMsg(error, 'Tải ảnh thất bại')); } event.target.value = ''; }} /></div>;
}
