'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Pt = { lat: number; lng: number };

// Default map center: Ho Chi Minh City (rule 3.5)
const HCMC: Pt = { lat: 10.8231, lng: 106.6297 };

// Marker HTML (divIcon) — không phụ thuộc asset ảnh mặc định của Leaflet
function pin(color: string, glyph: string, size = 34) {
  return L.divIcon({
    className: 'foodresq-route-pin',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:9999px;background:${color};
      display:flex;align-items:center;justify-content:center;color:#fff;
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);
      font-family:'Material Symbols Outlined';font-size:18px;">${glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ points }: { points: Pt[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    const b = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(b, { padding: [40, 40], maxZoom: 15 });
  }, [map, points]);
  return null;
}

// Marker số thứ tự cho điểm phát trên tuyến giao sỉ (xanh khi đã phát, cam khi chưa)
function stopPin(index: number, served: boolean) {
  return L.divIcon({
    className: 'foodresq-stop-pin',
    html: `<div style="
      width:30px;height:30px;border-radius:9999px;background:${served ? '#059669' : '#f59e0b'};
      display:flex;align-items:center;justify-content:center;color:#fff;
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);
      font-weight:800;font-size:13px;font-family:sans-serif;">${index}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export type RouteStop = Pt & { served?: boolean };

export default function DeliveryRouteMap({
  pickup,
  delivery,
  shipper,
  stops,
}: {
  pickup?: Pt | null;
  delivery?: Pt | null;
  shipper?: Pt | null;
  /** Điểm phát trên tuyến giao sỉ — vẽ marker đánh số + nối tuyến pickup → các điểm theo thứ tự. */
  stops?: RouteStop[];
}) {
  const [route, setRoute] = useState<[number, number][] | null>(null);

  // Chỉ gọi Directions khi có đủ 2 đầu tuyến
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !pickup || !delivery) return;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${pickup.lng},${pickup.lat};${delivery.lng},${delivery.lat}?geometries=geojson&overview=full&access_token=${token}`;
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const coords = d?.routes?.[0]?.geometry?.coordinates;
        if (!cancelled && Array.isArray(coords)) {
          setRoute(coords.map((c: [number, number]) => [c[1], c[0]])); // [lng,lat] → [lat,lng]
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pickup?.lat, pickup?.lng, delivery?.lat, delivery?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tuyến giao sỉ: nối pickup → các điểm phát theo thứ tự (đường thẳng nối điểm)
  const stopLine: [number, number][] | null =
    stops && stops.length > 0
      ? [...(pickup ? [[pickup.lat, pickup.lng] as [number, number]] : []), ...stops.map((s) => [s.lat, s.lng] as [number, number])]
      : null;

  // Fallback: đường thẳng pickup → delivery khi chưa lấy được tuyến thật
  const line: [number, number][] | null =
    stopLine ??
    route ??
    (pickup && delivery
      ? [
          [pickup.lat, pickup.lng],
          [delivery.lat, delivery.lng],
        ]
      : null);
  const points = [pickup, delivery, shipper, ...(stops ?? [])].filter((p): p is Pt => p != null);
  const center = points[0] ?? HCMC;

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
      // z-0: nhốt z-index nội bộ của Leaflet để không đè lên modal của trang
      className="relative z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {line && <Polyline positions={line} pathOptions={{ color: '#059669', weight: 5, opacity: 0.85 }} />}
      {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pin('#236c2a', 'storefront')} />}
      {delivery && <Marker position={[delivery.lat, delivery.lng]} icon={pin('#dc2626', 'home')} />}
      {shipper && <Marker position={[shipper.lat, shipper.lng]} icon={pin('#0ea5e9', 'two_wheeler')} />}
      {(stops ?? []).map((s, i) => (
        <Marker key={`${s.lat}-${s.lng}-${i}`} position={[s.lat, s.lng]} icon={stopPin(i + 1, !!s.served)} />
      ))}
      <FitBounds points={points} />
    </MapContainer>
  );
}
