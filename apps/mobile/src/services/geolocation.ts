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

/**
 * Lấy toạ độ hiện tại qua expo-location. Xin quyền foreground;
 * nếu bị từ chối hoặc lỗi → trả DEFAULT_COORDS kèm isFallback=true (không ném lỗi).
 * Docs: https://docs.expo.dev/versions/latest/sdk/location/
 */
export async function getCurrentCoords(): Promise<CoordsResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { coords: DEFAULT_COORDS, isFallback: true };
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      isFallback: false,
    };
  } catch {
    return { coords: DEFAULT_COORDS, isFallback: true };
  }
}
