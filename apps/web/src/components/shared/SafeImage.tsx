'use client';

import React, { useState } from 'react';
import { cn, mediaUrl } from '@/lib/utils';
import { fallbackImage } from '@/lib/image-fallback';

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  /** URL ảnh (raw từ API). Sẽ được mediaUrl() xử lý → ra localhost:3001 nếu là /uploads.
   *  Khi load fail sẽ tự fallback ảnh category. */
  src: string;
  /** Category dùng để chọn ảnh placeholder khi ảnh gốc lỗi / trống. */
  category?: string;
  /** Bỏ qua SafeImage — render src gốc luôn. Mặc định false. */
  disableFallback?: boolean;
}

/**
 * Ảnh có fallback: khi src trống / load lỗi (404, file upload đã bị xoá…) sẽ
 * tự động đổi sang ảnh placeholder theo category để UI không bao giờ broken.
 *
 * Đồng thời tự prefix domain API cho path /uploads — nếu caller quên gọi mediaUrl(),
 * vẫn hoạt động đúng (đỡ phải sửa ~15 chỗ render <img src={imageUrls[0]}>).
 */
export function SafeImage({ src, category, disableFallback, className, alt, ...rest }: Props) {
  const [errored, setErrored] = useState(false);
  const resolved = mediaUrl(src);
  const finalSrc = !src || errored ? (disableFallback ? resolved : fallbackImage(category)) : resolved;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={finalSrc}
      alt={alt ?? ''}
      onError={() => {
        if (!errored) {
          setErrored(true);
          // Dev helper: cảnh báo trong console để dev biết URL upload sai / 404
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn('[SafeImage] Ảnh lỗi, fallback sang placeholder:', { src: resolved });
          }
        }
      }}
      className={cn(className)}
      {...rest}
    />
  );
}