'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  lng: number;
  lat: number;
  onPick: (lng: number, lat: number, address?: string) => void;
  address?: string;
  interactive?: boolean;
}

const interactiveDefault = true;

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
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { 'User-Agent': 'FoodResQ/1.0' } }
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

/** Reverse geocode toạ độ thành địa chỉ sử dụng Nominatim (OSM) */
export async function reverseGeocodeAddress(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'FoodResQ/1.0' } }
    );
    const data = await res.json();
    if (data && data.display_name) {
      const parts = data.display_name.split(', ');
      if (parts.length > 3) {
        return `${parts[0]}, ${parts[1]}, ${parts[parts.length - 3]}`;
      }
      return data.display_name;
    }
  } catch {
    // ignore
  }
  return null;
}

interface MapClickHandlerProps {
  onMapClick: (lng: number, lat: number) => void;
  markerPosition: [number, number];
  interactive: boolean;
}

function MapClickHandler({ onMapClick, markerPosition, interactive }: MapClickHandlerProps) {
  const markerRef = useRef<L.Marker | null>(null);
  const map = useMap();

  // Initialize marker
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.remove();
    }
    const marker = L.marker(markerPosition, { 
      icon: pinIcon, 
      draggable: interactive 
    })
      .addTo(map)
      .on('dragend', (e) => {
        if (!interactive) return;
        const p = e.target.getLatLng();
        onMapClick(p.lng, p.lat);
      });

    markerRef.current = marker;

    return () => {
      marker.remove();
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, interactive]);

  // Update marker position when markerPosition changes
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng(markerPosition);
      if (interactive) {
        map.flyTo(markerPosition, 16, { duration: 0.5 });
      }
    }
  }, [markerPosition, map, interactive]);

  // Handle map clicks
  useMapEvents({
    click: async (e) => {
      if (!interactive) {
        L.DomEvent.stopPropagation(e);
        return;
      }
      const { lat, lng } = e.latlng;
      
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      }
      map.flyTo([lat, lng], map.getZoom(), { duration: 0.3 });
      
      onMapClick(lng, lat);
    },
  });

  return null;
}

export default function LocationPicker({ lng, lat, onPick, address, interactive = interactiveDefault }: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const debounceRef = useRef<number | null>(null);
  
  const addressJustSetFromMap = useRef(false);
  const lastLngRef = useRef(lng);
  const lastLatRef = useRef(lat);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Handle map click - reverse geocode and update address
  const handleMapClick = useCallback(async (clickedLng: number, clickedLat: number) => {
    if (clickedLng === lastLngRef.current && clickedLat === lastLatRef.current) {
      return;
    }
    lastLngRef.current = clickedLng;
    lastLatRef.current = clickedLat;

    addressJustSetFromMap.current = true;
    onPick(clickedLng, clickedLat);

    if (interactive) {
      setIsReverseGeocoding(true);
      try {
        const resultAddress = await reverseGeocodeAddress(clickedLat, clickedLng);
        if (resultAddress) {
          onPick(clickedLng, clickedLat, resultAddress);
        }
      } finally {
        setIsReverseGeocoding(false);
        window.setTimeout(() => {
          addressJustSetFromMap.current = false;
        }, 100);
      }
    }
  }, [onPick, interactive]);

  // Geocoding when address changes
  useEffect(() => {
    if (addressJustSetFromMap.current) {
      return;
    }

    if (!address?.trim()) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      setIsGeocoding(true);
      try {
        const result = await geocodeAddress(address);
        if (result) {
          lastLngRef.current = result.lng;
          lastLatRef.current = result.lat;
          onPick(result.lng, result.lat, address);
        }
      } finally {
        setIsGeocoding(false);
      }
    }, 600);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [address, onPick]);

  if (!isMounted) {
    return <div className="w-full h-full bg-neutral-100" />;
  }

  return (
    <div className="relative w-full h-full">
      {(isGeocoding || isReverseGeocoding) && (
        <div className="absolute top-2 right-2 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 text-xs text-neutral-600 shadow flex items-center gap-1">
          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
          {isReverseGeocoding ? 'Đang lấy địa chỉ...' : 'Đang tìm vị trí...'}
        </div>
      )}
      <MapContainer
        key="location-picker"
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={interactive}
        dragging={interactive}
        touchZoom={interactive}
        doubleClickZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        className="w-full h-full relative z-0"
        zoomControl={interactive}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <MapClickHandler 
          onMapClick={handleMapClick} 
          markerPosition={[lat, lng]}
          interactive={interactive}
        />
      </MapContainer>
    </div>
  );
}
