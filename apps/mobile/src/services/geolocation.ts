export interface Coords {
  lat: number;
  lng: number;
}

/** Fallback: trung tâm TP.HCM (dùng khi từ chối quyền vị trí). */
export const DEFAULT_COORDS: Coords = { lat: 10.7769, lng: 106.7009 };

/**
 * TODO [T2.1]: cài `expo-location` (`npx expo install expo-location`),
 * xin quyền foreground, trả toạ độ thật. Hiện trả fallback HCM để các hook compile.
 *
 *   const { status } = await Location.requestForegroundPermissionsAsync();
 *   if (status !== 'granted') return DEFAULT_COORDS;
 *   const pos = await Location.getCurrentPositionAsync();
 *   return { lat: pos.coords.latitude, lng: pos.coords.longitude };
 */
export async function getCurrentCoords(): Promise<Coords> {
  return DEFAULT_COORDS;
}
