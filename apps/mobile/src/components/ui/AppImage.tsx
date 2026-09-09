import { useMemo, useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { API_ORIGIN } from '../../api/client';

const STATIC_IMAGE_BY_PATH: Record<string, number> = {
  '/com-ga-hoi-an.png': require('../../../assets/food-fallbacks/com-ga-hoi-an.png'),
  '/com-ga.png': require('../../../assets/food-fallbacks/com-ga.png'),
  '/banh-mi-lua-mach-tuoi.png': require('../../../assets/food-fallbacks/banh-mi-lua-mach-tuoi.png'),
  '/banh-mi.png': require('../../../assets/food-fallbacks/banh-mi.png'),
  '/food_salad.png': require('../../../assets/food-fallbacks/food_salad.png'),
  '/food_bread.png': require('../../../assets/food-fallbacks/food_bread.png'),
  '/food_lunchbox.png': require('../../../assets/food-fallbacks/food_lunchbox.png'),
  '/rau-cu.png': require('../../../assets/food-fallbacks/rau-cu.png'),
};

const CATEGORY_FALLBACK: Record<string, number> = {
  cooked_meal: STATIC_IMAGE_BY_PATH['/food_lunchbox.png'],
  bakery: STATIC_IMAGE_BY_PATH['/food_bread.png'],
  fresh_fruit: STATIC_IMAGE_BY_PATH['/food_salad.png'],
  vegetables: STATIC_IMAGE_BY_PATH['/rau-cu.png'],
  raw_protein: STATIC_IMAGE_BY_PATH['/food_lunchbox.png'],
  dry_goods: STATIC_IMAGE_BY_PATH['/food_bread.png'],
  canned_packaged: STATIC_IMAGE_BY_PATH['/food_lunchbox.png'],
  beverage: STATIC_IMAGE_BY_PATH['/food_salad.png'],
  other: STATIC_IMAGE_BY_PATH['/food_lunchbox.png'],
};

type ImageSource = ImageProps['source'];

interface AppImageProps extends ImageProps {
  fallbackSource?: ImageSource;
}

function staticSourceForPath(path: string): number | null {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return STATIC_IMAGE_BY_PATH[normalized] ?? null;
}

function uploadPathFromPathname(pathname: string): string | null {
  if (pathname.startsWith('/api/v1/uploads/')) return pathname.replace(/^\/api\/v1/, '');
  if (pathname.startsWith('/uploads/')) return pathname;
  return null;
}

function rewriteLocalhostUrl(value: string): string {
  if (!/^https?:\/\//.test(value)) return value;
  try {
    const imageUrl = new URL(value);
    const uploadPath = uploadPathFromPathname(imageUrl.pathname);
    if (uploadPath) return `${API_ORIGIN}${uploadPath}${imageUrl.search}`;
    return imageUrl.toString();
  } catch {
    return value;
  }
}

function resolveUri(uri?: string | null): ImageSource | null {
  const raw = uri?.trim();
  if (!raw) return null;

  if (raw.startsWith('data:') || raw.startsWith('file:')) return { uri: raw };

  if (/^https?:\/\//.test(raw)) {
    try {
      const parsed = new URL(raw);
      const bundled = staticSourceForPath(parsed.pathname);
      if (bundled) return bundled;
    } catch {
      // Keep remote URL fallback below.
    }
    return { uri: rewriteLocalhostUrl(raw) };
  }

  const normalizedRaw = raw.startsWith('api/v1/uploads/')
    ? `/${raw}`
    : raw.startsWith('uploads/')
      ? `/${raw}`
      : raw;
  const uploadPath = uploadPathFromPathname(normalizedRaw);
  if (uploadPath) return { uri: `${API_ORIGIN}${uploadPath}` };

  const bundled = staticSourceForPath(raw);
  return bundled ?? null;
}

function resolveSource(source: ImageSource): ImageSource | null {
  if (source == null) return null;
  if (typeof source === 'number') return source;
  if (typeof source === 'string') return resolveUri(source);
  if (Array.isArray(source)) return source;
  if (typeof source === 'object' && 'uri' in source) {
    return resolveUri(source.uri) ?? null;
  }
  return source;
}

export function foodFallbackSourceForCategory(category?: string | null): ImageSource {
  return CATEGORY_FALLBACK[category ?? ''] ?? CATEGORY_FALLBACK.other;
}

/**
 * Ảnh dùng chung toàn app — bọc expo-image với cache + hiệu ứng fade khi load.
 * Thay cho <Image> của react-native (không cache, không transition).
 * Docs: https://docs.expo.dev/versions/latest/sdk/image/
 */
const MAX_LOAD_RETRIES = 2;

export function AppImage({ source, fallbackSource, onError, ...props }: AppImageProps) {
  const [loadState, setLoadState] = useState<{ sourceKey: string | null; attempt: number; failed: boolean }>({
    sourceKey: null,
    attempt: 0,
    failed: false,
  });
  const resolvedSource = useMemo(() => resolveSource(source), [source]);
  const resolvedFallback = useMemo(() => resolveSource(fallbackSource), [fallbackSource]);
  const sourceKey = JSON.stringify(resolvedSource ?? null);
  const attempt = loadState.sourceKey === sourceKey ? loadState.attempt : 0;
  const failed = loadState.sourceKey === sourceKey && loadState.failed;

  return (
    <Image
      // Đổi key để ép expo-image tải lại từ đầu thay vì giữ trạng thái lỗi cũ.
      key={`${sourceKey}-${attempt}`}
      contentFit="cover"
      transition={250}
      cachePolicy="memory-disk"
      source={(failed ? resolvedFallback : resolvedSource) ?? resolvedFallback}
      onError={(event) => {
        // Ảnh thật của provider đôi khi lỗi tải THOÁNG QUA (mạng chậm, ảnh vừa
        // upload xong CDN/proxy chưa kịp phục vụ) — không được khoá cứng về ảnh
        // placeholder ngay lần lỗi đầu, phải thử lại vài lần trước khi bỏ cuộc.
        if (resolvedSource && typeof resolvedSource !== 'number' && attempt < MAX_LOAD_RETRIES) {
          setLoadState({ sourceKey, attempt: attempt + 1, failed: false });
          return;
        }
        setLoadState({ sourceKey, attempt, failed: true });
        onError?.(event);
      }}
      {...props}
    />
  );
}

export default AppImage;
