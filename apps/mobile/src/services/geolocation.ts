import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lng: number;
}

/** Chỉ dùng để canh viewport bản đồ khi chưa có GPS, tuyệt đối không gửi lên API. */
export const DEFAULT_MAP_COORDS: Coords = { lat: 10.7769, lng: 106.7009 };

export const DEFAULT_LOCATION_LABEL = 'Chưa xác định vị trí';

export interface CoordsResult {
  coords: Coords | null;
  /** true khi không lấy được vị trí thật. */
  isFallback: boolean;
}

/** Cho GPS thiết bị thật đủ thời gian lấy fix đầu tiên, nhất là khi vừa bật định vị. */
const LOCATION_TIMEOUT_MS = 20_000;

function isValidCoords(coords: Coords): boolean {
  return Number.isFinite(coords.lat)
    && Number.isFinite(coords.lng)
    && coords.lat >= -90
    && coords.lat <= 90
    && coords.lng >= -180
    && coords.lng <= 180;
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

    if (!(await Location.hasServicesEnabledAsync())) {
      return { coords: null, isFallback: true };
    }

    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('location-timeout')), LOCATION_TIMEOUT_MS),
      ),
    ]);

    // Android đánh dấu vị trí đến từ mock-location provider bằng `mocked=true`.
    // Không dùng kết quả này khi chạy kiểm thử trên thiết bị thật.
    if (pos.mocked === true) {
      return { coords: null, isFallback: true };
    }

    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (!isValidCoords(coords)) {
      return { coords: null, isFallback: true };
    }

    return {
      coords,
      isFallback: false,
    };
  } catch {
    return { coords: null, isFallback: true };
  }
}
