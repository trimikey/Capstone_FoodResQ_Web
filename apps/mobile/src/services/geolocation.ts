import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lng: number;
}

/** Fallback/dev test: Vinhomes Grand Park, TP. Thủ Đức. */
export const DEFAULT_COORDS: Coords = { lat: 10.8416, lng: 106.8370 };

export const DEFAULT_LOCATION_LABEL = 'Vinhomes Grand Park';

export interface CoordsResult {
  coords: Coords;
  /** true khi không lấy được vị trí thật (đang dùng DEFAULT_COORDS). */
  isFallback: boolean;
}

/** Quá thời gian này mà chưa lấy được GPS fix → dùng DEFAULT_COORDS (tránh treo định vị). */
const LOCATION_TIMEOUT_MS = 6000;

export function isNearCoords(a: Coords, b: Coords, tolerance = 0.003): boolean {
  return Math.abs(a.lat - b.lat) <= tolerance && Math.abs(a.lng - b.lng) <= tolerance;
}

export function getLocationLabel(coords: Coords, isFallback = false): string {
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    return isFallback ? `${DEFAULT_LOCATION_LABEL} (mặc định)` : DEFAULT_LOCATION_LABEL;
  }
  if (isNearCoords(coords, DEFAULT_COORDS)) return DEFAULT_LOCATION_LABEL;
  const raw = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  return isFallback ? `${raw} (mặc định)` : raw;
}

/**
 * Lấy toạ độ hiện tại qua expo-location. Xin quyền foreground;
 * nếu bị từ chối, lỗi, hoặc quá LOCATION_TIMEOUT_MS → trả DEFAULT_COORDS kèm isFallback=true
 * (không ném lỗi). Có timeout vì getCurrentPositionAsync có thể treo nhiều giây khi GPS yếu.
 * Docs: https://docs.expo.dev/versions/latest/sdk/location/
 */
export async function getCurrentCoords(): Promise<CoordsResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { coords: DEFAULT_COORDS, isFallback: true };
    }
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('location-timeout')), LOCATION_TIMEOUT_MS),
      ),
    ]);
    return {
      coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      isFallback: false,
    };
  } catch {
    return { coords: DEFAULT_COORDS, isFallback: true };
  }
}
