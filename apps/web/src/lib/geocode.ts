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
