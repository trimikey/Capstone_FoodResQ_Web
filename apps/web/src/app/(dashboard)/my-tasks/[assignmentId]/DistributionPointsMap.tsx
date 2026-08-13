'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Bản đồ CHỈ ĐỌC các điểm phát của một đợt.
 *
 * Khác `LocationPicker` (chọn/kéo ghim để nhập toạ độ) — ở đây shipper chỉ cần nhìn
 * các điểm nằm đâu so với nhau, nên bỏ hết tương tác chỉnh sửa và tự khớp khung nhìn
 * vừa đủ chứa mọi điểm.
 */

interface Point {
  label: string;
  address: string;
  lng: number;
  lat: number;
}

function numberedIcon(n: number) {
  return L.divIcon({
    className: 'frq-num-pin',
    html: `<div style="
      width:26px;height:26px;border-radius:999px;background:#047857;color:#fff;
      display:flex;align-items:center;justify-content:center;font:700 12px/1 system-ui;
      box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff;">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function Markers({ points }: { points: Point[] }) {
  const map = useMap();

  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    points.forEach((p, i) => {
      L.marker([p.lat, p.lng], { icon: numberedIcon(i + 1) })
        .bindPopup(`<b>${p.label}</b><br/>${p.address}`)
        .addTo(layer);
    });

    // Khớp khung nhìn vừa đủ mọi điểm; một điểm thì chỉ cần zoom tới nó.
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), {
        padding: [30, 30],
        maxZoom: 16,
      });
    }

    return () => {
      layer.remove();
    };
  }, [map, points]);

  return null;
}

export default function DistributionPointsMap({ points }: { points: Point[] }) {
  if (points.length === 0) return null;
  return (
    <MapContainer
      center={[points[0].lat, points[0].lng]}
      zoom={15}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <Markers points={points} />
    </MapContainer>
  );
}
