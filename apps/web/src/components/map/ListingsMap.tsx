'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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

// Toạ độ hợp lệ: là số hữu hạn (chặn null/undefined/NaN — NaN lọt qua phép != null)
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const HCM_FALLBACK = { lat: 10.8231, lng: 106.6297 };

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
  const safeLat = isNum(center.lat) ? center.lat : HCM_FALLBACK.lat;
  const safeLng = isNum(center.lng) ? center.lng : HCM_FALLBACK.lng;

  // Fit bounds quanh tất cả listing + vị trí người dùng (chạy khi tập listing đổi)
  useEffect(() => {
    const pts: [number, number][] = listings
      .filter((l) => isNum(l.lat) && isNum(l.lng))
      .map((l) => [l.lat as number, l.lng as number]);
    pts.push([safeLat, safeLng]);
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 16 });
    } else {
      map.setView([safeLat, safeLng], 14);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings.length, safeLat, safeLng]);

  // Bay tới listing được chọn
  useEffect(() => {
    if (!selectedId) return;
    const sel = listings.find((l) => l.id === selectedId);
    if (!sel || !isNum(sel.lat) || !isNum(sel.lng)) return;
    // getZoom() có thể là NaN khi map chưa set view → ép về zoom hợp lệ (NaN zoom làm Leaflet sinh LatLng NaN)
    const cur = map.getZoom();
    const targetZoom = isNum(cur) ? Math.max(cur, 15) : 15;
    try {
      map.flyTo([sel.lat as number, sel.lng as number], targetZoom, { duration: 0.6 });
    } catch {
      map.setView([sel.lat as number, sel.lng as number], targetZoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return null;
}

export default function ListingsMap({ listings, center, selectedId, onSelect }: Props) {
  const withCoords = useMemo(
    () => listings.filter((l) => isNum(l.lat) && isNum(l.lng)),
    [listings],
  );
  const router = useRouter();
  const safeCenter: [number, number] = [
    isNum(center.lat) ? center.lat : HCM_FALLBACK.lat,
    isNum(center.lng) ? center.lng : HCM_FALLBACK.lng,
  ];

  return (
    <MapContainer
      center={safeCenter}
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
        center={safeCenter}
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
            <div style={{ minWidth: 180 }}>
              {l.imageUrls?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={l.imageUrls[0]}
                  alt={l.title}
                  style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8, marginBottom: 6 }}
                />
              )}
              <p style={{ fontWeight: 700, margin: 0 }}>{l.title}</p>
              <p style={{ margin: '2px 0', color: '#555', fontSize: 12 }}>{l.provider.businessName}</p>
              <p style={{ margin: '0 0 8px', color: '#236c2a', fontSize: 12, fontWeight: 600 }}>
                Còn {l.quantityRemaining} {l.quantityUnit} • {formatDistance(l.distanceM)}
              </p>
              <button
                onClick={() => router.push(`/listings/${l.id}`)}
                style={{
                  width: '100%', padding: '8px 0', background: '#236c2a', color: '#fff',
                  border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >
                Xem chi tiết →
              </button>
            </div>
          </Popup>
        </Marker>
      ))}

      <MapController listings={withCoords} center={center} selectedId={selectedId} />
    </MapContainer>
  );
}
