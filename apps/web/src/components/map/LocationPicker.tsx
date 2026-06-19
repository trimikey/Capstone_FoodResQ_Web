'use client';

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  lng: number;
  lat: number;
  onPick: (lng: number, lat: number) => void;
}

const pin = L.divIcon({
  className: 'foodresq-pin',
  html: `<div style="width:34px;height:34px;border-radius:9999px;background:#236c2a;display:flex;align-items:center;justify-content:center;color:#fff;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);font-family:'Material Symbols Outlined';font-size:18px;">storefront</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function ClickHandler({ onPick }: { onPick: (lng: number, lat: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lng, e.latlng.lat);
    },
  });
  return null;
}

/** Bản đồ cho phép bấm để chọn toạ độ điểm lấy hàng. */
export default function LocationPicker({ lng, lat, onPick }: Props) {
  return (
    <MapContainer center={[lat, lng]} zoom={14} scrollWheelZoom className="w-full h-full">
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]} icon={pin} />
      <ClickHandler onPick={onPick} />
    </MapContainer>
  );
}
