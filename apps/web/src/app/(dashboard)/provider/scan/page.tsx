'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { toast } from 'sonner';
import { useScanQr } from '@/hooks/useProviderListings';

type Phase = 'scanning' | 'submitting' | 'result';

export default function ProviderScanPage() {
  const scanQr = useScanQr();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lockRef = useRef(false); // chặn quét trùng liên tiếp

  const [phase, setPhase] = useState<Phase>('scanning');
  const [cameraError, setCameraError] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [manualToken, setManualToken] = useState('');

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }

  async function submitToken(token: string) {
    if (lockRef.current) return;
    lockRef.current = true;
    stopCamera();
    setPhase('submitting');
    try {
      const res = await scanQr.mutateAsync(token);
      setResult({ ok: true, message: `Xác nhận thành công! Đơn chuyển sang "${res.status === 'picked_up' ? 'Đã lấy hàng' : res.status}".` });
      toast.success('Đã xác nhận giao hàng');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Mã QR không hợp lệ hoặc đã hết hạn';
      setResult({ ok: false, message: msg });
    } finally {
      setPhase('result');
      lockRef.current = false;
    }
  }

  async function startScan() {
    setResult(null);
    setPhase('scanning');
    lockRef.current = false;
    setCameraError(false);
    try {
      const reader = new BrowserQRCodeReader();
      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current ?? undefined,
        (res) => {
          if (res) void submitToken(res.getText().trim());
        },
      );
    } catch {
      setCameraError(true);
    }
  }

  useEffect(() => {
    void startScan();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      <div className="max-w-xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="font-extrabold text-3xl text-neutral-900">Quét mã QR nhận hàng</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Đưa mã QR của người nhận vào khung để xác nhận bàn giao thực phẩm.
          </p>
        </div>

        {/* Camera / kết quả */}
        <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
          {phase === 'result' && result ? (
            <div className="p-8 flex flex-col items-center text-center gap-4">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center ${
                  result.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
                }`}
              >
                <span className="material-symbols-outlined text-[44px]">
                  {result.ok ? 'check_circle' : 'error'}
                </span>
              </div>
              <p className="font-bold text-lg text-neutral-900">
                {result.ok ? 'Bàn giao thành công' : 'Không xác nhận được'}
              </p>
              <p className="text-sm text-neutral-500 max-w-sm">{result.message}</p>
              <button
                onClick={() => void startScan()}
                className="mt-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-sm"
              >
                Quét đơn khác
              </button>
            </div>
          ) : (
            <div className="relative aspect-square bg-neutral-900">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {/* Khung ngắm */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-56 border-2 border-emerald-400 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
              {phase === 'submitting' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="animate-spin border-4 border-white border-t-transparent rounded-full w-10 h-10" />
                </div>
              )}
              {cameraError && (
                <div className="absolute inset-0 bg-neutral-900 flex flex-col items-center justify-center text-center gap-2 p-6">
                  <span className="material-symbols-outlined text-neutral-500 text-[48px]">no_photography</span>
                  <p className="text-neutral-300 text-sm">Không truy cập được camera. Dùng nhập mã thủ công bên dưới.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Nhập tay mã token (fallback) */}
        {phase !== 'submitting' && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-2">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide">Hoặc nhập mã thủ công</p>
            <div className="flex gap-2">
              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Dán mã QR token..."
                className="flex-1 border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20 font-mono"
              />
              <button
                onClick={() => manualToken.trim() && void submitToken(manualToken.trim())}
                disabled={!manualToken.trim() || scanQr.isPending}
                className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-bold disabled:opacity-50"
              >
                Xác nhận
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
