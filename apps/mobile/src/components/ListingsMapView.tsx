import { useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Listing } from '@/hooks/useListings';

interface Props {
  listings: Listing[];
  center: { lat: number; lng: number };
  /** Gọi khi người dùng bấm "Xem chi tiết" trong popup của 1 pin. */
  onSelect: (id: string) => void;
}

const DEFAULT = { lat: 10.7769, lng: 106.7009 };
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** HTML Leaflet + OSM: vẽ vị trí người dùng + 1 pin cho mỗi listing, popup có nút xem chi tiết. */
function buildHtml(listings: Listing[], lat: number, lng: number): string {
  const pts = listings
    .filter((l) => isNum(l.lat) && isNum(l.lng))
    .map((l) => ({
      id: l.id,
      lat: l.lat,
      lng: l.lng,
      title: l.title,
      biz: l.provider?.businessName ?? '',
      remain: l.quantityRemaining,
      unit: l.quantityUnit,
      img: l.imageUrls?.[0] ?? '',
      dist: typeof l.distanceM === 'number' ? l.distanceM : null,
    }));
  const data = JSON.stringify(pts);

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;padding:0}.pin div{box-shadow:0 2px 6px rgba(0,0,0,.3)}</style>
</head><body><div id="map"></div>
<script>
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fmtDist(m){ if(m==null) return ''; return m>=1000 ? (m/1000).toFixed(1)+' km' : Math.round(m)+' m'; }
  var user = [${lat}, ${lng}];
  var map = L.map('map').setView(user, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  L.circleMarker(user, { radius: 8, color: '#fff', weight: 3, fillColor: '#10b981', fillOpacity: 1 }).addTo(map).bindPopup('Vị trí của bạn');
  function pinIcon(){ return L.divIcon({ className:'pin', html:'<div style="width:32px;height:32px;border-radius:9999px;background:#10b981;display:flex;align-items:center;justify-content:center;border:3px solid #fff;font-size:16px">🍽️</div>', iconSize:[32,32], iconAnchor:[16,16] }); }
  var items = ${data};
  var bounds = [user];
  items.forEach(function(it){
    var m = L.marker([it.lat, it.lng], { icon: pinIcon() }).addTo(map);
    bounds.push([it.lat, it.lng]);
    var d = fmtDist(it.dist);
    var html = '<div style="min-width:170px">'
      + (it.img ? '<img src="'+encodeURI(it.img)+'" style="width:100%;height:84px;object-fit:cover;border-radius:6px;margin-bottom:6px"/>' : '')
      + '<div style="font-weight:700;font-size:14px">'+esc(it.title)+'</div>'
      + '<div style="color:#6b7280;font-size:12px;margin:2px 0">'+esc(it.biz)+'</div>'
      + '<div style="color:#10b981;font-size:12px;font-weight:600;margin-bottom:6px">Còn '+esc(it.remain)+' '+esc(it.unit)+(d?' • '+d:'')+'</div>'
      + '<button onclick="sel(\\''+it.id+'\\')" style="width:100%;padding:7px 0;background:#10b981;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:13px">Xem chi tiết →</button>'
      + '</div>';
    m.bindPopup(html);
  });
  window.sel = function(id){ window.ReactNativeWebView.postMessage(id); };
  if (bounds.length > 1) { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 }); }
</script></body></html>`;
}

/** Bản đồ khám phá: hiển thị các listing gần đây dạng pin trên Leaflet (WebView). */
export function ListingsMapView({ listings, center, onSelect }: Props) {
  const lat = isNum(center?.lat) ? center.lat : DEFAULT.lat;
  const lng = isNum(center?.lng) ? center.lng : DEFAULT.lng;

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const id = e.nativeEvent.data;
      if (id) onSelect(id);
    },
    [onSelect]
  );

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html: buildHtml(listings, lat, lng) }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        style={{ flex: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e5e7eb' },
});
