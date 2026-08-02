// Ảnh placeholder theo category — dùng khi listing chưa có ảnh upload hoặc ảnh upload bị lỗi.
// Đặt ở lib/ để SafeImage + các nơi khác đều dùng chung, tránh trùng lặp.
const FALLBACK_BY_CATEGORY: Record<string, string> = {
  cooked_meal: '/com-ga-hoi-an.png',
  bakery: '/banh-mi-ngot-thap-cam.png',
  fresh_fruit: '/food_salad.png',
  beverage: '/food_lunchbox.png',
  vegetables: '/food_salad.png',
  raw_protein: '/food_lunchbox.png',
  dry_goods: '/banh-mi-lua-mach-tuoi.png',
  canned_packaged: '/banh-mi-lua-mach-tuoi.png',
  other: '/food_bread.png',
};
const DEFAULT_FALLBACK = '/food_bread.png';

export function fallbackImage(category?: string): string {
  if (category && FALLBACK_BY_CATEGORY[category]) return FALLBACK_BY_CATEGORY[category];
  return DEFAULT_FALLBACK;
}