'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ListingItem } from '@/components/listings/ListingCard';

interface Props {
  listings: ListingItem[];
  center: { lng: number; lat: number };
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// Marker dạng HTML (divIcon) để không phụ thuộc asset ảnh mặc định của Leaflet (hay vỡ khi bundle)
function pinIcon(active: boolean) {
  const bg = active ? '#b45309' : '#236c2a';
  const size = active ? 40 : 32;
  return L.divIcon({
    className: 'foodresq-pin',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:9999px;background:${bg};
      display:flex;align-items:center;justify-content:center;color:#fff;
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);
      font-family:'Material Symbols Outlined';font-size:${active ? 20 : 16}px;
      transition:all .2s;">restaurant</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Điều khiển map: bay tới marker đang chọn + fit bounds lần đầu
function MapController({
  listings,
  center,
  selectedId,
}: {
  listings: ListingItem[];
  center: { lng: number; lat: number };
  selectedId: string | null;
}) {
  const map = useMap();

  // Fit bounds quanh tất cả listing + vị trí người dùng (chạy khi tập listing đổi)
  useEffect(() => {
    const pts: [number, number][] = listings
      .filter((l) => l.lat != null && l.lng != null)
      .map((l) => [l.lat as number, l.lng as number]);
    pts.push([center.lat, center.lng]);
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 16 });
    } else {
      map.setView([center.lat, center.lng], 14);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings.length, center.lat, center.lng]);

  // Bay tới listing được chọn
  useEffect(() => {
    const sel = listings.find((l) => l.id === selectedId);
    if (sel?.lat != null && sel?.lng != null) {
      map.flyTo([sel.lat, sel.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return null;
}

export default function ListingsMap({ listings, center, selectedId, onSelect }: Props) {
  const withCoords = useMemo(
    () => listings.filter((l) => l.lat != null && l.lng != null),
    [listings],
  );

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={14}
      scrollWheelZoom
      className="w-full h-full"
      style={{ background: '#e3e1dc' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Vị trí người dùng */}
      <CircleMarker
        center={[center.lat, center.lng]}
        radius={8}
        pathOptions={{ color: '#fff', weight: 3, fillColor: '#236c2a', fillOpacity: 1 }}
      >
        <Popup>Vị trí của bạn</Popup>
      </CircleMarker>

      {withCoords.map((l) => (
        <Marker
          key={l.id}
          position={[l.lat as number, l.lng as number]}
          icon={pinIcon(l.id === selectedId)}
          eventHandlers={{ click: () => onSelect(l.id) }}
          zIndexOffset={l.id === selectedId ? 1000 : 0}
        >
          <Popup>
            <div style={{ minWidth: 160 }}>
              <p style={{ fontWeight: 700, margin: 0 }}>{l.title}</p>
              <p style={{ margin: '2px 0', color: '#555', fontSize: 12 }}>{l.provider.businessName}</p>
              <p style={{ margin: 0, color: '#236c2a', fontSize: 12, fontWeight: 600 }}>
                Còn {l.quantityRemaining} {l.quantityUnit} • {formatDistance(l.distanceM)}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}

      <MapController listings={withCoords} center={center} selectedId={selectedId} />
    </MapContainer>
  );
}
