'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  lng: number;
  lat: number;
  onPick: (lng: number, lat: number) => void;
}

// Pin dùng inline SVG — không phụ thuộc Material Symbols font có sẵn hay không.
// Emerald-700 (#047857) đồng bộ với brand FoodResQ.
const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`;
const pinHtml = `<div class="frq-pin"><span class="frq-pin__pulse"></span><span class="frq-pin__core">${pinSvg}</span></div>`;
const pinIcon = L.divIcon({
  className: 'frq-pin-wrapper',
  html: pinHtml,
  iconSize: [40, 40],
  iconAnchor: [20, 32],
});

/** Quản lý marker và click handler bên trong MapContainer. */
function MapContent({ lng, lat, onPick }: Props) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Tạo marker khi map sẵn sàng, dùng lat/lng initial props
  useEffect(() => {
    const marker = L.marker([lat, lng], { icon: pinIcon, draggable: true })
      .addTo(map)
      .on('dragend', (e) => {
        const p = e.target.getLatLng();
        onPickRef.current(p.lng, p.lat);
      });

    markerRef.current = marker;

    return () => {
      marker.remove();
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Cập nhật marker khi lng/lat props thay đổi
  useEffect(() => {
    if (!markerRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
  }, [lat, lng]);

  // Click handler để chọn vị trí mới
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => {
      const newLat = e.latlng.lat;
      const newLng = e.latlng.lng;
      if (markerRef.current) {
        markerRef.current.setLatLng([newLat, newLng]);
      }
      map.flyTo([newLat, newLng], map.getZoom(), { duration: 0.3 });
      onPickRef.current(newLng, newLat);
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [map]);

  return null;
}

/** Bản đồ cho phép bấm hoặc kéo ghim để chọn toạ độ chính xác. */
export default function LocationPicker({ lng, lat, onPick }: Props) {
  const mapId = useId();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div className="w-full h-full bg-neutral-100" />;
  }

  return (
    <MapContainer
      key={mapId}
      center={[lat, lng]}
      zoom={16}
      scrollWheelZoom
      className="w-full h-full relative z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <MapContent lng={lng} lat={lat} onPick={onPick} />
    </MapContainer>
  );
}
