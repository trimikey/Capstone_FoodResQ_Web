import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lng: number;
}

/** Chỉ dùng để canh viewport bản đồ khi chưa có GPS, không dùng làm vị trí người dùng. */
export const DEFAULT_MAP_COORDS: Coords = { lat: 10.7769, lng: 106.7009 };

export const DEFAULT_COORDS = DEFAULT_MAP_COORDS;

export const DEFAULT_LOCATION_LABEL = 'Chưa xác định vị trí';

const LEGACY_TEST_COORDS: Coords = { lat: 10.8416, lng: 106.8370 };

export interface CoordsResult {
  coords: Coords | null;
  /** true khi không lấy được vị trí thật. */
  isFallback: boolean;
}

/** Quá thời gian này mà chưa lấy được GPS fix → trả null để tránh dùng toạ độ giả. */
const LOCATION_TIMEOUT_MS = 6000;

export function isNearCoords(a: Coords, b: Coords, tolerance = 0.003): boolean {
  return Math.abs(a.lat - b.lat) <= tolerance && Math.abs(a.lng - b.lng) <= tolerance;
}

export function isLegacyTestLocation(coords: Coords | null | undefined): boolean {
  return coords ? isNearCoords(coords, LEGACY_TEST_COORDS) : false;
}

export function getLocationLabel(coords: Coords, isFallback = false): string {
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    return DEFAULT_LOCATION_LABEL;
  }
  const raw = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  return isFallback ? DEFAULT_LOCATION_LABEL : raw;
}

/**
 * Lấy toạ độ hiện tại qua expo-location. Xin quyền foreground;
 * nếu bị từ chối, lỗi, hoặc quá LOCATION_TIMEOUT_MS → trả coords=null kèm isFallback=true.
 * Có timeout vì getCurrentPositionAsync có thể treo nhiều giây khi GPS yếu.
 * Docs: https://docs.expo.dev/versions/latest/sdk/location/
 */
export async function getCurrentCoords(): Promise<CoordsResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { coords: null, isFallback: true };
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
    return { coords: null, isFallback: true };
  }
}
