/**
 * Geocoding qua Nominatim (OpenStreetMap) — miễn phí, không cần API key.
 * Khớp với map Leaflet/OSM dùng trong MapPicker.
 *
 * Usage policy (bắt buộc tuân thủ): tối đa ~1 req/s, phải gửi User-Agent rõ ràng.
 * Phía gọi chịu trách nhiệm debounce. Docs:
 * - Search: https://nominatim.org/release-docs/latest/api/Search/
 * - Reverse: https://nominatim.org/release-docs/latest/api/Reverse/
 * - Policy: https://operations.osmfoundation.org/policies/nominatim/
 */

const BASE_URL = 'https://nominatim.openstreetmap.org';
const HEADERS = { 'User-Agent': 'FoodResQ-Mobile/1.0 (capstone)' };

export interface AddressSuggestion {
  displayName: string;
  lat: number;
  lng: number;
}

interface NominatimSearchItem {
  display_name: string;
  lat: string;
  lon: string;
}

interface NominatimReverseResult {
  display_name?: string;
}

/**
 * Tìm địa chỉ theo từ khoá, giới hạn trong Việt Nam, ưu tiên tiếng Việt.
 * Lỗi/timeout/abort → trả mảng rỗng (không ném) để UI tự xử lý fallback.
 */
export async function searchAddress(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const params = new URLSearchParams({
    format: 'jsonv2',
    q,
    countrycodes: 'vn',
    addressdetails: '1',
    limit: '6',
    'accept-language': 'vi',
  });

  try {
    const res = await fetch(`${BASE_URL}/search?${params.toString()}`, {
      headers: HEADERS,
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as NominatimSearchItem[];
    return data
      .map((item) => ({
        displayName: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
      }))
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  } catch {
    return [];
  }
}

/**
 * Reverse geocode (toạ độ → địa chỉ text), ưu tiên tiếng Việt.
 * Lỗi/timeout/abort → trả chuỗi rỗng (không ném).
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<string> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    'accept-language': 'vi',
  });

  try {
    const res = await fetch(`${BASE_URL}/reverse?${params.toString()}`, {
      headers: HEADERS,
      signal,
    });
    if (!res.ok) return '';
    const data = (await res.json()) as NominatimReverseResult;
    return data.display_name ?? '';
  } catch {
    return '';
  }
}
