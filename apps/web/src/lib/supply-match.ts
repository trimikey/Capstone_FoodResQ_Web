/**
 * Ghép "nguyên liệu chiến dịch cần" (chữ tự do do tổ chức gõ: "Gạo sạch", "Thịt gà",
 * "Gia vị (muối, đường…)") với NCC đang bán gì (nhóm thực phẩm + tên tin đăng).
 *
 * Mục tiêu: chọn vựa rau thì đơn gửi đi là RAU, chọn vựa gạo thì là GẠO — thay vì để
 * một ô "tên nguyên liệu" chung cho mọi NCC rồi gửi nhầm món họ không bán.
 */

export interface SupplyItem {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface SupplierOffer {
  categories: string[];
  listingTitles: string[];
}

/** Bỏ dấu + hạ chữ thường + gom khoảng trắng, để so khớp không phụ thuộc cách gõ. */
export function normalizeVi(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Từ khoá (đã bỏ dấu) → nhóm thực phẩm của tin đăng. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  vegetables: [
    'rau', 'cai', 'cu', 'hanh', 'toi', 'ot', 'ca chua', 'ca rot', 'bi', 'bau', 'muop', 'nam',
    'gia', 'dau que', 'dau bap', 'khoai', 'su hao', 'bap cai', 'xa lach', 'rau muong', 'rau cu',
  ],
  raw_protein: [
    'thit', 'ga', 'heo', 'lon', 'bo', 'ca', 'tom', 'muc', 'trung', 'vit', 'suon', 'cua', 'hai san',
  ],
  dry_goods: [
    'gao', 'mi', 'bun', 'pho', 'mien', 'nep', 'dau an', 'gia vi', 'muoi', 'duong', 'tieu',
    'nuoc mam', 'hat nem', 'bot ngot', 'bot', 'dau xanh', 'dau phong', 'dau nanh', 'nuoc tuong',
    'xi dau', 'do kho',
  ],
  fresh_fruit: ['trai cay', 'hoa qua', 'chuoi', 'cam', 'tao', 'xoai', 'dua hau', 'buoi', 'oi', 'thanh long'],
  beverage: ['sua', 'nuoc suoi', 'nuoc ngot', 'nuoc uong', 'tra', 'ca phe'],
  bakery: ['banh mi', 'banh ngot', 'banh'],
  canned_packaged: ['do hop', 'dong hop', 'dong goi', 'mi goi', 'ca hop'],
  cooked_meal: ['com', 'suat an', 'mon an'],
};

// Cụm dài được khớp trước và "ăn" mất phần chữ đó — nếu không, "cà chua" sẽ bị
// đọc thêm thành "cá" (đạm) và "bánh mì" thành "mì" (đồ khô).
const KEYWORDS_LONGEST_FIRST = Object.entries(CATEGORY_KEYWORDS)
  .flatMap(([category, words]) => words.map((word) => ({ category, word })))
  .sort((a, b) => b.word.length - a.word.length);

/** Đoán nhóm thực phẩm từ tên nguyên liệu tổ chức gõ. */
export function inferCategories(name: string): string[] {
  let text = ` ${normalizeVi(name)} `;
  const found = new Set<string>();
  for (const { category, word } of KEYWORDS_LONGEST_FIRST) {
    const needle = ` ${word} `;
    if (text.includes(needle)) {
      found.add(category);
      text = text.split(needle).join(' | ');
    }
  }
  return [...found];
}

/** Chữ mô tả chứ không nói món gì — bỏ khi so với tên tin đăng. */
const FILLER_WORDS = new Set(['sach', 'tuoi', 'loai', 'cac', 'va', 'hang', 'ngon', 'kg', 'goi', 'hop']);

/**
 * Điểm khớp giữa 1 nguyên liệu và 1 NCC: 2 = tên tin đăng có đúng chữ đó (chắc chắn
 * bán), 1 = cùng nhóm thực phẩm (có thể bán), 0 = không liên quan.
 */
export function supplyScore(item: SupplyItem, offer: SupplierOffer): number {
  const words = normalizeVi(item.name)
    .split(' ')
    .filter((w) => w.length >= 2 && !FILLER_WORDS.has(w));
  const titles = offer.listingTitles.map((t) => ` ${normalizeVi(t)} `);
  if (words.some((w) => titles.some((t) => t.includes(` ${w} `)))) return 2;
  const cats = inferCategories(item.name);
  if (cats.some((c) => offer.categories.includes(c))) return 1;
  return 0;
}

export interface SupplySuggestion extends SupplyItem {
  /** true = tên tin đăng có đúng món này; false = chỉ cùng nhóm thực phẩm (vd tiệm cá ↔ thịt gà). */
  exact: boolean;
}

/** Nguyên liệu NCC này có thể cung cấp, món đúng tên xếp trước món chỉ cùng nhóm. */
export function suppliesForProvider(items: SupplyItem[], offer: SupplierOffer): SupplySuggestion[] {
  return items
    .map((item) => ({ item, score: supplyScore(item, offer) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => ({ ...x.item, exact: x.score >= 2 }));
}

/** Đơn vị của nguyên liệu chiến dịch khai — không ghi đơn vị thì là kg. */
export function itemUnit(item: Pick<SupplyItem, 'unit'>): string {
  return item.unit?.trim() || 'kg';
}

/** Hai đơn vị có phải một không ("Lít" = "lít", "" = "kg"). */
export function sameUnit(a?: string | null, b?: string | null): boolean {
  return normalizeVi(a?.trim() || 'kg') === normalizeVi(b?.trim() || 'kg');
}

/** Số lượng điền sẵn theo đúng đơn vị nguyên liệu khai (3 kg, 1 lít, 1 bộ…). */
export function defaultQty(item: SupplyItem): string {
  return item.quantity != null ? String(item.quantity) : '';
}
