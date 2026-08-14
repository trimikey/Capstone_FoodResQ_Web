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

  // ── Món rau (chỉ cần rau — bếp từ thiện luôn cần món rau ăn kèm)
  { id: 'menu-rau-luoc', name: 'Rau luộc chấm kho quẹt', type: 'lunch', requires: ['rau'] },
  { id: 'menu-rau-xao-toi', name: 'Rau xào tỏi', type: 'lunch', requires: ['rau'] },
  { id: 'menu-canh-rau-tap-tang', name: 'Canh rau tập tàng', type: 'lunch', requires: ['rau'] },
  { id: 'menu-do-xao-thap-cam', name: 'Đồ xào thập cẩm', type: 'dinner', requires: ['rau'] },

  // ── Cơm kết hợp rau (combo hay gặp nhất: gạo + rau + đạm)
  { id: 'menu-com-chien-rau', name: 'Cơm chiên rau củ', type: 'lunch', requires: ['gạo', 'rau'] },
  {
    id: 'menu-com-thit-xao-rau',
    name: 'Cơm thịt xào rau củ',
    type: 'lunch',
    requires: ['gạo', 'thịt', 'rau'],
  },
  {
    id: 'menu-com-ga-xao-rau',
    name: 'Cơm gà xào rau củ',
    type: 'lunch',
    requires: ['gạo', 'gà', 'rau'],
  },
  { id: 'menu-com-chien-trung', name: 'Cơm chiên trứng', type: 'lunch', requires: ['gạo', 'trứng'] },
  {
    id: 'menu-com-ca-chien',
    name: 'Cơm cá chiên sả nghệ',
    type: 'lunch',
    requires: ['gạo', 'cá'],
  },

  // ── Món mặn bổ sung
  { id: 'menu-thit-kho-tieu', name: 'Thịt kho tiêu', type: 'lunch', requires: ['thịt'] },
  { id: 'menu-thit-xao-sa-ot', name: 'Thịt xào sả ớt', type: 'dinner', requires: ['thịt'] },
  { id: 'menu-ga-kho-gung', name: 'Gà kho gừng', type: 'dinner', requires: ['gà'] },
  { id: 'menu-ca-chien', name: 'Cá chiên sả nghệ', type: 'lunch', requires: ['cá'] },
  { id: 'menu-trung-luoc', name: 'Trứng luộc', type: 'breakfast', requires: ['trứng'] },
  { id: 'menu-trung-xao-rau', name: 'Trứng xào rau củ', type: 'lunch', requires: ['trứng', 'rau'] },

  // ── Canh bổ sung
  { id: 'menu-canh-bi-thit', name: 'Canh bí đao nấu thịt', type: 'lunch', requires: ['rau', 'thịt'] },
  { id: 'menu-canh-ga-rau', name: 'Canh gà nấu rau củ', type: 'dinner', requires: ['rau', 'gà'] },
];

export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  // ── Lấy nguyên liệu (trước giờ sơ chế — đi chợ/nhận hàng tài trợ rồi chở về bếp)
  { id: 'shift-supply-run', label: 'Lấy nguyên liệu sáng', role: 'shipper', startTime: '04:30', endTime: '06:00', slotsNeeded: 2 },
  { id: 'shift-supply-receive', label: 'Nhận & kiểm nguyên liệu tại bếp', role: 'chef', startTime: '05:30', endTime: '06:30', slotsNeeded: 2 },
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
 * Từ đồng nghĩa cho từng nguyên liệu chuẩn mà `MENU_TEMPLATES.requires` dùng tới.
 * Cho phép người dùng gõ tự do ("Cá basa", "Rau muống") vẫn nhận đúng nguyên liệu.
 */
const INGREDIENT_ALIASES: Record<string, string[]> = {
  'gạo': ['gạo', 'nếp', 'tấm'],
  'gà': ['gà'],
  'thịt': ['thịt', 'heo', 'bò', 'sườn', 'nạc', 'ba chỉ'],
  'trứng': ['trứng'],
  'cá': ['cá', 'basa', 'diêu hồng', 'nục', 'ngừ', 'hồi', 'phi lê'],
  'rau': ['rau', 'củ', 'cải', 'bí', 'bầu', 'mướp', 'muống', 'mồng tơi', 'cà rốt', 'khoai', 'giá'],
};

/** Trứng gà/vịt/cút là TRỨNG, không phải thịt gia cầm. */
const EGG_BIRD_WORDS = new Set(['gà', 'vịt', 'cút']);

/**
 * Nhận diện nguyên liệu có trong tên một vật phẩm.
 *
 * So khớp theo TỪ chứ không phải chuỗi con. Trước đây hàm này nối hết tên vật phẩm
 * rồi `includes(keyword)`, nên "Rau củ **cá**c loại" chứa chuỗi "cá" → hệ thống tưởng
 * có cá và gợi ý "Cơm cá kho", "Cháo cá" dù người dùng không hề nhập cá.
 */
export function detectIngredients(name: string): Set<string> {
  const tokens = name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  // "Trứng gà" → bỏ chữ "gà" đứng ngay sau "trứng" để không bị hiểu là thịt gà.
  const cleaned: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (i > 0 && tokens[i - 1] === 'trứng' && EGG_BIRD_WORDS.has(tokens[i])) continue;
    cleaned.push(tokens[i]);
  }

  // Đệm khoảng trắng hai đầu để `includes(' từ ')` khớp trọn từ, kể cả cụm 2 chữ
  // như "mồng tơi", "cà rốt".
  const padded = ` ${cleaned.join(' ')} `;
  const found = new Set<string>();
  for (const [ingredient, aliases] of Object.entries(INGREDIENT_ALIASES)) {
    if (aliases.some((a) => padded.includes(` ${a} `))) found.add(ingredient);
  }
  return found;
}

/**
 * Lọc menu templates dựa trên vật phẩm đã nhập.
 *
 * Mỗi món có mảng `requires`. Món được gợi ý khi TẤT CẢ nguyên liệu nó cần đều
 * được nhận diện trong danh sách vật phẩm (khớp theo từ — xem `detectIngredients`).
 *
 * Ví dụ: nhập "Gạo sạch", "Rau củ các loại", "Thịt heo / bò"
 * → gợi ý cơm/cháo/canh dùng gạo, rau, thịt — KHÔNG gợi ý món cá.
 *
 * Trả về mảng rỗng nếu supplies rỗng → UI sẽ hiển thị empty state.
 */
export function buildMatchedMenuTemplates(
  supplies: Array<{ name: string }>,
  servings: number,
  /** Số món ĐANG có trong thực đơn — để ước tính suất mà món này sẽ nhận nếu thêm vào. */
  currentMenuCount = 0,
): MenuTemplate[] {
  if (!supplies || supplies.length === 0) return [];
  const available = new Set<string>();
  for (const s of supplies) {
    for (const ing of detectIngredients(s.name ?? '')) available.add(ing);
  }
  const matched = MENU_TEMPLATES.filter((m) => m.requires.every((kw) => available.has(kw)));

  // Suất hiển thị trên thẻ gợi ý = phần món này nhận được nếu bấm thêm ngay bây giờ,
  // tức tổng suất chiến dịch chia đều cho (số món hiện có + 1).
  //
  // Trước đây chia cho SỐ MÓN ĐƯỢC GỢI Ý (`matched.length`) rồi kẹp sàn 5 suất — với
  // 100 suất và 13 gợi ý thì ra 2,3 suất/món, sàn đẩy lên đúng 5 cho mọi món, nên con
  // số chẳng liên quan gì tới quy mô chiến dịch đã đăng ký.
  const safeServings = Math.max(1, Math.floor(servings || 1));
  const shareIfAdded = Math.max(1, Math.round(safeServings / (currentMenuCount + 1)));
  return matched.map((m) => ({ ...m, plannedServings: shareIfAdded }));
}

/**
 * Chia đều tổng số suất của chiến dịch cho các món trong thực đơn.
 *
 * Món người dùng đã tự gõ số (`servingsLocked`) được giữ nguyên; phần còn lại chia đều
 * cho các món tự động. Phần dư được rải cho những món đầu để TỔNG khớp đúng
 * `totalServings`, không bị thiếu/thừa vài suất do làm tròn.
 */
export function balanceMenuServings<
  T extends { plannedServings?: number; servingsLocked?: boolean },
>(rows: T[], totalServings: number): T[] {
  const total = Math.max(0, Math.floor(totalServings || 0));
  const isLocked = (r: T) => r.servingsLocked === true && r.plannedServings != null;

  const lockedSum = rows.filter(isLocked).reduce((s, r) => s + (r.plannedServings ?? 0), 0);
  const autoCount = rows.filter((r) => !isLocked(r)).length;
  if (autoCount === 0) return rows;

  const remaining = Math.max(0, total - lockedSum);
  const base = Math.floor(remaining / autoCount);
  let extra = remaining - base * autoCount;

  return rows.map((r) => {
    if (isLocked(r)) return r;
    const bonus = extra > 0 ? 1 : 0;
    if (extra > 0) extra -= 1;
    return { ...r, plannedServings: base + bonus };
  });
}