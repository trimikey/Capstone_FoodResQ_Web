'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { staffingDemand, staffingVerdict, type StaffRole } from '@/lib/campaign-staffing';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { reverseGeocode, searchAddress, type AddressSuggestion } from '@/lib/geocode';
import {
  useUploadCampaignImage,
  useCampaignCreateConstraints,
  type CreateCampaignInput,
} from '@/hooks/useCampaigns';
import { useMe } from '@/hooks/useProfile';
import { useCampaignDraft } from '@/hooks/useCampaignDraft';
import { formatVnDate, vnToday, vnTomorrow } from '@/lib/vn-date';
import { errMsg, mediaUrl } from '@/lib/utils';
import {
  ShiftSuggestions,
  ScheduleSuggestions,
  SupplySuggestions,
  MenuSuggestions,
} from '@/components/campaigns/CreateCampaignSuggestions';
import { balanceMenuServings } from '@/components/campaigns/create-campaign-templates';
import type {
  ShiftTemplate,
  ScheduleTemplate,
  SupplyTemplate,
  MenuTemplate,
} from '@/components/campaigns/create-campaign-templates';

const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400">
      Đang tải bản đồ…
    </div>
  ),
});

/** Ngày mai theo giờ VN. Xem `@/lib/vn-date` để biết vì sao không dùng toISOString(). */
function tomorrowDateString() {
  return vnTomorrow();
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
      <span className="material-symbols-outlined text-[13px]">error</span>
      {message}
    </p>
  );
}

/** Ba bước của form — dùng cho thanh tiến trình và điều hướng footer. */
const FORM_STEPS = [
  { num: 1 as const, label: 'Thông tin & Địa điểm', icon: 'info' },
  { num: 2 as const, label: 'Thời gian & Nhân sự', icon: 'event' },
  { num: 3 as const, label: 'Thực đơn & Chuẩn bị', icon: 'restaurant_menu' },
];

/** Trường lỗi thuộc bước nào — để "Tiếp tục" chỉ chặn vì lỗi của chính bước đó. */
function stepOfField(key: string | undefined): 1 | 2 | 3 {
  if (!key) return 1;
  if (key.startsWith('menu.') || key.startsWith('schedule.') || key.startsWith('supplies.')) return 3;
  if (key.startsWith('shifts.')) return 2;
  if (
    [
      'scheduledDate',
      'endDate',
      'startTime',
      'endTime',
      'expectedServings',
      'chefSlotsNeeded',
      'waiterSlotsNeeded',
      'shipperSlotsNeeded',
    ].includes(key)
  ) {
    return 2;
  }
  return 1;
}

/** Một ca trực đang soạn trong form — khớp ShiftLike của lib tính nhân sự. */
type ShiftDraft = {
  label: string;
  role?: StaffRole;
  startTime: string;
  endTime: string;
  slotsNeeded: number;
};

interface CreateCampaignModalProps {
  onClose: () => void;
  onSubmit: (input: CreateCampaignInput) => Promise<unknown>;
  pending: boolean;
}

/** Một dòng trong thực đơn. `servingsLocked` = người dùng đã tự gõ số suất cho món này
 *  nên hàm chia đều phải chừa ra, không ghi đè. */
type MenuRow = {
  name: string;
  type: string;
  plannedServings?: number;
  servingsLocked?: boolean;
};

/** Toàn bộ state được giữ lại trong bản nháp localStorage. */
interface CampaignDraftData {
  f: {
    title: string;
    description: string;
    kitchenAddress: string;
    scheduledDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    chefSlotsNeeded: number;
    waiterSlotsNeeded: number;
    shipperSlotsNeeded: number;
    expectedServings: number;
    lng: number;
    lat: number;
  };
  menu: MenuRow[];
  schedule: { time: string; label: string }[];
  supplies: { name: string; quantity?: number; unit?: string }[];
  shifts: ShiftDraft[];
  step: 1 | 2 | 3;
  imageUrl: string | null;
}

export default function CreateCampaignModal({
  onClose,
  onSubmit,
  pending,
}: CreateCampaignModalProps) {
  // Ràng buộc lấy từ server: chiến dịch dài ngày phải báo trước N ngày (admin chỉnh
  // được), chiến dịch trong ngày thì mở lúc nào cũng được.
  const { data: constraints } = useCampaignCreateConstraints();
  const leadDays = constraints?.multiDayLeadDays ?? 0;
  const multiDayMinDate = constraints?.multiDayEarliestStartDate ?? vnToday();

  // Nháp đọc từ localStorage — khôi phục nguyên trạng form đang điền dở.
  const draft = useCampaignDraft<CampaignDraftData>();
  const [f, setF] = useState(() => draft.restored?.data.f ?? {
    title: '',
    description: '',
    kitchenAddress: '',
    scheduledDate: tomorrowDateString(),
    /** Ngày kết thúc (>= scheduledDate). Bỏ trống = 1 ngày duy nhất. */
    endDate: '' as string,
    startTime: '08:00',
    endTime: '12:00',
    chefSlotsNeeded: 2,
    waiterSlotsNeeded: 3,
    shipperSlotsNeeded: 2,
    expectedServings: 100,
    lng: 106.6297,
    lat: 10.8231,
  });
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(
    () => draft.restored?.data.imageUrl ?? null,
  );
  const [addressMode, setAddressMode] = useState<'profile' | 'custom'>('custom');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [addressNoResults, setAddressNoResults] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: me } = useMe();

  const profileAddress = me?.receiver?.address?.trim() ?? '';
  const profileLat = me?.receiver?.lat ?? null;
  const profileLng = me?.receiver?.lng ?? null;
  const hasProfileAddress = profileAddress.length >= 5;

  function applyProfileAddress() {
    if (!hasProfileAddress) {
      toast.warning('Hồ sơ chưa có địa chỉ mặc định.');
      return;
    }
    searchAbortRef.current?.abort();
    setAddressMode('profile');
    setAddressSuggestions([]);
    setAddressNoResults(false);
    setF((prev) => ({
      ...prev,
      kitchenAddress: profileAddress,
      lat: profileLat ?? prev.lat,
      lng: profileLng ?? prev.lng,
    }));
    setErr('kitchenAddress', undefined);
  }

  function switchToCustomAddress() {
    setAddressMode('custom');
    setAddressSuggestions([]);
    setAddressNoResults(false);
  }

  function queueAddressSearch(text: string) {
    searchAbortRef.current?.abort();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const q = text.trim();
    if (q.length < 3) {
      setAddressSuggestions([]);
      setAddressNoResults(false);
      setAddressSearching(false);
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setAddressSearching(true);
    setAddressNoResults(false);
    searchTimerRef.current = setTimeout(() => {
      void searchAddress(q, controller.signal)
        .then((items) => {
          if (controller.signal.aborted) return;
          setAddressSuggestions(items);
          setAddressNoResults(items.length === 0);
        })
        .finally(() => {
          if (!controller.signal.aborted) setAddressSearching(false);
        });
    }, 550);
  }

  function selectAddressSuggestion(item: AddressSuggestion) {
    searchAbortRef.current?.abort();
    setAddressMode('custom');
    setAddressSuggestions([]);
    setAddressNoResults(false);
    setGeocodeError(false);
    setF((prev) => ({
      ...prev,
      kitchenAddress: item.displayName,
      lat: item.lat,
      lng: item.lng,
    }));
    setErr('kitchenAddress', undefined);
  }

  async function onMapPick(lng: number, lat: number) {
    setAddressMode('custom');
    setF((prev) => ({ ...prev, lng, lat }));
    setGeocoding(true);
    setGeocodeError(false);
    const address = await reverseGeocode(lat, lng);
    setGeocoding(false);
    if (address) {
      setF((prev) => ({ ...prev, kitchenAddress: address }));
    } else {
      setGeocodeError(true);
      setF((prev) => ({ ...prev, kitchenAddress: `${lat.toFixed(6)}, ${lng.toFixed(6)}` }));
      toast.warning('Không lấy được địa chỉ từ bản đồ — bạn có thể tự nhập tay phía trên.');
    }
  }

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const upload = useUploadCampaignImage();

  const [menu, setMenu] = useState<MenuRow[]>(() => draft.restored?.data.menu ?? []);
  const [schedule, setSchedule] = useState<{ time: string; label: string }[]>(
    () => draft.restored?.data.schedule ?? [],
  );
  const [supplies, setSupplies] = useState<{ name: string; quantity?: number; unit?: string }[]>(
    () => draft.restored?.data.supplies ?? [],
  );
  const [shifts, setShifts] = useState<ShiftDraft[]>(() => draft.restored?.data.shifts ?? []);
  // Form dài ~8 khối; gom thành 3 bước như trang tạo tin của NCC để popup không
  // phải cuộn hàng nghìn pixel mới tới nút gửi.
  const [step, setStep] = useState<1 | 2 | 3>(() => draft.restored?.data.step ?? 1);

  // Ghi nháp mỗi khi có thay đổi (hook tự debounce).
  // Phụ thuộc `draft.save` chứ KHÔNG phải cả object `draft`: hook trả về object mới
  // mỗi render, để nguyên thì effect chạy liên tục và debounce không bao giờ kịp bắn.
  const saveDraft = draft.save;
  useEffect(() => {
    saveDraft({ f, menu, schedule, supplies, shifts, step, imageUrl });
  }, [f, menu, schedule, supplies, shifts, step, imageUrl, saveDraft]);

  // Handler chèn mẫu là listener DOM đăng ký một lần, không thấy state mới nhất —
  // giữ tổng suất trong ref để nó luôn chia theo con số hiện tại.
  const servingsRef = useRef(f.expectedServings);
  useEffect(() => {
    servingsRef.current = f.expectedServings;
  }, [f.expectedServings]);

  // Đổi tổng số suất của chiến dịch → chia lại cho các món chưa bị người dùng sửa tay.
  useEffect(() => {
    setMenu((prev) => (prev.length === 0 ? prev : balanceMenuServings(prev, f.expectedServings)));
  }, [f.expectedServings]);

  /** Tổng suất đang phân bổ cho thực đơn — để cảnh báo khi lệch với đăng ký. */
  const menuServingsTotal = menu.reduce((s, m) => s + (m.plannedServings ?? 0), 0);

  // Lắng nghe dropdown gợi ý — chèn mẫu vào state tương ứng.
  useEffect(() => {
    function onInsert(e: Event) {
      const ce = e as CustomEvent<{ kind: string; payload: unknown }>;
      const { kind, payload } = ce.detail;
      if (kind === 'shift') {
        const t = payload as ShiftTemplate;
        setShifts((prev) => {
          // Tránh trùng label+startTime
          if (
            prev.some(
              (p) =>
                p.label.trim() === t.label.trim() &&
                p.startTime === t.startTime &&
                p.endTime === t.endTime,
            )
          ) {
            return prev;
          }
          return [
            ...prev,
            {
              label: t.label,
              role: t.role,
              startTime: t.startTime,
              endTime: t.endTime,
              slotsNeeded: t.slotsNeeded,
            },
          ];
        });
      } else if (kind === 'schedule') {
        const t = payload as ScheduleTemplate;
        setSchedule((prev) => {
          if (prev.some((p) => p.label.trim() === t.label.trim() && p.time === t.time)) {
            return prev;
          }
          return [...prev, { time: t.time, label: t.label }];
        });
      } else if (kind === 'supply') {
        const t = payload as SupplyTemplate;
        setSupplies((prev) => {
          if (prev.some((p) => p.name.trim() === t.name.trim())) return prev;
          return [
            ...prev,
            { name: t.name, quantity: t.quantity, unit: t.unit },
          ];
        });
      } else if (kind === 'menu') {
        const t = payload as MenuTemplate;
        setMenu((prev) => {
          // Tránh trùng tên món (case-insensitive)
          if (prev.some((m) => m.name.trim().toLowerCase() === t.name.trim().toLowerCase())) {
            return prev;
          }
          // Thêm món xong thì chia lại tổng suất cho toàn bộ thực đơn — món mới không
          // giữ con số ước tính lúc còn nằm trong danh sách gợi ý.
          return balanceMenuServings(
            [...prev, { name: t.name, type: t.type }],
            servingsRef.current,
          );
        });
      }
    }
    // Gỡ mẫu đã chèn — so khớp theo NỘI DUNG (label + giờ) đúng như lúc chèn
    // dedupe, vì mẫu không lưu id vào state của form.
    function onRemove(e: Event) {
      const ce = e as CustomEvent<{ kind: string; payload: unknown }>;
      const { kind, payload } = ce.detail;
      if (kind === 'shift') {
        const t = payload as ShiftTemplate;
        setShifts((prev) =>
          prev.filter(
            (p) =>
              !(
                p.label.trim() === t.label.trim() &&
                p.startTime === t.startTime &&
                p.endTime === t.endTime
              ),
          ),
        );
      } else if (kind === 'schedule') {
        const t = payload as ScheduleTemplate;
        setSchedule((prev) =>
          prev.filter((p) => !(p.label.trim() === t.label.trim() && p.time === t.time)),
        );
      } else if (kind === 'supply') {
        const t = payload as SupplyTemplate;
        setSupplies((prev) => prev.filter((p) => p.name.trim() !== t.name.trim()));
      } else if (kind === 'menu') {
        const t = payload as MenuTemplate;
        setMenu((prev) => prev.filter((p) => p.name.trim() !== t.name.trim()));
      }
    }

    window.addEventListener('cm:insert-template', onInsert as EventListener);
    window.addEventListener('cm:remove-template', onRemove as EventListener);
    return () => {
      window.removeEventListener('cm:insert-template', onInsert as EventListener);
      window.removeEventListener('cm:remove-template', onRemove as EventListener);
    };
  }, []);

  // Bắn event để dropdown reset sau khi form đóng thành công.
  function emitFormReset() {
    window.dispatchEvent(new Event('cm:form-reset'));
  }

  // Tổng hợp số thành viên theo vai trò từ các ca đã thêm — hiển thị
  // ngay dưới dropdown gợi ý để user thấy ngay tổng khi chèn từng mẫu.
  const shiftsSummary = useMemo(() => {
    const total = shifts.reduce((sum, s) => sum + (s.slotsNeeded || 0), 0);
    const byRole = { chef: 0, waiter: 0, shipper: 0, any: 0 };
    shifts.forEach((s) => {
      const role = s.role ?? 'any';
      byRole[role] += s.slotsNeeded || 0;
    });
    const valid = shifts.filter((s) => s.label.trim()).length;
    return { total, byRole, valid };
  }, [shifts]);

  // Field-level errors (key = field path, value = Vietnamese message)
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Đang chọn chiến dịch nhiều ngày (có endDate và sau ngày bắt đầu). */
  const isMultiDayPick = !!f.endDate && !!f.scheduledDate && f.endDate > f.scheduledDate;
  // setState là bất đồng bộ nên ngay sau validateAll() thì `errors` vẫn là giá trị cũ.
  // Giữ thêm bản mới nhất ở ref để điều hướng bước đọc được đúng lỗi vừa tính.
  const lastErrorsRef = useRef<Record<string, string>>({});
  const setErr = (k: string, v: string | undefined) =>
    setErrors((prev) => {
      const next = { ...prev };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });

  // ─── Validation rules (tiếng Việt) ────────────────────────────────────────
  function validateAll(): boolean {
    const next: Record<string, string> = {};
    // Title
    if (!f.title.trim()) next.title = 'Vui lòng nhập tiêu đề';
    else if (f.title.trim().length < 5) next.title = 'Tiêu đề tối thiểu 5 ký tự';
    else if (f.title.trim().length > 255) next.title = 'Tiêu đề tối đa 255 ký tự';
    // Description (optional nhưng giới hạn)
    if (f.description && f.description.length > 5000) next.description = 'Mô tả tối đa 5000 ký tự';
    // Address
    if (!f.kitchenAddress.trim()) next.kitchenAddress = 'Vui lòng nhập địa chỉ bếp';
    else if (f.kitchenAddress.trim().length < 5) next.kitchenAddress = 'Địa chỉ tối thiểu 5 ký tự';
    // Date
    if (!f.scheduledDate) next.scheduledDate = 'Chọn ngày tổ chức';
    else {
      // So sánh chuỗi YYYY-MM-DD với nhau: cùng định dạng nên so trực tiếp là đúng,
      // và tránh hoàn toàn chuyện `new Date('2026-08-12')` bị hiểu là nửa đêm UTC
      // rồi lệch một ngày so với "hôm nay" theo giờ VN.
      if (f.scheduledDate < vnToday()) next.scheduledDate = 'Ngày tổ chức phải từ hôm nay trở đi';
    }
    // EndDate (optional) — phải >= scheduledDate và >= hôm nay
    if (f.endDate) {
      if (f.endDate < vnToday()) next.endDate = 'Ngày kết thúc không được trong quá khứ';
      else if (f.scheduledDate && f.endDate < f.scheduledDate)
        next.endDate = 'Ngày kết thúc phải từ ngày bắt đầu trở đi';
      // Chiến dịch DÀI NGÀY phải báo trước: cần tuyển đủ TNV cho từng buổi và đặt
      // nguyên liệu theo ngày. Chiến dịch trong ngày không bị ràng buộc này.
      else if (leadDays > 0 && f.scheduledDate && f.endDate > f.scheduledDate
               && f.scheduledDate < multiDayMinDate) {
        next.scheduledDate =
          `Chiến dịch nhiều ngày phải tạo trước ít nhất ${leadDays} ngày — sớm nhất là ${formatVnDate(multiDayMinDate)}`;
      }
    }
    // Time
    if (!f.startTime) next.startTime = 'Chọn giờ bắt đầu';
    if (!f.endTime) next.endTime = 'Chọn giờ kết thúc';
    if (f.startTime && f.endTime && f.endTime <= f.startTime) {
      next.endTime = 'Giờ kết thúc phải sau giờ bắt đầu';
    }
    // Expected servings
    if (!f.expectedServings || f.expectedServings < 1) {
      next.expectedServings = 'Số suất ăn dự kiến tối thiểu 1';
    } else if (f.expectedServings > 100000) {
      next.expectedServings = 'Số suất ăn dự kiến tối đa 100.000';
    }
    // Slots — DTO cho phép 0..50
    (['chefSlotsNeeded', 'waiterSlotsNeeded', 'shipperSlotsNeeded'] as const).forEach((k) => {
      const v = f[k];
      if (v < 0) next[k] = 'Không được âm';
      else if (v > 50) next[k] = 'Tối đa 50 người';
    });
    // Menu
    menu.forEach((m, i) => {
      if (m.name.trim() && m.name.trim().length > 100)
        next[`menu.${i}.name`] = 'Tên món tối đa 100 ký tự';
      if (m.plannedServings !== undefined && m.plannedServings < 0)
        next[`menu.${i}.plannedServings`] = 'Không được âm';
      if (m.plannedServings !== undefined && m.plannedServings > 10000)
        next[`menu.${i}.plannedServings`] = 'Tối đa 10.000 suất';
    });
    // Schedule
    schedule.forEach((s, i) => {
      if (s.label.trim() && !s.time) next[`schedule.${i}.time`] = 'Chọn giờ';
      if (s.label.trim().length > 160) next[`schedule.${i}.label`] = 'Tối đa 160 ký tự';
    });
    // Supplies
    supplies.forEach((s, i) => {
      if (s.name.trim().length > 80) next[`supplies.${i}.name`] = 'Tối đa 80 ký tự';
      if (s.quantity !== undefined && s.quantity < 0)
        next[`supplies.${i}.quantity`] = 'Không được âm';
      if (s.unit && s.unit.length > 20) next[`supplies.${i}.unit`] = 'Tối đa 20 ký tự';
    });
    // Shifts
    shifts.forEach((s, i) => {
      if (s.label.trim()) {
        if (s.label.trim().length < 2) next[`shifts.${i}.label`] = 'Tối thiểu 2 ký tự';
        if (s.label.trim().length > 100) next[`shifts.${i}.label`] = 'Tối đa 100 ký tự';
        if (!s.startTime) next[`shifts.${i}.startTime`] = 'Chọn giờ bắt đầu';
        if (!s.endTime) next[`shifts.${i}.endTime`] = 'Chọn giờ kết thúc';
        if (s.startTime && s.endTime && s.endTime <= s.startTime)
          next[`shifts.${i}.endTime`] = 'Giờ kết thúc phải sau giờ bắt đầu';
        if (s.slotsNeeded < 0) next[`shifts.${i}.slotsNeeded`] = 'Không được âm';
        if (s.slotsNeeded > 100) next[`shifts.${i}.slotsNeeded`] = 'Tối đa 100 người';
      }
    });
    setErrors(next);
    lastErrorsRef.current = next;
    return Object.keys(next).length === 0;
  }

  function inputCls(key: string, base: string) {
    return `${base} ${errors[key] ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`;
  }

  /**
   * Chỉ chặn "Tiếp tục" khi lỗi thuộc CHÍNH bước đang mở — nếu chặn theo toàn form
   * thì bước 1 không qua nổi chỉ vì bước 3 chưa điền.
   */
  function goToStep(target: 1 | 2 | 3) {
    if (target <= step) {
      setStep(target);
      return;
    }
    validateAll();
    const blocking = Object.keys(lastErrorsRef.current).filter((k) => stepOfField(k) === step);
    if (blocking.length > 0) {
      toast.error(lastErrorsRef.current[blocking[0]] ?? 'Vui lòng kiểm tra lại các trường');
      focusFirstError();
      return;
    }
    setStep(target);
  }

  function focusFirstError() {
    requestAnimationFrame(() => {
      const el = document.querySelector('[data-field-error]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Chốt chặn cuối: chỉ bước 3 mới được gửi. Enter trong ô input cũng kích hoạt
    // submit ngầm của trình duyệt, không riêng gì nút bấm.
    if (step < 3) {
      goToStep((step + 1) as 2 | 3);
      return;
    }
    if (!validateAll()) {
      // Nhảy tới bước chứa lỗi đầu tiên — nếu chỉ báo toast mà giữ nguyên bước
      // thì người dùng không thấy trường nào sai.
      const keys = Object.keys(lastErrorsRef.current);
      const firstKey = keys[0];
      const targetStep = stepOfField(firstKey);
      if (targetStep !== step) setStep(targetStep);
      toast.error(lastErrorsRef.current[firstKey] ?? 'Vui lòng kiểm tra lại các trường');
      focusFirstError();
      return;
    }
    try {
      await onSubmit({
        ...f,
        // Chỉ gửi endDate khi user đã chọn (bỏ trống = mặc định 1 ngày ở BE)
        endDate: f.endDate ? f.endDate : undefined,
        imageUrls: imageUrl ? [imageUrl] : undefined,
        menuItems: menu
          .filter((m) => m.name.trim() && m.type)
          .map((m) => ({
            name: m.name.trim(),
            type: m.type.trim(),
            plannedServings: m.plannedServings,
          })),
        scheduleItems: schedule.filter((s) => s.label.trim()).map((s) => ({
          time: s.time.trim(),
          label: s.label.trim(),
        })),
        supplyItems: supplies
          .filter((s) => s.name.trim())
          .map((s) => ({
            name: s.name.trim(),
            quantity: s.quantity,
            unit: s.unit?.trim() || undefined,
          })),
        shifts: shifts
          .filter((s) => s.label.trim())
          .map((s) => ({
            label: s.label.trim(),
            role: s.role,
            startTime: s.startTime,
            endTime: s.endTime,
            slotsNeeded: s.slotsNeeded,
          })),
      });
      toast.success('Đã gửi yêu cầu. Chiến dịch sẽ hiển thị sau khi quản trị viên duyệt.');
      // Gửi thành công thì nháp hết vai trò — giữ lại sẽ khôi phục nhầm ở lần tạo sau.
      draft.clear();
      emitFormReset();
      onClose();
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { error?: { message?: string | string[]; details?: unknown } } };
      };
      // class-validator thường trả về message là MẢNG chuỗi (1 entry / field lỗi).
      // Ghép lại để user thấy toàn bộ field bị reject trong 1 toast.
      const raw = err?.response?.data?.error?.message;
      const details = err?.response?.data?.error?.details;
      const msg = Array.isArray(raw) ? raw.join(' · ') : raw ?? 'Tạo thất bại';
      // Log chi tiết ra console để dev debug nhanh (BE trả message + field path)
      console.error('[CreateCampaign] POST /campaigns failed:', { msg, details, raw });
      toast.error(msg);
    }
  }

  function bumpSlot(key: 'chefSlotsNeeded' | 'waiterSlotsNeeded' | 'shipperSlotsNeeded', delta: number) {
    setF((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(99, prev[key] + delta)),
    }));
  }

  const previewTitle = f.title.trim() || 'Tên chiến dịch của bạn';

  return (
    <div className="cm-create-overlay" role="dialog" aria-modal="true" aria-labelledby="cm-modal-title">
      {/* Backdrop click để đóng */}
      <button
        type="button"
        onClick={onClose}
        className="cm-create-overlay-backdrop"
        aria-label="Đóng popup"
        tabIndex={-1}
      />

      <div className="cm-create-page">
      {/* ─── Header gọn: tiêu đề + nút đóng (không che form) ─── */}
      <header className="cm-create-header">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#6EE7B7]">
            Workspace quản lý · Yêu cầu mới · chờ admin duyệt
          </p>
          <h1
            id="cm-modal-title"
            className="cm-create-header-title"
          >
            Tạo chiến dịch mới
          </h1>
          <p className="cm-create-header-sub">
            Điền đầy đủ thông tin bên dưới — yêu cầu sẽ được quản trị viên duyệt trước khi hiển thị công khai.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="cm-create-header-close"
          aria-label="Đóng"
        >
          Quay lại
        </button>
      </header>

      <form onSubmit={submit} className="cm-create-card">
        {/* Nháp khôi phục từ lần điền trước — nói rõ để người dùng không tưởng
            form tự điền bậy, và cho đường thoát về form trắng. */}
        {draft.hasRestored && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <span className="material-symbols-outlined text-[18px] text-amber-600">history</span>
            <p className="min-w-0 flex-1 text-xs font-semibold text-amber-900">
              Đã khôi phục bản nháp bạn điền dở
              {draft.restored?.savedAt
                ? ` lúc ${new Date(draft.restored.savedAt).toLocaleString('vi-VN')}`
                : ''}
              .
            </p>
            <button
              type="button"
              onClick={draft.dismissBanner}
              className="rounded-lg px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
            >
              Đã hiểu
            </button>
            <button
              type="button"
              onClick={() => {
                draft.clear();
                emitFormReset();
                setF({
                  title: '',
                  description: '',
                  kitchenAddress: '',
                  scheduledDate: tomorrowDateString(),
                  endDate: '',
                  startTime: '08:00',
                  endTime: '12:00',
                  chefSlotsNeeded: 2,
                  waiterSlotsNeeded: 3,
                  shipperSlotsNeeded: 2,
                  expectedServings: 100,
                  lng: 106.6297,
                  lat: 10.8231,
                });
                setMenu([]);
                setSchedule([]);
                setSupplies([]);
                setShifts([]);
                setImageUrl(null);
                setStep(1);
                toast.success('Đã xoá bản nháp.');
              }}
              className="rounded-lg border border-amber-300 px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
            >
              Xoá nháp
            </button>
          </div>
        )}

        {/* Cover giờ là banner info ngắn trên cùng form (không che, không che body) */}
        <div className="cm-create-banner">
          <div className="cm-create-banner-icon">
            <span className="material-symbols-outlined">campaign</span>
          </div>
          <div className="min-w-0">
            <p className="cm-create-banner-title">
              {previewTitle}
            </p>
            <p className="cm-create-banner-sub">
              {f.scheduledDate
                ? `${formatVnDate(f.scheduledDate, {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}${f.endDate ? ` → ${formatVnDate(f.endDate)}` : ''} · ${f.startTime}–${f.endTime}`
                : `Chưa chọn ngày · ${f.startTime}–${f.endTime}`}
              {f.kitchenAddress && ` · ${f.kitchenAddress}`}
            </p>
          </div>
        </div>

        {/* ─── Body: 2 columns ─── */}
        {/* Thanh bước — bấm được để quay lại bước đã qua, tiến tới thì phải qua validate */}
        <nav className="cm-stepper" aria-label="Các bước tạo chiến dịch">
          {FORM_STEPS.map((s, i) => {
            const isActive = step === s.num;
            const isDone = step > s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => goToStep(s.num)}
                aria-current={isActive ? 'step' : undefined}
                className={`cm-stepper-item ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
              >
                <span className="cm-stepper-dot">
                  <span className="material-symbols-outlined text-[16px]">
                    {isDone ? 'check' : s.icon}
                  </span>
                </span>
                <span className="cm-stepper-text">
                  <span className="cm-stepper-index">Bước {s.num}</span>
                  <span className="cm-stepper-label">{s.label}</span>
                </span>
                {i < FORM_STEPS.length - 1 && <span className="cm-stepper-line" />}
              </button>
            );
          })}
        </nav>

        <div className="cm-modal-body">
          <div className="cm-modal-steps">
            {step === 1 && (
              <>
                <div className="cm-form-block">
                  <span className="cm-form-block-label">
                    <span className="material-symbols-outlined">info</span>Thông tin cơ bản
                  </span>
                  <input
                    value={f.title}
                    onChange={(e) => {
                      setF({ ...f, title: e.target.value });
                      if (errors.title) setErr('title', undefined);
                    }}
                    onBlur={() => {
                      if (!f.title.trim()) setErr('title', 'Vui lòng nhập tiêu đề');
                      else if (f.title.trim().length < 5) setErr('title', 'Tiêu đề tối thiểu 5 ký tự');
                      else setErr('title', undefined);
                    }}
                    placeholder="Tiêu đề chiến dịch *"
                    className={inputCls('title', 'cm-input')}
                    aria-invalid={!!errors.title}
                    data-field-error={errors.title ? 'title' : undefined}
                    maxLength={255}
                  />
                  <FieldError message={errors.title} />
                  <textarea
                    value={f.description}
                    onChange={(e) => {
                      setF({ ...f, description: e.target.value });
                      if (errors.description) setErr('description', undefined);
                    }}
                    placeholder="Mô tả ngắn — bạn sẽ phục vụ ai, ở đâu, vì sao quan trọng?"
                    rows={3}
                    maxLength={5000}
                    className={inputCls('description', 'cm-input')}
                    aria-invalid={!!errors.description}
                  />
                  <FieldError message={errors.description} />
                </div>
                <div id="cm-image-block" className="cm-form-block">
                  <span className="cm-form-block-label">
                    <span className="material-symbols-outlined">image</span>Ảnh bìa chiến dịch
                  </span>
                  <ImageUploader value={imageUrl} onChange={setImageUrl} uploading={upload.isPending} />
                </div>
                <div className="cm-form-block">
                  <span className="cm-form-block-label">
                    <span className="material-symbols-outlined">place</span>Địa điểm
                  </span>
                  <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={applyProfileAddress}
                      disabled={!hasProfileAddress}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                        addressMode === 'profile'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide">
                        <span className="material-symbols-outlined text-[17px]">home_pin</span>
                        Dùng địa chỉ mặc định
                      </span>
                      <span className="mt-1 block text-xs text-neutral-500 line-clamp-2">
                        {hasProfileAddress ? profileAddress : 'Chưa có địa chỉ trong hồ sơ'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={switchToCustomAddress}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                        addressMode === 'custom'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide">
                        <span className="material-symbols-outlined text-[17px]">travel_explore</span>
                        Chọn địa chỉ khác
                      </span>
                      <span className="mt-1 block text-xs text-neutral-500">
                        Nhập để search hoặc kéo ghim trên bản đồ.
                      </span>
                    </button>
                  </div>
                  <input
                    value={f.kitchenAddress}
                    onChange={(e) => {
                      const nextAddress = e.target.value;
                      setGeocodeError(false);
                      setAddressMode('custom');
                      setF({ ...f, kitchenAddress: nextAddress });
                      queueAddressSearch(nextAddress);
                      if (errors.kitchenAddress) setErr('kitchenAddress', undefined);
                    }}
                    onBlur={() => {
                      if (!f.kitchenAddress.trim()) setErr('kitchenAddress', 'Vui lòng nhập địa chỉ bếp');
                      else if (f.kitchenAddress.trim().length < 5)
                        setErr('kitchenAddress', 'Địa chỉ tối thiểu 5 ký tự');
                      else setErr('kitchenAddress', undefined);
                    }}
                    placeholder="Địa chỉ bếp *"
                    className={inputCls('kitchenAddress', 'cm-input')}
                    aria-invalid={!!errors.kitchenAddress}
                    data-field-error={errors.kitchenAddress ? 'kitchenAddress' : undefined}
                    maxLength={500}
                  />
                  {addressSearching ? (
                    <p className="mt-1 text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">progress_activity</span>
                      Đang tìm địa chỉ…
                    </p>
                  ) : null}
                  {addressNoResults ? (
                    <p className="mt-1 text-[11px] text-neutral-500">Không tìm thấy địa chỉ phù hợp.</p>
                  ) : null}
                  {addressSuggestions.length > 0 ? (
                    <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
                      {addressSuggestions.map((item, idx) => (
                        <button
                          key={`${item.lat},${item.lng},${idx}`}
                          type="button"
                          onClick={() => selectAddressSuggestion(item)}
                          className="flex w-full items-start gap-2 border-b border-neutral-100 px-3 py-2 text-left text-xs text-neutral-700 last:border-b-0 hover:bg-emerald-50"
                        >
                          <span className="material-symbols-outlined mt-0.5 text-[16px] text-emerald-700">place</span>
                          <span className="line-clamp-2">{item.displayName}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <FieldError message={errors.kitchenAddress} />
                  <div className="cm-modal-map">
                    <LocationPicker lng={f.lng} lat={f.lat} onPick={onMapPick} />
                  </div>
                  <p
                    className={`cm-modal-meta ${
                      geocodeError ? '!text-[#B45309]' : ''
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {geocoding ? 'progress_activity' : geocodeError ? 'warning' : 'my_location'}
                    </span>
                    {geocoding
                      ? 'Đang lấy địa chỉ từ bản đồ…'
                      : geocodeError
                        ? 'Không lấy được địa chỉ — bạn có thể tự nhập tay phía trên.'
                        : `Toạ độ: ${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}`}
                  </p>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="cm-form-block">
                  <span className="cm-form-block-label">
                    <span className="material-symbols-outlined">event</span>Thời gian & nhân lực
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="date"
                      value={f.scheduledDate}
                      min={vnToday()}
                      onChange={(e) => {
                        setF({ ...f, scheduledDate: e.target.value });
                        if (errors.scheduledDate) setErr('scheduledDate', undefined);
                        // Nếu endDate trước scheduledDate mới → clear endDate
                        if (f.endDate && f.endDate < e.target.value) {
                          setF((prev) => ({ ...prev, scheduledDate: e.target.value, endDate: '' }));
                        }
                      }}
                      className={inputCls('scheduledDate', 'cm-input')}
                      aria-invalid={!!errors.scheduledDate}
                      data-field-error={errors.scheduledDate ? 'scheduledDate' : undefined}
                    />
                    <input
                      type="time"
                      value={f.startTime}
                      onChange={(e) => {
                        setF({ ...f, startTime: e.target.value });
                        if (errors.startTime) setErr('startTime', undefined);
                      }}
                      className={inputCls('startTime', 'cm-input')}
                      aria-invalid={!!errors.startTime}
                    />
                    <input
                      type="time"
                      value={f.endTime}
                      onChange={(e) => {
                        setF({ ...f, endTime: e.target.value });
                        if (errors.endTime) setErr('endTime', undefined);
                      }}
                      className={inputCls('endTime', 'cm-input')}
                      aria-invalid={!!errors.endTime}
                      data-field-error={errors.endTime ? 'endTime' : undefined}
                    />
                  </div>
                  <FieldError message={errors.scheduledDate} />
                  <FieldError message={errors.startTime} />
                  <FieldError message={errors.endTime} />
                  {/* Ngày kết thúc (optional) — bỏ trống = 1 ngày duy nhất */}
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide shrink-0">
                      Ngày kết thúc
                    </label>
                    <input
                      type="date"
                      value={f.endDate}
                      min={f.scheduledDate || vnToday()}
                      placeholder="Bỏ trống nếu 1 ngày"
                      title="Bỏ trống = chiến dịch gói gọn trong 1 ngày, mở lúc nào cũng được"
                      onChange={(e) => {
                        setF({ ...f, endDate: e.target.value });
                        if (errors.endDate) setErr('endDate', undefined);
                      }}
                      className={`cm-input flex-1 ${errors.endDate ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
                      aria-invalid={!!errors.endDate}
                      data-field-error={errors.endDate ? 'endDate' : undefined}
                    />
                    {f.endDate && (
                      <button
                        type="button"
                        onClick={() => {
                          setF({ ...f, endDate: '' });
                          setErr('endDate', undefined);
                        }}
                        className="text-[11px] text-neutral-500 hover:text-rose-600 underline shrink-0"
                        title="Bỏ chọn ngày kết thúc"
                      >
                        Xoá
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    {f.endDate
                      ? `Chiến dịch kéo dài từ ${formatVnDate(f.scheduledDate)} đến ${formatVnDate(f.endDate)}.`
                      : 'Bỏ trống nếu chiến dịch chỉ diễn ra 1 ngày.'}
                  </p>
                  <FieldError message={errors.endDate} />
                  {/* Nói rõ luật TRƯỚC khi người dùng điền xong: chiến dịch nhiều ngày
                      cần thời gian tuyển TNV cho từng buổi nên phải báo trước. */}
                  {leadDays > 0 && (
                    <p
                      className={`mt-1 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                        isMultiDayPick && f.scheduledDate < multiDayMinDate
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-neutral-50 text-neutral-500'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {isMultiDayPick && f.scheduledDate < multiDayMinDate ? 'error' : 'info'}
                      </span>
                      <span>
                        Chiến dịch <b>nhiều ngày</b> phải tạo trước ít nhất {leadDays} ngày — sớm nhất
                        là <b>{formatVnDate(multiDayMinDate)}</b>. Chiến dịch <b>trong ngày</b> mở lúc
                        nào cũng được.
                      </span>
                    </p>
                  )}
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={f.expectedServings}
                    onChange={(e) => {
                      setF({ ...f, expectedServings: Number(e.target.value) });
                      if (errors.expectedServings) setErr('expectedServings', undefined);
                    }}
                    onBlur={() => {
                      if (!f.expectedServings || f.expectedServings < 1)
                        setErr('expectedServings', 'Số suất ăn dự kiến tối thiểu 1');
                      else if (f.expectedServings > 100000)
                        setErr('expectedServings', 'Số suất ăn tối đa 100.000');
                      else setErr('expectedServings', undefined);
                    }}
                    placeholder="Số suất ăn dự kiến *"
                    className={inputCls('expectedServings', 'cm-input')}
                    aria-invalid={!!errors.expectedServings}
                  />
                  <FieldError message={errors.expectedServings} />
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <SlotStepper
                      tone="chef"
                      label="Đầu bếp"
                      icon="skillet"
                      value={f.chefSlotsNeeded}
                      onChange={(v) => {
                        bumpSlot('chefSlotsNeeded', v - f.chefSlotsNeeded);
                        setErr('chefSlotsNeeded', undefined);
                      }}
                      error={errors.chefSlotsNeeded}
                    />
                    <SlotStepper
                      tone="waiter"
                      label="Phục vụ"
                      icon="room_service"
                      value={f.waiterSlotsNeeded}
                      onChange={(v) => {
                        bumpSlot('waiterSlotsNeeded', v - f.waiterSlotsNeeded);
                        setErr('waiterSlotsNeeded', undefined);
                      }}
                      error={errors.waiterSlotsNeeded}
                    />
                    <SlotStepper
                      tone="shipper"
                      label="Giao hàng"
                      icon="local_shipping"
                      value={f.shipperSlotsNeeded}
                      onChange={(v) => {
                        bumpSlot('shipperSlotsNeeded', v - f.shipperSlotsNeeded);
                        setErr('shipperSlotsNeeded', undefined);
                      }}
                      error={errors.shipperSlotsNeeded}
                    />
                  </div>
                  <SlotsSummary
                    chef={f.chefSlotsNeeded}
                    waiter={f.waiterSlotsNeeded}
                    shipper={f.shipperSlotsNeeded}
                    expectedServings={f.expectedServings}
                    shifts={shifts}
                    onApplySuggestion={(v) =>
                      setF((prev) => ({
                        ...prev,
                        chefSlotsNeeded: v.chef,
                        waiterSlotsNeeded: v.waiter,
                        shipperSlotsNeeded: v.shipper,
                      }))
                    }
                  />
                </div>
                <div className="cm-form-block">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="cm-form-block-label !mb-0">
                      <span className="material-symbols-outlined">schedule</span>Ca trực cho tình nguyện viên
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 -mt-1 mb-2">
                    Tạo sẵn các ca để tình nguyện viên đăng ký ngay khi chiến dịch được duyệt.
                  </p>
                  <div className="mb-3">
                    <ShiftSuggestions expectedServings={f.expectedServings} />
                  </div>
                  {shifts.length > 0 && (
                    <ShiftsSummary
                      total={shiftsSummary.total}
                      byRole={shiftsSummary.byRole}
                      valid={shiftsSummary.valid}
                      expectedServings={f.expectedServings}
                    />
                  )}
                  <div className="cm-repeat">
                    {shifts.map((s, i) => (
                      <div key={i} className="space-y-1">
                        <div
                          className={`cm-repeat-row cm-repeat-row--shift ${
                            errors[`shifts.${i}.label`] ||
                            errors[`shifts.${i}.startTime`] ||
                            errors[`shifts.${i}.endTime`] ||
                            errors[`shifts.${i}.slotsNeeded`]
                              ? '!ring-1 !ring-rose-300'
                              : ''
                          }`}
                        >
                          <input
                            value={s.label}
                            onChange={(e) =>
                              setShifts(shifts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                            }
                            onBlur={() => {
                              if (s.label.trim() && s.label.trim().length < 2)
                                setErr(`shifts.${i}.label`, 'Tối thiểu 2 ký tự');
                              else setErr(`shifts.${i}.label`, undefined);
                            }}
                            placeholder="Tên ca (vd: Ca sáng — Sơ chế & nấu)"
                            className="cm-input cm-shift-label"
                            maxLength={100}
                          />
                          <div className="cm-shift-role">
                            <select
                              value={s.role ?? ''}
                              onChange={(e) =>
                                setShifts(
                                  shifts.map((x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          role: e.target.value === '' ? undefined : (e.target.value as 'chef' | 'waiter' | 'shipper'),
                                        }
                                      : x,
                                  ),
                                )
                              }
                              aria-label="Vai trò ca"
                            >
                              <option value="">Mọi vai trò</option>
                              <option value="chef">Đầu bếp</option>
                              <option value="waiter">Phục vụ</option>
                              <option value="shipper">Giao hàng</option>
                            </select>
                          </div>
                          <div className="cm-shift-slots">
                            <MiniStepper
                              value={s.slotsNeeded}
                              onChange={(v) => {
                                setShifts(shifts.map((x, j) => (j === i ? { ...x, slotsNeeded: v } : x)));
                                setErr(`shifts.${i}.slotsNeeded`, undefined);
                              }}
                              title="Số người cần cho ca"
                            />
                          </div>
                          <div className="cm-shift-times">
                            <input
                              type="time"
                              value={s.startTime}
                              onChange={(e) => {
                                setShifts(shifts.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)));
                                setErr(`shifts.${i}.startTime`, undefined);
                              }}
                              className={`cm-input ${errors[`shifts.${i}.startTime`] ? '!border-rose-500' : ''}`}
                              aria-label="Giờ bắt đầu"
                            />
                            <span className="cm-shift-sep">→</span>
                            <input
                              type="time"
                              value={s.endTime}
                              onChange={(e) => {
                                setShifts(shifts.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)));
                                setErr(`shifts.${i}.endTime`, undefined);
                              }}
                              className={`cm-input ${errors[`shifts.${i}.endTime`] ? '!border-rose-500' : ''}`}
                              aria-label="Giờ kết thúc"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setShifts(shifts.filter((_, j) => j !== i))}
                            className="cm-repeat-remove"
                            aria-label="Xoá ca"
                          >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                          </button>
                        </div>
                        {(errors[`shifts.${i}.label`] || errors[`shifts.${i}.startTime`] || errors[`shifts.${i}.endTime`] || errors[`shifts.${i}.slotsNeeded`]) && (
                          <p className="text-[11px] text-rose-600 font-semibold pl-1">
                            {errors[`shifts.${i}.label`] ??
                              errors[`shifts.${i}.startTime`] ??
                              errors[`shifts.${i}.endTime`] ??
                              errors[`shifts.${i}.slotsNeeded`]}
                          </p>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setShifts([
                          ...shifts,
                          { label: '', role: undefined, startTime: '08:00', endTime: '12:00', slotsNeeded: 2 },
                        ])
                      }
                      className="cm-repeat-add"
                    >
                      <span className="material-symbols-outlined text-[15px]">add</span> Thêm ca trực
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="cm-form-block">
                  <span className="cm-form-block-label">
                    <span className="material-symbols-outlined">restaurant_menu</span>Thực đơn trong ngày
                  </span>
                  <p className="text-[11px] text-neutral-500 -mt-1 mb-2">
                    Gợi ý sẽ tự lọc món phù hợp với vật phẩm đã nhập bên dưới.
                  </p>
                  <div className="mb-3">
                    <MenuSuggestions
                      supplies={supplies}
                      expectedServings={f.expectedServings}
                      currentMenuCount={menu.length}
                    />
                  </div>
                  <div className="cm-repeat">
                    {menu.map((m, i) => (
                      <div key={i} className="cm-repeat-row cm-repeat-row--menu">
                        <input
                          value={m.name}
                          onChange={(e) =>
                            setMenu(
                              menu.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            )
                          }
                          placeholder="Tên món (vd: Cơm thịt kho)"
                          className="cm-input"
                        />
                        <select
                          value={m.type}
                          onChange={(e) =>
                            setMenu(
                              menu.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)),
                            )
                          }
                          className="cm-input"
                          aria-label="Bữa ăn"
                        >
                          <option value="">— Bữa —</option>
                          <option value="breakfast">Bữa sáng</option>
                          <option value="lunch">Bữa trưa</option>
                          <option value="dinner">Bữa tối</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          value={m.plannedServings ?? ''}
                          onChange={(e) =>
                            // Gõ tay = khoá món này lại, các món còn lại tự chia phần dư.
                            setMenu(
                              balanceMenuServings(
                                menu.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        plannedServings:
                                          e.target.value === '' ? undefined : Number(e.target.value),
                                        servingsLocked: e.target.value !== '',
                                      }
                                    : x,
                                ),
                                f.expectedServings,
                              ),
                            )
                          }
                          placeholder="Suất dự kiến"
                          className="cm-input"
                          title="Số suất dự kiến cho món này — sửa tay thì các món khác tự chia lại phần còn lại"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setMenu(
                              balanceMenuServings(
                                menu.filter((_, j) => j !== i),
                                f.expectedServings,
                              ),
                            )
                          }
                          className="cm-repeat-remove"
                          aria-label="Xoá món"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setMenu(
                          balanceMenuServings(
                            [...menu, { name: '', type: 'lunch' }],
                            f.expectedServings,
                          ),
                        )
                      }
                      className="cm-repeat-add"
                    >
                      <span className="material-symbols-outlined text-[15px]">add</span> Thêm món
                    </button>

                    {menu.length > 0 && (
                      <p
                        className={`mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                          menuServingsTotal === f.expectedServings
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {menuServingsTotal === f.expectedServings ? 'check_circle' : 'info'}
                        </span>
                        Tổng suất theo món: {menuServingsTotal}/{f.expectedServings}
                        {menuServingsTotal !== f.expectedServings &&
                          ` (lệch ${Math.abs(menuServingsTotal - f.expectedServings)} suất)`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="cm-form-block">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="cm-form-block-label !mb-0">
                      <span className="material-symbols-outlined">schedule</span>Lịch trình hoạt động
                    </span>
                  </div>
                  <div className="mb-3">
                    <ScheduleSuggestions expectedServings={f.expectedServings} />
                  </div>
                  <div className="cm-repeat">
                    {schedule.map((s, i) => (
                      <div key={i} className="cm-repeat-row cm-repeat-row--schedule">
                        <input
                          type="time"
                          value={s.time}
                          onChange={(e) =>
                            setSchedule(
                              schedule.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)),
                            )
                          }
                          className="cm-input"
                        />
                        <input
                          value={s.label}
                          onChange={(e) =>
                            setSchedule(
                              schedule.map((x, j) =>
                                j === i ? { ...x, label: e.target.value } : x,
                              ),
                            )
                          }
                          placeholder="Mô tả công việc (vd: Chuẩn bị nguyên liệu)"
                          className="cm-input"
                        />
                        <button
                          type="button"
                          onClick={() => setSchedule(schedule.filter((_, j) => j !== i))}
                          className="cm-repeat-remove"
                          aria-label="Xoá mốc"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSchedule([...schedule, { time: '', label: '' }])}
                      className="cm-repeat-add"
                    >
                      <span className="material-symbols-outlined text-[15px]">add</span> Thêm mốc
                    </button>
                  </div>
                </div>
                <div className="cm-form-block">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="cm-form-block-label !mb-0">
                      <span className="material-symbols-outlined">inventory_2</span>Vật phẩm cần thiết
                    </span>
                  </div>
                  <div className="mb-3">
                    <SupplySuggestions expectedServings={f.expectedServings} />
                  </div>
                  <div className="cm-repeat">
                    {supplies.map((s, i) => (
                      <div key={i} className="cm-repeat-row cm-repeat-row--supplies">
                        <input
                          value={s.name}
                          onChange={(e) =>
                            setSupplies(
                              supplies.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            )
                          }
                          placeholder="vd: Gạo sạch, Thùng giữ nhiệt…"
                          className="cm-input"
                        />
                        <input
                          type="number"
                          min={0}
                          value={s.quantity ?? ''}
                          onChange={(e) =>
                            setSupplies(
                              supplies.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      quantity: e.target.value === '' ? undefined : Number(e.target.value),
                                    }
                                  : x,
                              ),
                            )
                          }
                          placeholder="SL"
                          className="cm-input"
                          title="Số lượng cần thiết"
                        />
                        <input
                          value={s.unit ?? ''}
                          onChange={(e) =>
                            setSupplies(
                              supplies.map((x, j) =>
                                j === i ? { ...x, unit: e.target.value } : x,
                              ),
                            )
                          }
                          placeholder="kg"
                          className="cm-input"
                          title="Đơn vị (vd: kg, thùng, hộp)"
                          maxLength={20}
                        />
                        <button
                          type="button"
                          onClick={() => setSupplies(supplies.filter((_, j) => j !== i))}
                          className="cm-repeat-remove"
                          aria-label="Xoá vật phẩm"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSupplies([...supplies, { name: '' }])}
                      className="cm-repeat-add"
                    >
                      <span className="material-symbols-outlined text-[15px]">add</span> Thêm vật phẩm
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── Footer ─── */}
        <div className="cm-modal-footer">
          <button type="button" onClick={onClose} className="cm-btn-cancel">
            Huỷ
          </button>

          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              className="cm-btn-cancel cm-btn-back"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Quay lại
            </button>
          )}

          {step < 3 ? (
            // `key` khác nhau là BẮT BUỘC: hai nút ở cùng vị trí, cùng class nên React
            // sẽ tái dùng đúng thẻ <button> đó và chỉ vá lại thuộc tính `type`. Khi bấm
            // "Tiếp tục", state cập nhật đồng bộ ngay trong sự kiện click → tới lúc
            // click nổi bọt lên <form> thì nút đã mang type="submit" và trình duyệt
            // gửi form luôn. Key riêng buộc React dựng thẻ mới, cắt đứt chuỗi đó.
            <button
              key="next"
              type="button"
              onClick={() => goToStep((step + 1) as 2 | 3)}
              className="cm-btn-submit"
            >
              Tiếp tục
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          ) : (
            <button key="submit" type="submit" disabled={pending} className="cm-btn-submit">
              {pending ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">
                    progress_activity
                  </span>
                  Đang gửi...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  Gửi yêu cầu
                </>
              )}
            </button>
          )}
        </div>
      </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Image uploader: Upload (file) | URL (paste link)
// ─────────────────────────────────────────────────────────────────────────────
function ImageUploader({
  value,
  onChange,
  uploading,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  uploading: boolean;
}) {
  const upload = useUploadCampaignImage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [url, setUrl] = useState('');
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (value) return;
    setLocalPreviewUrl(null);
  }, [value]);

  function readLocalPreview(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function onPick(file: File) {
    try {
      setLocalPreviewUrl(await readLocalPreview(file));
      const res = await upload.mutateAsync(file);
      onChange(res.url);
    } catch (e) {
      setLocalPreviewUrl(null);
      toast.error(errMsg(e, 'Tai anh that bai'));
    }
  }

  function applyUrl() {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error('Nhập URL ảnh trước');
      return;
    }
    try {
      const u = new URL(trimmed);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      setLocalPreviewUrl(null);
      onChange(trimmed);
      setUrl('');
      setMode('upload');
    } catch {
      toast.error('URL không hợp lệ — phải bắt đầu bằng http(s)://');
    }
  }

  return (
    <div className="space-y-3">
      <input
        id="cm-img-input"
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPick(file);
          e.target.value = '';
        }}
      />

      {value || localPreviewUrl ? (
        <div className="cm-upload-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={localPreviewUrl ?? mediaUrl(value ?? '')} alt="Anh bia" />
          <button
            type="button"
            onClick={() => {
              setLocalPreviewUrl(null);
              onChange(null);
            }}
            className="cm-upload-preview-remove"
            aria-label="Xoá ảnh"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      ) : (
        <>
          <div className="cm-upload-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-pressed={mode === 'upload'}
              onClick={() => setMode('upload')}
              className="cm-upload-tab"
            >
              <span className="material-symbols-outlined text-[14px]">upload</span>
              Tải ảnh lên
            </button>
            <button
              type="button"
              role="tab"
              aria-pressed={mode === 'url'}
              onClick={() => setMode('url')}
              className="cm-upload-tab"
            >
              <span className="material-symbols-outlined text-[14px]">link</span>
              Dán URL
            </button>
          </div>

          {mode === 'upload' ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              className={`cm-upload-drop w-full ${upload.isPending ? 'cm-upload-drop--loading' : ''}`}
            >
              <span className="material-symbols-outlined">
                {upload.isPending ? 'hourglass_top' : 'add_photo_alternate'}
              </span>
              <p className="text-xs font-bold mt-1.5">
                {uploading || upload.isPending
                  ? 'Đang tải ảnh...'
                  : 'Bấm để chọn ảnh (JPG/PNG/WebP)'}
              </p>
              <p className="text-[10px] mt-0.5">Tối đa 10MB · ảnh ngang tỉ lệ 16:9 cho đẹp</p>
            </button>
          ) : (
            <div className="cm-upload-url-row">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyUrl();
                  }
                }}
                placeholder="https://example.com/anh-bia.jpg"
                className="cm-input"
              />
              <button
                type="button"
                onClick={applyUrl}
                disabled={!url.trim()}
                className="cm-upload-url-apply"
              >
                Áp dụng
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SlotStepper({
  tone,
  label,
  icon,
  value,
  onChange,
  error,
}: {
  tone: 'chef' | 'waiter' | 'shipper';
  label: string;
  icon: string;
  value: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  return (
    <div className={`cm-slot ${error ? '!ring-1 !ring-rose-300 rounded-2xl' : ''}`}>
      <span className={`cm-slot-label cm-slot-label--${tone}`}>
        <span className="material-symbols-outlined text-[14px]">{icon}</span>
        {label}
      </span>
      <div className="cm-slot-row">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          className="cm-slot-btn"
          aria-label={`Giảm ${label}`}
        >
          <span className="material-symbols-outlined text-[16px]">remove</span>
        </button>
        <span className="cm-slot-value">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(99, value + 1))}
          className="cm-slot-btn"
          aria-label={`Tăng ${label}`}
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-rose-600 font-semibold mt-0.5 text-center">{error}</p>
      )}
    </div>
  );
}

/** Mini stepper compact cho shift row (label + role + slots + times). */
function MiniStepper({
  value,
  onChange,
  title,
}: {
  value: number;
  onChange: (v: number) => void;
  title?: string;
}) {
  return (
    <div className="cm-mini-stepper" title={title}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        aria-label="Giảm"
      >
        <span className="material-symbols-outlined text-[14px]">remove</span>
      </button>
      <span className="cm-mini-stepper-value">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(99, value + 1))}
        aria-label="Tăng"
      >
        <span className="material-symbols-outlined text-[14px]">add</span>
      </button>
    </div>
  );
}

/**
 * Tóm tắt tổng số thành viên từ các ca đã thêm.
 * Hiển thị ngay sau dropdown gợi ý và trước danh sách ca — giúp user thấy
 * ngay tổng đầu bếp / phục vụ / giao hàng sau khi chèn từng mẫu, đồng thời
 * cảnh báo nếu tổng nhân sự quá mỏng / quá dày so với số suất dự kiến.
 */
function ShiftsSummary({
  total,
  byRole,
  valid,
  expectedServings,
}: {
  total: number;
  byRole: { chef: number; waiter: number; shipper: number; any: number };
  valid: number;
  expectedServings: number;
}) {
  // Gợi ý ngưỡng nhân sự tối thiểu theo số suất:
  //   <50 suất  → 4–6 người
  //   50–200    → 8–14 người
  //   >200      → ≥ 14 người, scale theo servings/15
  const recommendedMin =
    expectedServings < 50
      ? 4
      : expectedServings <= 200
        ? 8
        : Math.max(14, Math.ceil(expectedServings / 15));

  let verdict: { tone: 'rose' | 'amber' | 'emerald'; text: string; icon: string };
  if (total === 0) {
    verdict = {
      tone: 'amber',
      icon: 'priority_high',
      text: 'Chưa có ca nào — chèn mẫu hoặc tự thêm ca bên dưới.',
    };
  } else if (valid === 0) {
    verdict = {
      tone: 'amber',
      icon: 'edit',
      text: 'Các ca đang trống tên — bổ sung nhãn để tình nguyện viên nhận diện.',
    };
  } else if (total < recommendedMin) {
    verdict = {
      tone: 'amber',
      icon: 'group_remove',
      text: `Tổng ${total} người — khá mỏng cho ${expectedServings} suất (khuyến nghị ≥ ${recommendedMin}).`,
    };
  } else if (total > recommendedMin * 2.5) {
    verdict = {
      tone: 'rose',
      icon: 'group_add',
      text: `Tổng ${total} người — có thể thừa cho ${expectedServings} suất (khuyến nghị ≤ ${Math.ceil(recommendedMin * 2.5)}).`,
    };
  } else {
    verdict = {
      tone: 'emerald',
      icon: 'check_circle',
      text: `Tổng ${total} người — phù hợp với quy mô ${expectedServings} suất.`,
    };
  }

  const verdictCls: Record<typeof verdict.tone, string> = {
    rose: 'bg-rose-50 text-rose-800 border-rose-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };

  return (
    <div
      className={`mb-3 rounded-2xl border px-3 py-2.5 ${verdictCls[verdict.tone]}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-extrabold inline-flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px]">
            {verdict.icon}
          </span>
          {verdict.text}
        </p>
        <span className="text-[10px] font-bold uppercase tracking-wide opacity-75">
          {valid}/{valid === 1 ? 'ca' : 'các ca'} đã đặt tên
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
        <SummaryCell
          icon="group"
          label="Tổng thành viên"
          value={total}
          accent
        />
        <SummaryCell
          icon="skillet"
          label="Đầu bếp"
          value={byRole.chef}
        />
        <SummaryCell
          icon="room_service"
          label="Phục vụ"
          value={byRole.waiter}
        />
        <SummaryCell
          icon="local_shipping"
          label="Giao hàng"
          value={byRole.shipper}
        />
      </div>
    </div>
  );
}

function SummaryCell({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-2 py-1.5 flex items-center gap-2 ${
        accent
          ? 'bg-white/70 border-current'
          : 'bg-white/50 border-current/30'
      }`}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold uppercase tracking-wider opacity-70 truncate">
          {label}
        </p>
        <p className="text-sm font-extrabold leading-tight">{value}</p>
      </div>
    </div>
  );
}

/**
 * Tóm tắt tổng nhân sự từ 3 stepper (đầu bếp / phục vụ / giao hàng).
 * Hiển thị ngay dưới grid stepper — độc lập với danh sách ca trực.
 */
function SlotsSummary({
  chef,
  waiter,
  shipper,
  expectedServings,
  shifts,
  onApplySuggestion,
}: {
  chef: number;
  waiter: number;
  shipper: number;
  expectedServings: number;
  shifts: ShiftDraft[];
  onApplySuggestion: (v: Record<StaffRole, number>) => void;
}) {
  const total = chef + waiter + shipper;
  // Số người ≠ tổng lượt ca: một người nhận được nhiều ca miễn không trùng giờ.
  // staffingVerdict đối chiếu 3 stepper với khoảng [cao điểm, tổng lượt ca] của
  // từng vai trò thay vì chỉ so tổng với số suất.
  const demand = staffingDemand(shifts);
  const verdict = staffingVerdict({ chef, waiter, shipper }, shifts, expectedServings);

  const verdictCls: Record<typeof verdict.tone, string> = {
    rose: 'bg-rose-50 text-rose-800 border-rose-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };

  return (
    <div
      className={`mt-2 rounded-2xl border px-3 py-2.5 ${verdictCls[verdict.tone]}`}
      role="status"
      aria-live="polite"
    >
      <p className="text-xs font-extrabold inline-flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[14px]">
          {verdict.icon}
        </span>
        {verdict.text}
      </p>
      {verdict.hint && <p className="mt-1 text-[11px] opacity-80">{verdict.hint}</p>}
      {/* Chèn mẫu ca KHÔNG tự cộng vào 3 stepper — lượt ca và số người là hai đại
          lượng khác nhau. Nút này áp con số đã tính sẵn để khỏi cộng tay. */}
      {verdict.suggested && (
        <button
          type="button"
          onClick={() => onApplySuggestion(verdict.suggested!)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-current/30 px-2.5 py-1 text-[11px] font-bold hover:bg-white/60 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
          Dùng số đề xuất ({verdict.suggested.chef} bếp · {verdict.suggested.waiter} phục vụ ·{' '}
          {verdict.suggested.shipper} giao hàng)
        </button>
      )}

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
        <SummaryCell icon="group" label="Tổng thành viên" value={total} accent />
        <SummaryCell
          icon="skillet"
          label={demand.byRole.chef.shiftCount > 0 ? `Đầu bếp · ${demand.byRole.chef.slots} lượt ca` : 'Đầu bếp'}
          value={chef}
        />
        <SummaryCell
          icon="room_service"
          label={demand.byRole.waiter.shiftCount > 0 ? `Phục vụ · ${demand.byRole.waiter.slots} lượt ca` : 'Phục vụ'}
          value={waiter}
        />
        <SummaryCell
          icon="local_shipping"
          label={demand.byRole.shipper.shiftCount > 0 ? `Giao hàng · ${demand.byRole.shipper.slots} lượt ca` : 'Giao hàng'}
          value={shipper}
        />
      </div>
    </div>
  );
}
