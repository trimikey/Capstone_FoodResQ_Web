/**
 * Chọn tin đăng của NCC để TRỪ TỒN KHO khi NCC chấp nhận một đơn nguyên liệu.
 *
 * Đơn bếp gửi chỉ có chữ tự do ("Gạo sạch", 10 kg), còn tồn kho của NCC nằm ở các
 * tin đăng (`food_listings.quantity_remaining`, tính theo `quantity_unit`). Hàm ở đây
 * ghép hai phía và quy kg về đơn vị của tin — thuần hàm, không chạm DB, để test được.
 */

export interface StockListing {
  id: string;
  title: string;
  category: string;
  quantityUnit: string;
  quantityRemaining: number;
  weightPerUnitKg: number | null;
}

/** Bỏ dấu + hạ chữ thường, để "Gạo" khớp "gao" bất kể cách gõ. */
export function normalizeVi(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Chữ mô tả chứ không nói món gì — bỏ khi so tên. */
const FILLER_WORDS = new Set(['sach', 'tuoi', 'loai', 'cac', 'va', 'hang', 'ngon', 'kg', 'goi', 'hop', 'tu', 'thien']);

/** 2 = tên tin có đúng chữ của món, 1 = cùng nhóm thực phẩm bếp khai, 0 = không liên quan. */
export function listingMatchScore(
  listing: Pick<StockListing, 'title' | 'category'>,
  ingredientName: string,
  foodCategory?: string | null,
): number {
  const words = normalizeVi(ingredientName)
    .split(' ')
    .filter((w) => w.length >= 2 && !FILLER_WORDS.has(w));
  const title = ` ${normalizeVi(listing.title)} `;
  if (words.some((w) => title.includes(` ${w} `))) return 2;
  if (foodCategory && listing.category === foodCategory) return 1;
  return 0;
}

/**
 * Quy số kg bếp xin về số đơn vị cần trừ trên tin. null = tin không quy được ra kg
 * (tính theo phần/hộp mà chưa khai kg mỗi đơn vị) → không dám trừ bừa.
 */
export function unitsForKg(listing: Pick<StockListing, 'quantityUnit' | 'weightPerUnitKg'>, kg: number): number | null {
  if (listing.quantityUnit === 'kg') return Math.round(kg * 100) / 100;
  if (listing.weightPerUnitKg != null && listing.weightPerUnitKg > 0) {
    return Math.ceil(kg / listing.weightPerUnitKg);
  }
  return null;
}

/** Đơn vị bếp gõ ("lít", "hộp", "Kg") → mã đơn vị tin đăng. null = không quy được. */
const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg', kilogram: 'kg', ky: 'kg', kilo: 'kg',
  lit: 'liter', l: 'liter', liter: 'liter', litre: 'liter',
  hop: 'box', box: 'box', thung: 'box',
  cai: 'item', item: 'item', chiec: 'item', goi: 'item', chai: 'item',
  phan: 'portion', suat: 'portion', portion: 'portion',
};

export function canonicalUnit(unit?: string | null): string | null {
  if (!unit || !unit.trim()) return 'kg';
  return UNIT_ALIASES[normalizeVi(unit)] ?? null;
}

/**
 * Quy số lượng bếp xin (theo `unit`) về số đơn vị cần trừ trên tin.
 * - kg → dùng `unitsForKg` (tin theo kg, hoặc tin theo phần/hộp đã khai kg mỗi đơn vị).
 * - đơn vị khác → chỉ trừ khi tin cùng đơn vị (5 lít dầu ↔ tin tính theo lít).
 */
export function unitsForQuantity(
  listing: Pick<StockListing, 'quantityUnit' | 'weightPerUnitKg'>,
  quantity: number,
  unit?: string | null,
): number | null {
  const u = canonicalUnit(unit);
  if (u === 'kg') return unitsForKg(listing, quantity);
  if (u != null && u === listing.quantityUnit) return Math.round(quantity * 100) / 100;
  return null;
}

/**
 * Tin TỰ chọn để trừ khi NCC không chỉ định: chỉ nhận tin khớp đúng TÊN món — cùng
 * nhóm thôi thì không đủ (tiệm cá nhận đơn "thịt gà" mà trừ vào tin cá là sai kho).
 * Chỉ lấy tin quy được ra kg; ưu tiên tin CÒN ĐỦ hàng, rồi tin còn nhiều nhất.
 */
export function pickStockListing(
  listings: StockListing[],
  ingredientName: string,
  foodCategory: string | null | undefined,
  quantity: number,
  unit?: string | null,
): StockListing | null {
  const ranked = listings
    .map((l) => ({
      l,
      score: listingMatchScore(l, ingredientName, foodCategory),
      units: unitsForQuantity(l, quantity, unit),
    }))
    .filter((x) => x.score >= 2 && x.units != null)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.l.quantityRemaining >= (b.units as number)) - Number(a.l.quantityRemaining >= (a.units as number)) ||
        b.l.quantityRemaining - a.l.quantityRemaining,
    );
  return ranked[0]?.l ?? null;
}
