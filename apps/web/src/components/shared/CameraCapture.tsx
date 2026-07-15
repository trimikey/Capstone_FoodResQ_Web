'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export type CaptureMode = 'face' | 'id_card';

interface Props {
  mode: CaptureMode;
  hint: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: (photo: File) => void;
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Khung chụp ảnh dùng chung: camera trực tiếp (selfie = camera trước có lật gương,
 * CCCD = camera sau kèm khung căn thẻ), fallback chọn ảnh từ thiết bị,
 * preview với nút chụp lại / xác nhận.
 */
export default function CameraCapture({ mode, hint, confirmLabel = 'Xác nhận', busy, onConfirm }: Props) {
  const [stage, setStage] = useState<'camera' | 'preview'>('camera');
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const facingMode = mode === 'face' ? 'user' : 'environment';

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Bật camera khi vào stage 'camera'. Hoãn 1 nhịp (setTimeout 0) để lần mount "nháp"
  // của React Strict Mode bị huỷ TRƯỚC khi kịp gọi getUserMedia — nếu không, 2 yêu cầu
  // camera chồng nhau: luồng 1 giữ thiết bị, luồng 2 dính "device busy" → hiện lỗi
  // "Không truy cập được camera" dù camera vừa nháy lên.
  useEffect(() => {
    if (stage !== 'camera') return;
    let cancelled = false;
    const start = async () => {
      setCameraError(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        });
        if (cancelled) {
          // Effect đã bị huỷ trong lúc chờ quyền — nhả camera ngay, không giữ thiết bị
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // play() bị ngắt (chuyển trang nhanh) không phải lỗi camera → bỏ qua
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) setCameraError(true);
      }
    };
    const timer = setTimeout(() => void start(), 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopCamera();
    };
  }, [stage, facingMode, stopCamera]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function setCaptured(file: File) {
    setPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
    stopCamera();
    setStage('preview');
  }

  function captureFromCamera() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      toast.error('Camera chưa sẵn sàng, thử lại');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error('Không chụp được ảnh, thử lại');
          return;
        }
        setCaptured(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  }

  function onFilePicked(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      toast.error('Chỉ chấp nhận ảnh JPEG hoặc PNG');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Ảnh tối đa 5MB');
      return;
    }
    setCaptured(file);
  }

  function retake() {
    setPhoto(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStage('camera');
  }

  if (stage === 'preview' && previewUrl) {
    return (
      <div className="flex flex-col gap-md">
        <div className="rounded-2xl overflow-hidden border border-outline-variant/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Ảnh đã chụp" className="w-full object-contain max-h-[50vh]" />
        </div>
        <p className="font-label-sm text-label-sm text-on-surface-variant text-center">
          Kiểm tra ảnh rõ nét trước khi tiếp tục
        </p>
        <div className="flex gap-md">
          <button
            onClick={retake}
            disabled={busy}
            className="flex-1 py-3 border border-outline-variant/30 rounded-xl font-label-lg text-label-lg text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
          >
            Chụp lại
          </button>
          <button
            onClick={() => photo && onConfirm(photo)}
            disabled={busy}
            className="flex-1 py-3 bg-primary-container text-on-primary-container rounded-xl font-label-lg text-label-lg disabled:opacity-50 flex items-center justify-center gap-sm transition-all hover:shadow-sm"
          >
            {busy ? (
              <>
                <span className="animate-spin border-2 border-primary border-t-transparent rounded-full w-5 h-5" />
                Đang xử lý...
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      <p className="font-label-sm text-label-sm text-on-surface-variant">{hint}</p>

      {!cameraError ? (
        <>
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${mode === 'face' ? 'scale-x-[-1]' : ''}`}
            />
            {mode === 'id_card' && (
              <div className="absolute inset-x-md top-1/2 -translate-y-1/2 aspect-[1.58] border-2 border-white/80 rounded-xl pointer-events-none" />
            )}
          </div>
          <button
            onClick={captureFromCamera}
            className="w-full py-4 bg-primary-container text-on-primary-container rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-md transition-all hover:shadow-sm"
          >
            <span className="material-symbols-outlined">photo_camera</span>
            Chụp ảnh
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-md py-lg text-center">
          <span className="material-symbols-outlined text-outline-variant" style={{ fontSize: '48px' }}>
            no_photography
          </span>
          <p className="font-body-md text-on-surface-variant">
            Không truy cập được camera. Bạn có thể chọn ảnh từ thiết bị.
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture={facingMode}
        className="hidden"
        onChange={(e) => onFilePicked(e.target.files?.[0])}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full py-3 border border-outline-variant/30 rounded-xl font-label-lg text-label-lg text-on-surface-variant hover:bg-surface-container transition-colors flex items-center justify-center gap-md"
      >
        <span className="material-symbols-outlined">upload</span>
        Chọn ảnh từ thiết bị
      </button>
    </div>
  );
}
