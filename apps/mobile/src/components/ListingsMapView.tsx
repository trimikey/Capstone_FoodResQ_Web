import { memo, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Listing } from '@/hooks/useListings';

interface Props {
  listings: Listing[];
  center: { lat: number; lng: number };
  route?: DeliveryMapRoute | null;
  /** Gọi khi người dùng bấm "Xem chi tiết" trong popup của 1 pin. */
  onSelect: (id: string) => void;
}

export interface DeliveryMapRoute {
  pickup?: { lat: number; lng: number; label: string } | null;
  dropoff?: { lat: number; lng: number; label: string } | null;
}

const DEFAULT = { lat: 10.7769, lng: 106.7009 };
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** HTML Leaflet + OSM: vẽ vị trí người dùng + 1 pin cho mỗi listing, popup có nút xem chi tiết. */
function buildHtml(listings: Listing[], lat: number, lng: number, route?: DeliveryMapRoute | null): string {
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
  const routeData = JSON.stringify({
    pickup: route?.pickup && isNum(route.pickup.lat) && isNum(route.pickup.lng) ? route.pickup : null,
    dropoff: route?.dropoff && isNum(route.dropoff.lat) && isNum(route.dropoff.lng) ? route.dropoff : null,
  });

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{height:100%;margin:0;padding:0}
  .pin div{box-shadow:0 3px 10px rgba(0,0,0,.28)}
  .route-pin{width:34px;height:34px;border-radius:9999px;border:3px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;box-shadow:0 4px 12px rgba(18,28,42,.28)}
  .pickup-pin{background:#f26a3d}
  .dropoff-pin{background:#256f46}
  .provider-pin{width:30px;height:30px;border-radius:9999px;background:#10b981;border:3px solid #fff;position:relative}
  .provider-pin:before{content:"";position:absolute;inset:8px;border-radius:9999px;background:#fff}
  .provider-pin:after{content:"";position:absolute;left:7px;right:7px;bottom:6px;height:2px;border-radius:9999px;background:#fff}
</style>
</head><body><div id="map"></div>
<script>
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fmtDist(m){ if(m==null) return ''; return m>=1000 ? (m/1000).toFixed(1)+' km' : Math.round(m)+' m'; }
  var user = [${lat}, ${lng}];
  var map = L.map('map', {
    zoomControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false
  }).setView(user, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  L.circleMarker(user, { radius: 8, color: '#fff', weight: 3, fillColor: '#10b981', fillOpacity: 1 }).addTo(map).bindPopup('Vị trí của bạn');
  function routeIcon(className, label){ return L.divIcon({ className:'pin', html:'<div class="route-pin '+className+'">'+label+'</div>', iconSize:[34,34], iconAnchor:[17,17] }); }
  function pinIcon(){ return L.divIcon({ className:'pin', html:'<div class="provider-pin"></div>', iconSize:[30,30], iconAnchor:[15,15] }); }
  var items = ${data};
  var route = ${routeData};
  var bounds = [user];
  var routeLine = [];
  if (route.pickup) {
    var p = [route.pickup.lat, route.pickup.lng];
    L.marker(p, { icon: routeIcon('pickup-pin', 'L') }).addTo(map).bindPopup('<b>Điểm lấy</b><br>'+esc(route.pickup.label));
    bounds.push(p);
    routeLine.push(p);
  }
  if (route.dropoff) {
    var dpo = [route.dropoff.lat, route.dropoff.lng];
    L.marker(dpo, { icon: routeIcon('dropoff-pin', 'G') }).addTo(map).bindPopup('<b>Điểm giao</b><br>'+esc(route.dropoff.label));
    bounds.push(dpo);
    routeLine.push(dpo);
  }
  if (routeLine.length > 1) {
    L.polyline(routeLine, { color: '#256f46', weight: 4, opacity: 0.72, dashArray: '8,8' }).addTo(map);
  }
  items.forEach(function(it){
    if (route.pickup && Math.abs(it.lat - route.pickup.lat) < 0.00001 && Math.abs(it.lng - route.pickup.lng) < 0.00001) return;
    var m = L.marker([it.lat, it.lng], { icon: pinIcon() }).addTo(map);
    bounds.push([it.lat, it.lng]);
    var d = fmtDist(it.dist);
    var html = '<div style="min-width:170px">'
      + (it.img ? '<img src="'+encodeURI(it.img)+'" style="width:100%;height:84px;object-fit:cover;border-radius:6px;margin-bottom:6px"/>' : '')
      + '<div style="font-weight:700;font-size:14px">'+esc(it.title)+'</div>'
      + '<div style="color:#6b7280;font-size:12px;margin:2px 0">'+esc(it.biz)+'</div>'
      + '<div style="color:#10b981;font-size:12px;font-weight:600;margin-bottom:6px">Còn '+esc(it.remain)+' '+esc(it.unit)+(d?' · '+d:'')+'</div>'
      + '<button onclick="sel(\\''+it.id+'\\')" style="width:100%;padding:7px 0;background:#10b981;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:13px">Xem chi tiết</button>'
      + '</div>';
    m.bindPopup(html);
  });
  window.sel = function(id){ window.ReactNativeWebView.postMessage(id); };
  if (bounds.length > 1) { map.fitBounds(bounds, { padding: [30, 30], maxZoom: route.pickup || route.dropoff ? 15 : 14 }); }
</script></body></html>`;
}

/** Bản đồ khám phá: hiển thị các listing gần đây dạng pin trên Leaflet (WebView). */
function ListingsMapViewBase({ listings, center, route, onSelect }: Props) {
  const lat = isNum(center?.lat) ? center.lat : DEFAULT.lat;
  const lng = isNum(center?.lng) ? center.lng : DEFAULT.lng;
  const html = useMemo(() => buildHtml(listings, lat, lng, route), [lat, lng, listings, route]);
  const source = useMemo(() => ({ html }), [html]);

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
        source={source}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        style={styles.webview}
      />
    </View>
  );
}

function sameListings(a: Listing[], b: Listing[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const next = b[index];
    return (
      item.id === next.id &&
      item.lat === next.lat &&
      item.lng === next.lng &&
      item.title === next.title &&
      item.quantityRemaining === next.quantityRemaining &&
      item.quantityUnit === next.quantityUnit &&
      item.distanceM === next.distanceM &&
      item.imageUrls?.[0] === next.imageUrls?.[0] &&
      item.provider?.businessName === next.provider?.businessName
    );
  });
}

export const ListingsMapView = memo(ListingsMapViewBase, (prev, next) => (
  prev.center.lat === next.center.lat &&
  prev.center.lng === next.center.lng &&
  sameRoute(prev.route, next.route) &&
  prev.onSelect === next.onSelect &&
  sameListings(prev.listings, next.listings)
));

function sameRoute(a?: DeliveryMapRoute | null, b?: DeliveryMapRoute | null) {
  if (a === b) return true;
  return (
    a?.pickup?.lat === b?.pickup?.lat &&
    a?.pickup?.lng === b?.pickup?.lng &&
    a?.pickup?.label === b?.pickup?.label &&
    a?.dropoff?.lat === b?.dropoff?.lat &&
    a?.dropoff?.lng === b?.dropoff?.lng &&
    a?.dropoff?.label === b?.dropoff?.label
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e5e7eb' },
  webview: { flex: 1 },
});
