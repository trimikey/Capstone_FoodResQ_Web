'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { reverseGeocode } from '@/lib/geocode';

const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-neutral-100 animate-pulse" />,
});

export interface BulkStopInput {
  label: string;
  address?: string;
  lng: number;
  lat: number;
  plannedQty?: number;
}

interface Props {
  busy: boolean;
  onAdd: (p: BulkStopInput) => void;
  onClose: () => void;
  /**
   * Toạ độ mở bản đồ ban đầu — thường là điểm lấy hàng. Có giá trị thì bản đồ hiện
   * ngay để chọn, không phải bấm định vị trước (nhà cung cấp ngồi tại cửa hàng
   * không dùng GPS của mình để ghim điểm phát ở nơi khác được).
   */
  defaultCoords?: { lng: number; lat: number } | null;
  title?: string;
}

/**
 * Form ghim điểm phát dùng chung cho shipper và nhà cung cấp.
 * Luôn phải chọn được vị trí thật trên bản đồ — nhãn suông không đủ để đi giao.
 */
export default function BulkStopForm({
  busy,
  onAdd,
  onClose,
  defaultCoords = null,
  title = 'Ghim điểm phát mới',
}: Props) {
  const [label, setLabel] = useState('');
  const [plannedQty, setPlannedQty] = useState('');
  const [coords, setCoords] = useState<{ lng: number; lat: number } | null>(defaultCoords);
  const [address, setAddress] = useState('');
  const [locating, setLocating] = useState(false);

  const useGps = () => {
    if (!navigator.geolocation) return toast.error('Trình duyệt không hỗ trợ định vị.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const c = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setCoords(c);
        setAddress((await reverseGeocode(c.lat, c.lng)) ?? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
        setLocating(false);
      },
      () => {
        toast.error('Không lấy được vị trí.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="bg-white border border-emerald-200 rounded-2xl p-4 space-y-3">
      <p className="text-sm font-bold text-neutral-800">{title}</p>

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Tên điểm phát (vd: Chân cầu Sài Gòn, KTX khu B)"
        className="w-full border border-neutral-200 rounded-xl p-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />

      <div className="flex gap-2">
        <input
          value={plannedQty}
          onChange={(e) => setPlannedQty(e.target.value.replace(/\D/g, ''))}
          placeholder="Số phần dự kiến (tuỳ chọn)"
          inputMode="numeric"
          className="flex-1 border border-neutral-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={useGps}
          disabled={locating}
          className="shrink-0 px-3 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 disabled:opacity-50"
          title="Dùng vị trí hiện tại của tôi"
        >
          <span className={`material-symbols-outlined text-[20px] ${locating ? 'animate-pulse' : ''}`}>
            my_location
          </span>
        </button>
      </div>

      {coords ? (
        <>
          <div className="h-44 rounded-xl overflow-hidden border border-neutral-200">
            <LocationPicker
              lng={coords.lng}
              lat={coords.lat}
              onPick={(lng, lat) => {
                setCoords({ lng, lat });
                void reverseGeocode(lat, lng).then((a) => a && setAddress(a));
              }}
            />
          </div>
          <p className="text-[11px] text-neutral-500">
            {address || 'Bấm lên bản đồ để chỉnh vị trí chính xác.'}
          </p>
        </>
      ) : (
        <p className="text-[11px] text-amber-600 font-semibold">
          Bấm nút định vị để ghim vị trí điểm phát.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-2 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-50"
        >
          Đóng
        </button>
        <button
          onClick={() => {
            if (!label.trim()) return toast.error('Nhập tên điểm phát.');
            if (!coords) return toast.error('Chưa ghim vị trí trên bản đồ.');
            onAdd({
              label: label.trim(),
              address: address || undefined,
              lng: coords.lng,
              lat: coords.lat,
              plannedQty: plannedQty ? Number(plannedQty) : undefined,
            });
          }}
          disabled={busy}
          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
        >
          {busy ? 'Đang thêm...' : 'Thêm điểm phát'}
        </button>
      </div>
    </div>
  );
}
