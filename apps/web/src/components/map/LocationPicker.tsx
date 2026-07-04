'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import type { Marker as LeafletMarker } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  lng: number;
  lat: number;
  onPick: (lng: number, lat: number) => void;
}

const pin = L.divIcon({
  className: 'foodresq-pin',
  html: `<div style="width:34px;height:34px;border-radius:9999px;background:#236c2a;display:flex;align-items:center;justify-content:center;color:#fff;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);font-family:'Material Symbols Outlined';font-size:18px;cursor:grab;">location_on</div>`,
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

// Đồng bộ tâm bản đồ khi toạ độ đổi từ bên ngoài (vd: bấm nút định vị GPS)
function Recenter({ lng, lat }: { lng: number; lat: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [map, lat, lng]);
  return null;
}

/** Bản đồ cho phép bấm hoặc kéo ghim để chọn toạ độ chính xác. */
export default function LocationPicker({ lng, lat, onPick }: Props) {
  const markerRef = useRef<LeafletMarker | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const dragHandlers = useMemo(
    () => ({
      dragend() {
        const m = markerRef.current;
        if (m) {
          const p = m.getLatLng();
          onPick(p.lng, p.lat);
        }
      },
    }),
    [onPick],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div className="w-full h-full bg-neutral-100" />;
  }

  return (
    <MapContainer key={`${lat.toFixed(6)}-${lng.toFixed(6)}`} center={[lat, lng]} zoom={16} scrollWheelZoom className="w-full h-full">
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker
        position={[lat, lng]}
        icon={pin}
        draggable
        eventHandlers={dragHandlers}
        ref={markerRef}
      />
      <ClickHandler onPick={onPick} />
      <Recenter lng={lng} lat={lat} />
    </MapContainer>
  );
}
