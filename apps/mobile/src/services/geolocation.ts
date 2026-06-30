import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lng: number;
}

/** Fallback: trung tâm TP.HCM (dùng khi từ chối quyền hoặc lỗi định vị). */
export const DEFAULT_COORDS: Coords = { lat: 10.7769, lng: 106.7009 };

export interface CoordsResult {
  coords: Coords;
  /** true khi không lấy được vị trí thật (đang dùng DEFAULT_COORDS). */
  isFallback: boolean;
}

/** Quá thời gian này mà chưa lấy được GPS fix → dùng DEFAULT_COORDS (tránh treo định vị). */
const LOCATION_TIMEOUT_MS = 6000;

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
