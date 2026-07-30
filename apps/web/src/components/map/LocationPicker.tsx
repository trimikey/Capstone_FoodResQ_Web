'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  lng: number;
  lat: number;
  onPick: (lng: number, lat: number) => void;
  address?: string;
}

const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`;
const pinHtml = `<div class="frq-pin"><span class="frq-pin__pulse"></span><span class="frq-pin__core">${pinSvg}</span></div>`;
const pinIcon = L.divIcon({
  className: 'frq-pin-wrapper',
  html: pinHtml,
  iconSize: [40, 40],
  iconAnchor: [20, 32],
});

/** Geocode địa chỉ thành toạ độ sử dụng Nominatim (OSM) */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address?.trim()) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
    );
    const data = await res.json();
    if (data && data[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    // ignore
  }
  return null;
}

function MapContent({ lng, lat, onPick }: Props) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

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

  useEffect(() => {
    if (!markerRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    map.flyTo([lat, lng], 16, { duration: 0.5 });
  }, [lat, lng, map]);

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

export default function LocationPicker({ lng, lat, onPick, address }: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Geocoding khi address thay đổi
  useEffect(() => {
    if (!address?.trim()) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsGeocoding(true);
      const result = await geocodeAddress(address);
      if (result) {
        onPick(result.lng, result.lat);
      }
      setIsGeocoding(false);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [address, onPick]);

  if (!isMounted) {
    return <div className="w-full h-full bg-neutral-100" />;
  }

  const mapKey = `${lat.toFixed(5)}-${lng.toFixed(5)}`;

  return (
    <div className="relative w-full h-full">
      {isGeocoding && (
        <div className="absolute top-2 right-2 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 text-xs text-neutral-600 shadow flex items-center gap-1">
          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
          Tìm vị trí...
        </div>
      )}
      <MapContainer
        key={mapKey}
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
    </div>
  );
}
