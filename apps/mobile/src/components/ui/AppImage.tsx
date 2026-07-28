import { useMemo, useState } from 'react';
import { Image, type ImageProps } from 'expo-image';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const API_ORIGIN = API_URL.replace(/\/api\/v\d+\/?$/, '');

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

function rewriteLocalhostUrl(value: string): string {
  if (!/^https?:\/\//.test(value)) return value;
  try {
    const imageUrl = new URL(value);
    const apiUrl = new URL(API_ORIGIN);
    if (
      (imageUrl.hostname === 'localhost' || imageUrl.hostname === '127.0.0.1') &&
      apiUrl.hostname !== imageUrl.hostname
    ) {
      imageUrl.protocol = apiUrl.protocol;
      imageUrl.hostname = apiUrl.hostname;
      imageUrl.port = apiUrl.port;
    }
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

  const uploadPath = raw.startsWith('/uploads/') ? raw : raw.startsWith('uploads/') ? `/${raw}` : null;
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
export function AppImage({ source, fallbackSource, onError, ...props }: AppImageProps) {
  const [failedSourceKey, setFailedSourceKey] = useState<string | null>(null);
  const resolvedSource = useMemo(() => resolveSource(source), [source]);
  const resolvedFallback = useMemo(() => resolveSource(fallbackSource), [fallbackSource]);
  const sourceKey = JSON.stringify(resolvedSource ?? null);
  const failed = failedSourceKey === sourceKey;

  return (
    <Image
      contentFit="cover"
      transition={250}
      cachePolicy="memory-disk"
      source={(failed ? resolvedFallback : resolvedSource) ?? resolvedFallback}
      onError={(event) => {
        setFailedSourceKey(sourceKey);
        onError?.(event);
      }}
      {...props}
    />
  );
}

export default AppImage;
