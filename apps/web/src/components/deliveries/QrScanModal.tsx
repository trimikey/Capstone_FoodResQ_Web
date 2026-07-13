'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';

/**
 * Modal quét mã QR của người nhận (bàn giao đúng người khi hoàn tất giao hàng).
 * Có ô nhập tay dự phòng khi thiết bị không có camera / camera lỗi.
 */
export default function QrScanModal({
  title,
  hint,
  busy,
  onResult,
  onClose,
}: {
  title: string;
  hint?: string;
  busy?: boolean;
  onResult: (token: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handledRef = useRef(false); // chỉ xử lý 1 mã / phiên quét
  const [cameraError, setCameraError] = useState(false);
  const [manualToken, setManualToken] = useState('');

  // Bật camera sau khi <video> mount; hoãn 1 nhịp để tránh Strict Mode đòi camera 2 lần
  useEffect(() => {
    let cancelled = false;
    let controls: IScannerControls | null = null;
    const timer = setTimeout(() => {
      const reader = new BrowserQRCodeReader();
      reader
        .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (res, _err, c) => {
          if (res && !handledRef.current) {
            handledRef.current = true;
            c.stop();
            onResult(res.getText().trim());
          }
        })
        .then((c) => {
          if (cancelled) c.stop();
          else controls = c;
        })
        .catch(() => setCameraError(true));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-emerald-600 text-white px-5 py-4 flex items-center justify-between">
          <span className="flex items-center gap-2 font-extrabold">
            <span className="material-symbols-outlined">qr_code_scanner</span>
            {title}
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/15" aria-label="Đóng">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5 space-y-4">
          {hint && <p className="text-sm text-neutral-600">{hint}</p>}

          {cameraError ? (
            <div className="bg-neutral-100 rounded-2xl p-6 text-center text-sm text-neutral-500">
              <span className="material-symbols-outlined text-[32px] block mb-1">videocam_off</span>
              Không mở được camera — nhập mã bên dưới.
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className="w-full h-full object-cover" />
              <div className="absolute inset-8 border-2 border-white/70 rounded-2xl pointer-events-none" />
            </div>
          )}

          {/* Nhập tay dự phòng (người nhận có nút copy mã trên màn hình của họ) */}
          <div className="flex gap-2">
            <input
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Hoặc dán mã xác nhận của người nhận..."
              className="flex-1 px-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={() => manualToken.trim() && onResult(manualToken.trim())}
              disabled={busy || !manualToken.trim()}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
            >
              Xác nhận
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
