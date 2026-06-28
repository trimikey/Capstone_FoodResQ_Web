import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Button, Text } from 'react-native-paper';
import { getCurrentCoords } from '../services/geolocation';

interface Props {
  /** Toạ độ khởi tạo (mặc định trung tâm TP.HCM). */
  initialLat?: number;
  initialLng?: number;
  height?: number;
  /** Gọi khi người dùng CHỦ ĐỘNG chọn vị trí (kéo ghim / chạm bản đồ / bấm GPS). */
  onPick: (lat: number, lng: number) => void;
}

/** API điều khiển map từ component cha. */
export interface MapPickerHandle {
  /** Dời ghim + recenter map theo nguồn ngoài (vd chọn gợi ý), KHÔNG bắn onPick. */
  recenter: (lat: number, lng: number) => void;
}

const DEFAULT = { lat: 10.7769, lng: 106.7009 }; // TP.HCM
const COLORS = { primary: '#10b981', outline: '#e5e7eb', onSurfaceVariant: '#6b7280' };

/** HTML Leaflet + OSM tiles: marker kéo được + chạm bản đồ để di chuyển ghim. */
function buildHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;padding:0}</style>
</head><body><div id="map"></div>
<script>
  var map = L.map('map').setView([${lat}, ${lng}], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(map);
  var marker = L.marker([${lat}, ${lng}], { draggable: true }).addTo(map);
  function send() {
    var p = marker.getLatLng();
    window.ReactNativeWebView.postMessage(JSON.stringify({ lat: p.lat, lng: p.lng }));
  }
  // Tương tác thật của user → bắn message (cha sẽ reverse geocode).
  marker.on('dragend', send);
  map.on('click', function (e) { marker.setLatLng(e.latlng); send(); });
  // RN gọi để dời ghim theo nguồn ngoài (gợi ý đã có địa chỉ) — KHÔNG bắn message.
  window.moveMarker = function (la, ln) {
    map.setView([la, ln], 16); marker.setLatLng([la, ln]);
  };
  // RN gọi sau khi lấy GPS → dời ghim VÀ bắn message (cần reverse geocode).
  window.recenterFromGps = function (la, ln) {
    map.setView([la, ln], 16); marker.setLatLng([la, ln]); send();
  };
</script></body></html>`;
}

/**
 * Bản đồ chọn vị trí (Leaflet + OSM qua WebView). Hỗ trợ:
 * - Kéo ghim / chạm bản đồ → onPick (cha tự reverse geocode).
 * - Nút "Vị trí của tôi" (GPS) → onPick.
 * - ref.recenter(lat,lng) → dời ghim im lặng (không onPick) khi cha chọn gợi ý.
 */
export const MapPicker = forwardRef<MapPickerHandle, Props>(function MapPicker(
  { initialLat, initialLng, height = 240, onPick },
  ref
) {
  const lat0 = initialLat ?? DEFAULT.lat;
  const lng0 = initialLng ?? DEFAULT.lng;
  const webRef = useRef<WebView>(null);
  const [locating, setLocating] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      recenter: (lat: number, lng: number) => {
        webRef.current?.injectJavaScript(`window.moveMarker(${lat}, ${lng}); true;`);
      },
    }),
    []
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const { lat, lng } = JSON.parse(e.nativeEvent.data);
        if (typeof lat === 'number' && typeof lng === 'number') onPick(lat, lng);
      } catch {
        // bỏ qua message không hợp lệ
      }
    },
    [onPick]
  );

  const recenterToGps = async () => {
    try {
      setLocating(true);
      const { coords } = await getCurrentCoords();
      webRef.current?.injectJavaScript(
        `window.recenterFromGps(${coords.lat}, ${coords.lng}); true;`
      );
    } finally {
      setLocating(false);
    }
  };

  return (
    <View>
      <View style={[styles.mapBox, { height }]}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html: buildHtml(lat0, lng0) }}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          style={{ flex: 1 }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.hint}>Kéo ghim hoặc chạm bản đồ để chọn vị trí cơ sở</Text>
        <Button
          mode="text"
          icon="crosshairs-gps"
          onPress={recenterToGps}
          loading={locating}
          disabled={locating}
          textColor={COLORS.primary}
          compact
        >
          Vị trí của tôi
        </Button>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  mapBox: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: '#e5e7eb',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  hint: { flex: 1, fontSize: 12, color: COLORS.onSurfaceVariant },
});
