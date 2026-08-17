import type { CreateCampaignInput } from '@/hooks/useCampaigns';
import type {
  CampaignCreateDraft,
  CampaignMenuDraft,
  CampaignScheduleDraft,
  CampaignShiftDraft,
  CampaignSupplyDraft,
} from '@/stores/campaignCreateDraft';

export const CAMPAIGN_CREATE_STEPS = [
  { title: 'Thông tin cơ bản', icon: 'clipboard-text-outline' },
  { title: 'Ảnh chiến dịch', icon: 'image-outline' },
  { title: 'Thời gian & địa điểm', icon: 'map-clock-outline' },
  { title: 'Nhân sự & Ca trực', icon: 'account-group-outline' },
  { title: 'Vật phẩm hỗ trợ', icon: 'basket-outline' },
  { title: 'Thực đơn dự kiến', icon: 'silverware-fork-knife' },
  { title: 'Lịch trình', icon: 'timeline-clock-outline' },
  { title: 'Báo cáo & chốt thông tin', icon: 'file-check-outline' },
] as const;

export const CAMPAIGN_REVIEW_STEP = CAMPAIGN_CREATE_STEPS.length - 1;

export const SUPPLY_UNIT_OPTIONS = ['kg', 'quả', 'hộp', 'bộ', 'cái', 'thùng', 'chai'] as const;

export const pad = (n: number) => String(n).padStart(2, '0');

export const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const toTimeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const fmtDate = (d: Date) =>
  `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

export function toInt(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isInvalidCount(s: string): boolean {
  const n = Number(s);
  return !Number.isFinite(n) || n < 0;
}

export function dateFromTime(value: string): Date {
  const [hh = '0', mm = '0'] = value.split(':');
  const d = new Date();
  d.setHours(Number(hh), Number(mm), 0, 0);
  return d;
}

export type NormalizedCampaignMenuItem = {
  name: string;
  type: string;
  plannedServings?: number;
};

export type NormalizedCampaignScheduleItem = {
  time: string;
  label: string;
};

export type NormalizedCampaignSupplyItem = {
  name: string;
  quantity: number;
  unit: string;
};

export type NormalizedCampaignShift = {
  label: string;
  role?: CampaignShiftDraft['role'];
  startTime: string;
  endTime: string;
  slotsNeeded: number;
};

export function normalizeCampaignMenuItems(items: CampaignMenuDraft[]): NormalizedCampaignMenuItem[] {
  return items
    .filter((item) => item.name.trim() && item.type.trim())
    .map((item) => ({
      name: item.name.trim(),
      type: item.type.trim(),
      ...(item.plannedServings != null ? { plannedServings: item.plannedServings } : {}),
    }));
}

export function getCampaignMenuSummary(draft: CampaignCreateDraft) {
  const validItems = normalizeCampaignMenuItems(draft.menuItems);
  const plannedServings = validItems.reduce((sum, item) => sum + (item.plannedServings ?? 0), 0);
  const expectedServings = toInt(draft.expectedServings);
  return {
    validCount: validItems.length,
    plannedServings,
    expectedServings,
    hasDraftRows: draft.menuItems.some((item) => item.name.trim()),
    isUnderExpected: plannedServings > 0 && expectedServings > 0 && plannedServings < expectedServings,
  };
}

export function normalizeCampaignScheduleItems(items: CampaignScheduleDraft[]): NormalizedCampaignScheduleItem[] {
  return items
    .filter((item) => item.label.trim())
    .map((item) => ({ time: item.time.trim(), label: item.label.trim() }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function normalizeCampaignSupplyItems(items: CampaignSupplyDraft[]): NormalizedCampaignSupplyItem[] {
  return items
    .filter((item) => item.name.trim())
    .map((item) => ({
      name: item.name.trim(),
      quantity: item.quantity ?? 0,
      unit: item.unit?.trim() ?? '',
    }));
}

export function normalizeCampaignShifts(items: CampaignShiftDraft[]): NormalizedCampaignShift[] {
  return items
    .filter((item) => item.label.trim())
    .map((item) => ({
      label: item.label.trim(),
      role: item.role,
      startTime: item.startTime,
      endTime: item.endTime,
      slotsNeeded: item.slotsNeeded,
    }));
}

export function getCampaignStepError(step: number, draft: CampaignCreateDraft): string | null {
  const title = draft.title.trim();
  const description = draft.description.trim();
  const address = draft.address?.address.trim() ?? '';
  const expected = toInt(draft.expectedServings);

  if (step === 0) {
    if (!title) return 'Vui lòng nhập tiêu đề chiến dịch.';
    if (title.length < 5) return 'Tiêu đề cần tối thiểu 5 ký tự.';
    if (title.length > 255) return 'Tiêu đề tối đa 255 ký tự.';
    if (description.length > 5000) return 'Mô tả tối đa 5.000 ký tự.';
  }

  if (step === 2) {
    if (!address) return 'Vui lòng chọn địa chỉ tổ chức bếp ăn.';
    if (address.length < 5) return 'Địa chỉ bếp cần tối thiểu 5 ký tự.';
    if (toTimeStr(draft.endTime) <= toTimeStr(draft.startTime)) {
      return 'Giờ kết thúc phải sau giờ bắt đầu.';
    }
    if (draft.endDate && toDateStr(draft.endDate) < toDateStr(draft.scheduledDate)) {
      return 'Ngày kết thúc phải bằng hoặc sau ngày tổ chức.';
    }
  }

  if (step === 3) {
    if ([draft.chefSlots, draft.waiterSlots, draft.shipperSlots].some(isInvalidCount)) {
      return 'Số lượng tình nguyện viên không được âm.';
    }
    if ([draft.chefSlots, draft.waiterSlots, draft.shipperSlots].some((value) => toInt(value) > 50)) {
      return 'Mỗi vai trò tình nguyện viên tối đa 50 người.';
    }
    if (!expected || expected < 1) return 'Số suất ăn dự kiến tối thiểu là 1.';
    if (expected > 100000) return 'Số suất ăn dự kiến tối đa 100.000.';
    const shifts = normalizeCampaignShifts(draft.shifts);
    if (shifts.length > 10) return 'Tối đa 10 ca trực hợp lệ.';
    const invalidShift = draft.shifts.find(
      (item) =>
        (item.label.trim() && item.label.trim().length < 2) ||
        item.label.trim().length > 100 ||
        (item.label.trim() && (!item.startTime || !item.endTime)) ||
        (item.startTime && item.endTime && item.endTime <= item.startTime) ||
        (item.label.trim() && item.slotsNeeded < 1) ||
        item.slotsNeeded > 100,
    );
    if (invalidShift) return 'Kiểm tra tên ca, giờ bắt đầu/kết thúc và số người cần tối thiểu 1.';
  }

  if (step === 4) {
    const supplyItems = normalizeCampaignSupplyItems(draft.supplyItems);
    if (supplyItems.length > 30) return 'Vật phẩm hỗ trợ tối đa 30 mục hợp lệ.';
    const seenSupplyNames = new Set<string>();
    const hasDuplicateSupply = supplyItems.some((item) => {
      const normalizedName = item.name.toLowerCase();
      if (seenSupplyNames.has(normalizedName)) return true;
      seenSupplyNames.add(normalizedName);
      return false;
    });
    if (hasDuplicateSupply) return 'Vật phẩm hỗ trợ không được trùng tên.';
    const invalidSupply = draft.supplyItems.find(
      (item) =>
        item.name.trim().length > 80 ||
        (item.name.trim() && (item.quantity == null || item.quantity <= 0)) ||
        (item.name.trim() && !item.unit?.trim()) ||
        (item.name.trim() && !SUPPLY_UNIT_OPTIONS.includes(item.unit?.trim() as (typeof SUPPLY_UNIT_OPTIONS)[number])) ||
        (item.unit != null && item.unit.trim().length > 20),
    );
    if (invalidSupply) return 'Vật phẩm có tên phải có số lượng lớn hơn 0 và chọn đơn vị chuẩn, tên tối đa 80 ký tự.';
  }

  if (step === 5) {
    const menuItems = normalizeCampaignMenuItems(draft.menuItems);
    if (menuItems.length > 20) return 'Thực đơn tối đa 20 món hợp lệ.';
    const invalidMenu = draft.menuItems.find(
      (item) =>
        item.name.trim().length > 100 ||
        (item.name.trim() && !item.type) ||
        (item.plannedServings != null && (item.plannedServings < 0 || item.plannedServings > 10000)),
    );
    if (invalidMenu) return 'Tên món tối đa 100 ký tự, bữa ăn là bắt buộc nếu có tên món, số suất món tối đa 10.000.';
  }

  if (step === 6) {
    const scheduleItems = normalizeCampaignScheduleItems(draft.scheduleItems);
    if (scheduleItems.length > 20) return 'Lịch trình tối đa 20 mốc hợp lệ.';
    const invalidSchedule = draft.scheduleItems.find(
      (item) => item.label.trim().length > 160 || (item.label.trim() && !item.time.trim()),
    );
    if (invalidSchedule) return 'Mốc có mô tả phải có giờ, nội dung tối đa 160 ký tự.';
  }

  if (step === CAMPAIGN_REVIEW_STEP) {
    for (let index = 0; index < CAMPAIGN_REVIEW_STEP; index += 1) {
      const error = getCampaignStepError(index, draft);
      if (error) return error;
    }
  }

  return null;
}

export function hasCampaignDraftData(draft: CampaignCreateDraft): boolean {
  return Boolean(
    draft.title.trim() ||
      draft.description.trim() ||
      draft.imageUrl ||
      draft.address?.address.trim() ||
      draft.menuItems.length ||
      draft.shifts.length ||
      draft.scheduleItems.length ||
      draft.supplyItems.length,
  );
}

export function buildCampaignPayload(draft: CampaignCreateDraft): CreateCampaignInput {
  const menuItems = normalizeCampaignMenuItems(draft.menuItems);
  const shifts = normalizeCampaignShifts(draft.shifts);
  const scheduleItems = normalizeCampaignScheduleItems(draft.scheduleItems);
  const supplyItems = normalizeCampaignSupplyItems(draft.supplyItems);

  return {
    title: draft.title.trim(),
    kitchenAddress: draft.address!.address.trim(),
    lat: draft.address!.lat,
    lng: draft.address!.lng,
    scheduledDate: toDateStr(draft.scheduledDate),
    ...(draft.endDate ? { endDate: toDateStr(draft.endDate) } : {}),
    startTime: toTimeStr(draft.startTime),
    endTime: toTimeStr(draft.endTime),
    chefSlotsNeeded: toInt(draft.chefSlots),
    waiterSlotsNeeded: toInt(draft.waiterSlots),
    shipperSlotsNeeded: toInt(draft.shipperSlots),
    expectedServings: toInt(draft.expectedServings),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.imageUrl ? { imageUrls: [draft.imageUrl] } : {}),
    ...(menuItems.length ? { menuItems } : {}),
    ...(shifts.length ? { shifts } : {}),
    ...(scheduleItems.length ? { scheduleItems } : {}),
    ...(supplyItems.length ? { supplyItems } : {}),
  };
}
