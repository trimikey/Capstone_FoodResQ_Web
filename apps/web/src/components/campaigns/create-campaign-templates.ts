/**
 * Bộ dữ liệu gợi ý mẫu cho form tạo chiến dịch.
 * - CA_TRUC: các ca mẫu theo từng vai trò (sơ chế / nấu / phát).
 * - LICH_TRINH: các mốc hoạt động thường gặp theo giờ.
 * - VAT_PHAM: danh sách vật phẩm / nguyên liệu cần thiết hay dùng.
 *
 * Mỗi mục có `id` để key, và các field tương ứng với state trong CreateCampaignModal.
 *
 * ─── Quy tắc scale theo "Số suất ăn dự kiến" ─────────────────────────────
 * Mặc định templates được thiết kế cho chiến dịch ~100 suất (medium tier).
 * Khi user thay đổi expectedServings, helper `scaleByServings(...)` sẽ
 * nhân slotsNeeded + quantity theo tier:
 *   small  (<50)   → ×0.5  (min 1)
 *   medium (50–200) → ×1.0  (giữ nguyên)
 *   large  (>200)  → ×(servings/100), làm tròn lên, min 1
 *
 * Mục đích: gợi ý "vừa đủ" theo quy mô, không quá thừa cũng không quá thiếu.
 */

export interface ShiftTemplate {
  id: string;
  label: string;
  role?: 'chef' | 'waiter' | 'shipper';
  startTime: string;
  endTime: string;
  /** Số slot cần cho ca này ở tier medium (~100 suất). Được scale theo servings. */
  slotsNeeded: number;
}

export interface ScheduleTemplate {
  id: string;
  time: string;
  label: string;
}

export interface SupplyTemplate {
  id: string;
  name: string;
  /** Số lượng ở tier medium (~100 suất). Được scale theo servings. */
  quantity?: number;
  unit?: string;
}

export interface MenuTemplate {
  id: string;
  name: string;
  type: 'breakfast' | 'lunch' | 'dinner';
  /** Keywords phải xuất hiện (lowercase, partial match) trong tên vật phẩm đã nhập.
   *  Match "gạo" sẽ khớp với "Gạo sạch", "Túi gạo", v.v.
   *  Tất cả keyword phải có → món mới được gợi ý. */
  requires: string[];
  /** Số suất ước tính cho món này (~30% tổng servings chia đều các món match).
   *  Computed lúc buildMatchedMenuTemplates. */
  plannedServings?: number;
}

// ─── Tier helpers ──────────────────────────────────────────────────────────
export type ServingsTier = 'small' | 'medium' | 'large';

export function getServingsTier(servings: number): ServingsTier {
  if (servings < 50) return 'small';
  if (servings <= 200) return 'medium';
  return 'large';
}

/** Trả về hệ số nhân theo tier. Dùng cho slots/quantity. */
export function servingsMultiplier(servings: number): number {
  const tier = getServingsTier(servings);
  if (tier === 'small') return 0.5;
  if (tier === 'medium') return 1;
  // large: tuyến tính theo servings, vd 300 suất → ×3, 500 → ×5
  return Math.max(1, servings / 100);
}

/** Scale một số nguyên theo tier, làm tròn và đảm bảo ≥1 (nếu đầu vào >0). */
export function scaleByServings(value: number, servings: number): number {
  if (value <= 0) return value;
  const scaled = value * servingsMultiplier(servings);
  return Math.max(1, Math.round(scaled));
}

// ─── Templates ─────────────────────────────────────────────────────────────
export const MENU_TEMPLATES: MenuTemplate[] = [
  // ── Cơm (cần gạo + 1 loại đạm)
  { id: 'menu-com-trang', name: 'Cơm trắng', type: 'lunch', requires: ['gạo'] },
  { id: 'menu-com-ga', name: 'Cơm gà xối mỡ', type: 'lunch', requires: ['gạo', 'gà'] },
  {
    id: 'menu-com-thit-kho',
    name: 'Cơm thịt kho trứng',
    type: 'lunch',
    requires: ['gạo', 'thịt', 'trứng'],
  },
  {
    id: 'menu-com-suon',
    name: 'Cơm sườn xào chua ngọt',
    type: 'lunch',
    requires: ['gạo', 'thịt'],
  },
  {
    id: 'menu-com-ca-ri',
    name: 'Cơm cà ri gà',
    type: 'dinner',
    requires: ['gạo', 'gà'],
  },
  { id: 'menu-com-ca', name: 'Cơm cá kho', type: 'lunch', requires: ['gạo', 'cá'] },

  // ── Cháo (cần gạo + 1 loại topping)
  { id: 'menu-chao-ga', name: 'Cháo gà', type: 'breakfast', requires: ['gạo', 'gà'] },
  {
    id: 'menu-chao-thit',
    name: 'Cháo thịt bằm',
    type: 'breakfast',
    requires: ['gạo', 'thịt'],
  },
  { id: 'menu-chao-ca', name: 'Cháo cá', type: 'breakfast', requires: ['gạo', 'cá'] },
  {
    id: 'menu-chao-trung',
    name: 'Cháo trứng',
    type: 'breakfast',
    requires: ['gạo', 'trứng'],
  },
  { id: 'menu-chao-rau', name: 'Cháo rau củ', type: 'breakfast', requires: ['gạo', 'rau'] },

  // ── Canh (cần rau + 1 loại đạm/nước dùng)
  {
    id: 'menu-canh-rau-thit',
    name: 'Canh rau mồng tơi nấu thịt',
    type: 'lunch',
    requires: ['rau', 'thịt'],
  },
  { id: 'menu-canh-chua', name: 'Canh chua cá', type: 'lunch', requires: ['rau', 'cá'] },
  {
    id: 'menu-canh-kho-qua',
    name: 'Canh khổ qua nhồi thịt',
    type: 'dinner',
    requires: ['rau', 'thịt'],
  },
  { id: 'menu-canh-trung', name: 'Canh trứng rau mùi', type: 'lunch', requires: ['rau', 'trứng'] },

  // ── Món khô / mặn (món đơn — cần đạm là đủ)
  { id: 'menu-trung-chien', name: 'Trứng chiên', type: 'lunch', requires: ['trứng'] },
  {
    id: 'menu-thit-kho',
    name: 'Thịt kho trứng',
    type: 'dinner',
    requires: ['thịt', 'trứng'],
  },
  { id: 'menu-ca-kho', name: 'Cá kho tộ', type: 'dinner', requires: ['cá'] },
  { id: 'menu-ga-luoc', name: 'Gà luộc lá chanh', type: 'dinner', requires: ['gà'] },
  { id: 'menu-thit-nuong', name: 'Thịt nướng', type: 'dinner', requires: ['thịt'] },
];

export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  // ── Sơ chế
  { id: 'shift-prep-morning', label: 'Ca sáng — Sơ chế', role: 'chef', startTime: '06:00', endTime: '08:00', slotsNeeded: 4 },
  { id: 'shift-prep-midday', label: 'Ca trưa — Sơ chế', role: 'chef', startTime: '09:00', endTime: '11:00', slotsNeeded: 3 },
  // ── Nấu
  { id: 'shift-cook-morning', label: 'Ca sáng — Nấu', role: 'chef', startTime: '07:00', endTime: '10:00', slotsNeeded: 3 },
  { id: 'shift-cook-midday', label: 'Ca trưa — Nấu', role: 'chef', startTime: '09:00', endTime: '11:30', slotsNeeded: 4 },
  { id: 'shift-cook-evening', label: 'Ca tối — Nấu', role: 'chef', startTime: '15:00', endTime: '18:00', slotsNeeded: 3 },
  // ── Phục vụ
  { id: 'shift-serve-breakfast', label: 'Phục vụ bữa sáng', role: 'waiter', startTime: '07:30', endTime: '09:30', slotsNeeded: 4 },
  { id: 'shift-serve-lunch', label: 'Phục vụ bữa trưa', role: 'waiter', startTime: '11:00', endTime: '13:30', slotsNeeded: 5 },
  { id: 'shift-serve-dinner', label: 'Phục vụ bữa tối', role: 'waiter', startTime: '17:30', endTime: '20:00', slotsNeeded: 4 },
  // ── Vận chuyển
  { id: 'shift-ship-lunch', label: 'Vận chuyển bữa trưa', role: 'shipper', startTime: '11:00', endTime: '13:30', slotsNeeded: 2 },
  { id: 'shift-ship-dinner', label: 'Vận chuyển bữa tối', role: 'shipper', startTime: '17:30', endTime: '20:00', slotsNeeded: 2 },
];

export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  { id: 'sch-0', time: '06:00', label: 'Tập trung tại bếp, phân công nhiệm vụ' },
  { id: 'sch-1', time: '06:30', label: 'Kiểm tra nguyên liệu, dụng cụ và thiết bị bếp' },
  { id: 'sch-2', time: '07:00', label: 'Rửa, sơ chế rau củ, vo gạo' },
  { id: 'sch-3', time: '08:00', label: 'Bắt đầu nấu các món chính' },
  { id: 'sch-4', time: '09:30', label: 'Chuẩn bị hộp/túi đựng suất ăn' },
  { id: 'sch-5', time: '10:30', label: 'Đóng gói suất, dán nhãn (nếu có)' },
  { id: 'sch-6', time: '11:00', label: 'Tập kết suất tại điểm phát' },
  { id: 'sch-7', time: '11:30', label: 'Kiểm tra số lượng suất trước khi phát' },
  { id: 'sch-8', time: '12:00', label: 'Bắt đầu phát suất cho người nhận' },
  { id: 'sch-9', time: '13:30', label: 'Kết thúc phát suất, dọn dẹp khu vực' },
  { id: 'sch-10', time: '14:30', label: 'Vệ sinh bếp, trả thiết bị' },
  { id: 'sch-11', time: '15:30', label: 'Họp rút kinh nghiệm, chốt số liệu' },
];

export const SUPPLY_TEMPLATES: SupplyTemplate[] = [
  // ── Nguyên liệu nấu ăn (quantity ở tier medium ~100 suất)
  { id: 'sup-rice', name: 'Gạo sạch', quantity: 10, unit: 'kg' },
  { id: 'sup-vegetables', name: 'Rau củ các loại', quantity: 5, unit: 'kg' },
  { id: 'sup-meat', name: 'Thịt heo / bò', quantity: 3, unit: 'kg' },
  { id: 'sup-chicken', name: 'Thịt gà', quantity: 3, unit: 'kg' },
  { id: 'sup-fish', name: 'Cá fillet', quantity: 2, unit: 'kg' },
  { id: 'sup-eggs', name: 'Trứng gà', quantity: 30, unit: 'quả' },
  { id: 'sup-oil', name: 'Dầu ăn', quantity: 2, unit: 'lít' },
  { id: 'sup-spices', name: 'Gia vị (muối, đường, tiêu, nước mắm)', quantity: 1, unit: 'bộ' },
  // ── Vật dụng đóng gói
  { id: 'sup-box', name: 'Hộp đựng suất ăn (1 lần)', quantity: 100, unit: 'hộp' },
  { id: 'sup-bag', name: 'Túi ni-lông sạch', quantity: 1, unit: 'cuộn' },
  { id: 'sup-labels', name: 'Nhãn dán / bút ghi', quantity: 1, unit: 'bộ' },
  // ── Dụng cụ bếp
  { id: 'sup-gloves', name: 'Găng tay nilon (dùng 1 lần)', quantity: 2, unit: 'hộp' },
  { id: 'sup-apron', name: 'Tạp dề / khẩu trang', quantity: 10, unit: 'cái' },
  { id: 'sup-container', name: 'Thùng giữ nhiệt', quantity: 3, unit: 'thùng' },
  { id: 'sup-cooler', name: 'Thùng xốp / đá lạnh', quantity: 2, unit: 'thùng' },
  // ── Vật dụng phát
  { id: 'sup-table', name: 'Bàn gấp / ghế', quantity: 4, unit: 'bộ' },
  { id: 'sup-banner', name: 'Banner / standee nhận diện', quantity: 1, unit: 'cái' },
  { id: 'sup-trash', name: 'Túi rác + thùng rác', quantity: 5, unit: 'bộ' },
];

/** Một số vật phẩm KHÔNG scale theo servings (đếm theo đầu người/ca, không phải theo suất). */
const NO_SCALE_SUPPLY_IDS = new Set<string>([
  'sup-apron', // tạp dề tính theo số người tham gia
  'sup-gloves', // găng tay dùng theo ca
  'sup-table', // bàn ghế setup 1 lần
  'sup-banner', // banner 1 cái
  'sup-trash', // thùng rác đặt cố định
]);

/**
 * Scale toàn bộ templates theo expectedServings.
 * Trả về object có 3 mảng MỚI (không mutate gốc) để truyền cho UI render.
 */
export function buildScaledTemplates(servings: number) {
  const safeServings = Math.max(1, Math.floor(servings || 1));

  const shifts = SHIFT_TEMPLATES.map((s) => ({
    ...s,
    slotsNeeded: scaleByServings(s.slotsNeeded, safeServings),
  }));

  const supplies = SUPPLY_TEMPLATES.map((s) => ({
    ...s,
    // Vật phẩm không phụ thuộc số suất → giữ nguyên quantity.
    quantity:
      s.quantity == null || NO_SCALE_SUPPLY_IDS.has(s.id)
        ? s.quantity
        : scaleByServings(s.quantity, safeServings),
  }));

  // Lịch trình KHÔNG scale (cố định theo giờ).
  return { shifts, schedule: SCHEDULE_TEMPLATES, supplies };
}

/**
 * Lọc menu templates dựa trên vật phẩm đã nhập.
 *
 * Mỗi món có mảng `requires` (keywords). Món được chọn khi TẤT CẢ keyword
 * xuất hiện trong tên vật phẩm đã nhập (lowercase, partial match).
 *
 * Ví dụ: user nhập "Gạo sạch", "Thịt heo", "Trứng gà", "Rau củ"
 * → match: "Cơm thịt kho trứng", "Cháo thịt bằm", "Canh rau mồng tơi", v.v.
 *
 * Trả về mảng rỗng nếu supplies rỗng → UI sẽ hiển thị empty state.
 */
export function buildMatchedMenuTemplates(
  supplies: Array<{ name: string }>,
  servings: number,
): MenuTemplate[] {
  if (!supplies || supplies.length === 0) return [];
  const supplyText = supplies
    .map((s) => s.name.toLowerCase())
    .join(' | ');
  const matched = MENU_TEMPLATES.filter((m) =>
    m.requires.every((kw) => supplyText.includes(kw.toLowerCase())),
  );
  // Phân bổ suất: mỗi món match ~30% tổng servings / số món match (còn lại 70%
  // thuộc về ca trực / khác). Min 5 suất/món để tránh 0.
  const safeServings = Math.max(1, Math.floor(servings || 1));
  const perDish = matched.length
    ? Math.max(5, Math.round((safeServings * 0.3) / matched.length))
    : 0;
  return matched.map((m) => ({ ...m, plannedServings: perDish }));
}