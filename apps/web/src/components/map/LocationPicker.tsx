'use client';

import { useEffect, useId, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
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

// Lắng nghe click trực tiếp trên container DOM (qua Leaflet internal handler)
// để tránh trường hợp useMapEvents không nhận event khi nằm trong modal/Dialog
// có stacking context hoặc pointer-events đặc biệt.
function ClickHandler({ onPick }: { onPick: (lng: number, lat: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => {
      map.flyTo([e.latlng.lat, e.latlng.lng], map.getZoom(), { duration: 0.3 });
      onPick(e.latlng.lng, e.latlng.lat);
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [map, onPick]);
  return null;
}

// Đồng bộ tâm bản đồ khi toạ độ đổi từ bên ngoài (vd: bấm nút định vị GPS).
// KHÔNG can thiệp vào thao tác click/drag của user trên map — chỉ pan khi
// parent chủ động set toạ độ mới khác xa tâm hiện tại (>50m).
function Recenter({ lng, lat }: { lng: number; lat: number }) {
  const map = useMap();
  useEffect(() => {
    const c = map.getCenter();
    if (Math.abs(c.lat - lat) > 0.0005 || Math.abs(c.lng - lng) > 0.0005) {
      map.setView([lat, lng], map.getZoom());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, lat, lng]);
  return null;
}

/** Bản đồ cho phép bấm hoặc kéo ghim để chọn toạ độ chính xác. */
export default function LocationPicker({ lng, lat, onPick }: Props) {
  // useId() đảm bảo mỗi lần mount (vd: mở/đóng modal) tạo key hoàn toàn mới,
  // tránh việc Leaflet "tái sử dụng" DOM cũ với instance cũ, dẫn đến click/drag
  // bị nuốt bởi handler của instance trước.
  const mapId = useId();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div className="w-full h-full bg-neutral-100" />;
  }

  return (
    // relative z-0: tạo stacking context để pane/control của Leaflet (z-index 400–1000)
    // không tràn ra ngoài đè lên modal của trang (modal thường chỉ z-50).
    // Key duy nhất mỗi mount: nếu parent dùng key gắn lat/lng hoặc key cố định, Leaflet
    // sẽ cố tái sử dụng DOM cũ đã bị React clear → "Map container is being reused".
    // Pan bản đồ được <Recenter /> xử lý ở dưới.
    <MapContainer key={mapId} center={[lat, lng]} zoom={16} scrollWheelZoom className="w-full h-full relative z-0">
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker
        position={[lat, lng]}
        icon={pin}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const m = e.target as L.Marker;
            const p = m.getLatLng();
            onPick(p.lng, p.lat);
          },
        }}
      />
      <ClickHandler onPick={onPick} />
      <Recenter lng={lng} lat={lat} />
    </MapContainer>
  );
}
