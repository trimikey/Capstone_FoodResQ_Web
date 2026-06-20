'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { toast } from 'sonner';
import { useScanQr, useConfirmPickup, type ScanResult } from '@/hooks/useProviderListings';

type Phase = 'scanning' | 'submitting' | 'verify' | 'result';

// Ảnh lưu ở /uploads trên API server → ghép với origin (bỏ đuôi /api/v1)
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '');
function imgUrl(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : `${API_ORIGIN}${path}`;
}

export default function ProviderScanPage() {
  const scanQr = useScanQr();
  const confirmPickup = useConfirmPickup();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lockRef = useRef(false); // chặn quét trùng liên tiếp

  const [phase, setPhase] = useState<Phase>('scanning');
  const [cameraError, setCameraError] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
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
      setScan(res);
      setPhase('verify'); // chuyển sang đối chiếu thông tin người nhận
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Mã QR không hợp lệ hoặc đã hết hạn';
      setResult({ ok: false, message: msg });
      setPhase('result');
    } finally {
      lockRef.current = false;
    }
  }

  async function handleConfirm() {
    if (!scan) return;
    try {
      await confirmPickup.mutateAsync(scan.id);
      setResult({ ok: true, message: `Đã bàn giao "${scan.listing.title}" cho ${scan.receiver.fullName}. Đơn hoàn tất.` });
      toast.success('Hoàn tất bàn giao');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Xác nhận thất bại';
      setResult({ ok: false, message: msg });
    } finally {
      setPhase('result');
    }
  }

  async function startScan() {
    setResult(null);
    setScan(null);
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
    <div className="min-h-screen bg-mesh-brand pb-24">
      <div className="max-w-xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-gradient flex items-center justify-center elevation-brand shrink-0">
            <span className="material-symbols-outlined text-white text-[28px]">qr_code_scanner</span>
          </div>
          <div>
            <h1 className="font-headline-lg font-extrabold text-3xl text-neutral-900">Quét mã QR nhận hàng</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Quét mã của người nhận, đối chiếu ảnh rồi xác nhận bàn giao.
            </p>
          </div>
        </div>

        {/* ===== ĐỐI CHIẾU THÔNG TIN NGƯỜI NHẬN ===== */}
        {phase === 'verify' && scan ? (
          <div className="bg-white rounded-3xl border border-neutral-150 elevation-2 overflow-hidden">
            <div className="bg-brand-gradient px-6 py-4 text-white flex items-center gap-2">
              <span className="material-symbols-outlined">how_to_reg</span>
              <div>
                <p className="font-extrabold">Đối chiếu người nhận</p>
                <p className="text-xs text-white/80">So ảnh đăng ký với người đang đứng trước bạn</p>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Ảnh đã đăng ký */}
              <div className="flex flex-col items-center">
                {imgUrl(scan.receiver.faceImageUrl) || imgUrl(scan.receiver.idCardImageUrl) ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={(imgUrl(scan.receiver.faceImageUrl) ?? imgUrl(scan.receiver.idCardImageUrl))!}
                      alt={scan.receiver.fullName}
                      className="w-40 h-40 rounded-2xl object-cover ring-4 ring-emerald-100 elevation-2"
                    />
                    <span className="badge badge-emerald absolute -bottom-2 left-1/2 -translate-x-1/2">
                      <span className="material-symbols-outlined text-[14px]">verified</span> Ảnh đã đăng ký
                    </span>
                  </div>
                ) : (
                  <div className="w-40 h-40 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col items-center justify-center text-center px-3">
                    <span className="material-symbols-outlined text-amber-500 text-[40px]">no_photography</span>
                    <p className="text-[11px] font-bold text-amber-700 mt-1">Người nhận chưa đăng ký ảnh</p>
                  </div>
                )}
              </div>

              {/* Thông tin */}
              <div className="space-y-2.5">
                <InfoRow icon="person" label="Họ tên" value={scan.receiver.fullName} strong />
                {scan.receiver.phone && <InfoRow icon="call" label="Điện thoại" value={scan.receiver.phone} />}
                {scan.receiver.idCardNumber && <InfoRow icon="badge" label="Số CCCD" value={scan.receiver.idCardNumber} />}
                <InfoRow icon="lunch_dining" label="Đơn hàng" value={`${scan.listing.title} · ${scan.quantity} ${scan.listing.quantityUnit}`} />
              </div>

              {!scan.receiver.enrolled && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-[18px]">warning</span>
                  <p className="text-xs text-amber-800 font-medium">
                    Người nhận chưa đăng ký khuôn mặt/CCCD. Hãy yêu cầu giấy tờ tuỳ thân trước khi bàn giao.
                  </p>
                </div>
              )}

              {/* Hành động */}
              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  onClick={handleConfirm}
                  disabled={confirmPickup.isPending}
                  className="squishy-button w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                  {confirmPickup.isPending ? 'Đang xác nhận...' : 'Đã giao đúng người — Hoàn tất'}
                </button>
                <button
                  onClick={() => void startScan()}
                  className="w-full py-3 border border-neutral-200 text-neutral-600 rounded-2xl font-bold text-sm hover:bg-neutral-50 transition-colors"
                >
                  Không đúng người / Quét đơn khác
                </button>
              </div>
            </div>
          </div>
        ) : phase === 'result' && result ? (
          /* ===== KẾT QUẢ ===== */
          <div className="bg-white rounded-3xl border border-neutral-150 elevation-2 p-8 flex flex-col items-center text-center gap-4">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center ${
                result.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
              }`}
            >
              <span className="material-symbols-outlined text-[44px]">{result.ok ? 'check_circle' : 'error'}</span>
            </div>
            <p className="font-bold text-lg text-neutral-900">{result.ok ? 'Bàn giao thành công' : 'Không xác nhận được'}</p>
            <p className="text-sm text-neutral-500 max-w-sm">{result.message}</p>
            <button
              onClick={() => void startScan()}
              className="mt-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-sm transition-colors"
            >
              Quét đơn khác
            </button>
          </div>
        ) : (
          /* ===== CAMERA ===== */
          <div className="bg-white rounded-3xl border border-neutral-150 elevation-2 overflow-hidden">
            <div className="relative aspect-square bg-neutral-900">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
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
          </div>
        )}

        {/* Nhập tay mã token (fallback) */}
        {(phase === 'scanning' || phase === 'result') && (
          <div className="bg-white rounded-2xl border border-neutral-150 elevation-1 p-4 space-y-2">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide">Hoặc nhập mã thủ công</p>
            <div className="flex gap-2">
              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Dán mã QR token..."
                className="input-base flex-1 font-mono"
              />
              <button
                onClick={() => manualToken.trim() && void submitToken(manualToken.trim())}
                disabled={!manualToken.trim() || scanQr.isPending}
                className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors"
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

function InfoRow({ icon, label, value, strong }: { icon: string; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[20px] text-neutral-500">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-neutral-400 font-bold uppercase tracking-wide">{label}</p>
        <p className={`text-neutral-900 truncate ${strong ? 'font-extrabold text-base' : 'font-semibold text-sm'}`}>{value}</p>
      </div>
    </div>
  );
}
