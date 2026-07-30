// Reverse-geocode toạ độ → địa chỉ dạng text. Ưu tiên Mapbox (nếu có token),
// mặc định dùng Nominatim (OpenStreetMap) — khớp với tile OSM dự án đang dùng.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const mbToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  try {
    if (mbToken) {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?language=vi&limit=1&access_token=${mbToken}`,
      );
      const data = await res.json();
      return data?.features?.[0]?.place_name ?? null;
    }
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=vi`,
    );
    const data = await res.json();
    return data?.display_name ?? null;
  } catch {
    return null;
  }
}

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

export async function searchAddress(query: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
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
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as NominatimSearchItem[];
    return data
      .map((item) => ({
        displayName: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
      }))
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
  } catch {
    return [];
  }
}
