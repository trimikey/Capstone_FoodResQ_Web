import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { mobileColors as COLORS, elevation, radius } from '@/theme/design';

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  /** Điểm lấy hàng (nhà cung cấp). */
  pickup?: LatLng | null;
  /** Điểm giao hàng (người nhận). */
  dropoff?: LatLng | null;
  /** Vị trí shipper hiện tại (tuỳ chọn). */
  shipper?: LatLng | null;
  /** Chiều cao bản đồ. Mặc định 160. */
  height?: number;
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const valid = (p?: LatLng | null): p is LatLng => !!p && isNum(p.lat) && isNum(p.lng);

/**
 * Bản đồ tuyến giao hàng (Leaflet + OSM trong WebView) — vẽ pin điểm lấy hàng,
 * điểm giao và vị trí shipper, nối bằng đường nét đứt. Tái dùng pattern Leaflet
 * của ListingsMapView. Không phụ thuộc react-native-maps.
 */
function buildHtml(pickup?: LatLng | null, dropoff?: LatLng | null, shipper?: LatLng | null): string {
  const markers: { lat: number; lng: number; color: string; code: string; label: string }[] = [];
  if (valid(pickup)) markers.push({ ...pickup, color: '#f26a3d', code: 'P', label: 'Điểm lấy hàng' });
  if (valid(dropoff)) markers.push({ ...dropoff, color: '#256f46', code: 'D', label: 'Điểm giao hàng' });
  if (valid(shipper)) markers.push({ ...shipper, color: '#2563eb', code: 'S', label: 'Bạn' });

  const data = JSON.stringify(markers);
  const fallback = markers[0] ?? { lat: 10.7769, lng: 106.7009 };

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#eef3ea}
  .leaflet-tile{filter:saturate(.86) contrast(.96)}
  .pin div{box-shadow:0 10px 22px rgba(16,44,34,.28);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:900;color:#fff}
</style>
</head><body><div id="map"></div>
<script>
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  var map = L.map('map',{zoomControl:false,attributionControl:false}).setView([${fallback.lat}, ${fallback.lng}], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  function pinIcon(color, code){ return L.divIcon({ className:'pin', html:'<div style="width:34px;height:34px;border-radius:9999px;background:'+color+';display:flex;align-items:center;justify-content:center;border:3px solid #fff;font-size:13px">'+code+'</div>', iconSize:[34,34], iconAnchor:[17,17] }); }
  var items = ${data};
  var bounds = [];
  items.forEach(function(it){
    var m = L.marker([it.lat, it.lng], { icon: pinIcon(it.color, it.code) }).addTo(map);
    m.bindPopup('<b>'+esc(it.label)+'</b>');
    bounds.push([it.lat, it.lng]);
  });
  if (bounds.length >= 2) {
    L.polyline(bounds, { color:'#256f46', weight:4, dashArray:'8,8', opacity:0.76 }).addTo(map);
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 15);
  }
</script></body></html>`;
}

export function DeliveryRouteMap({ pickup, dropoff, shipper, height = 160 }: Props) {
  if (!valid(pickup) && !valid(dropoff) && !valid(shipper)) return null;
  return (
    <View style={[styles.container, { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: buildHtml(pickup, dropoff, shipper) }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        style={{ flex: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
});
