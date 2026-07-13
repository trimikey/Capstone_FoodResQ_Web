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

export default function DeliveryRouteMap({
  pickup,
  delivery,
  shipper,
}: {
  pickup?: Pt | null;
  delivery?: Pt | null;
  shipper?: Pt | null;
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

  // Fallback: đường thẳng pickup → delivery khi chưa lấy được tuyến thật
  const line: [number, number][] | null =
    route ??
    (pickup && delivery
      ? [
          [pickup.lat, pickup.lng],
          [delivery.lat, delivery.lng],
        ]
      : null);
  const points = [pickup, delivery, shipper].filter((p): p is Pt => p != null);
  const center = points[0] ?? HCMC;

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {line && <Polyline positions={line} pathOptions={{ color: '#059669', weight: 5, opacity: 0.85 }} />}
      {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pin('#236c2a', 'storefront')} />}
      {delivery && <Marker position={[delivery.lat, delivery.lng]} icon={pin('#dc2626', 'home')} />}
      {shipper && <Marker position={[shipper.lat, shipper.lng]} icon={pin('#0ea5e9', 'two_wheeler')} />}
      <FitBounds points={points} />
    </MapContainer>
  );
}
