import { useMemo } from 'react';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';

/**
 * Map tên route kiểu React Navigation (code cũ dùng) → path của Expo Router.
 * Giữ nguyên các screen sẵn có mà không phải viết lại logic điều hướng.
 */
const ROUTE_TO_PATH: Record<string, string> = {
  SignIn: '/sign-in',
  SignUp: '/select-role',
  SelectRole: '/select-role',
  SignUpBasic: '/sign-up-basic',
  SignUpProvider: '/sign-up-provider',
  SignUpRecipient: '/sign-up-recipient',
  SignUpVolunteer: '/sign-up-volunteer',
  SignUpVerification: '/sign-up-verification',
  ForgotPassword: '/forgot-password',
  PhoneSignIn: '/phone-sign-in',
  OtpVerification: '/otp-verification',
  ResetPassword: '/reset-password',
  Home: '/home',
};

function pathFor(name: string): string {
  const path = ROUTE_TO_PATH[name];
  if (!path) {
    console.warn(`[nav-adapter] Không tìm thấy path cho route "${name}"`);
    return '/';
  }
  return path;
}

/**
 * Expo Router chỉ truyền param dạng string qua URL → encode object/array bằng JSON.
 */
function encodeParams(params?: Record<string, unknown>): Record<string, string> | undefined {
  if (!params) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

function buildHref(name: string, params?: Record<string, unknown>): Href {
  const pathname = pathFor(name);
  const encoded = encodeParams(params);
  return (encoded ? { pathname, params: encoded } : pathname) as Href;
}

export interface ScreenNavigation {
  navigate: (name: string, params?: Record<string, unknown>) => void;
  reset: (state: { index?: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  goBack: () => void;
  replace: (name: string, params?: Record<string, unknown>) => void;
}

export interface ScreenRoute {
  params: Record<string, unknown>;
}

/**
 * Hook adapter: trả về { navigation, route } tương thích chữ ký prop của các screen cũ.
 */
export function useScreenNav(): { navigation: ScreenNavigation; route: ScreenRoute } {
  const router = useRouter();
  const rawParams = useLocalSearchParams();

  const route = useMemo<ScreenRoute>(() => {
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawParams)) {
      if (typeof value !== 'string') {
        params[key] = value;
        continue;
      }
      try {
        params[key] = JSON.parse(value);
      } catch {
        params[key] = value;
      }
    }
    return { params };
  }, [rawParams]);

  const navigation = useMemo<ScreenNavigation>(
    () => ({
      navigate: (name, params) => router.push(buildHref(name, params)),
      replace: (name, params) => router.replace(buildHref(name, params)),
      goBack: () => router.back(),
      reset: ({ routes }) => {
        const target = routes[routes.length - 1];
        if (target) router.replace(buildHref(target.name, target.params));
      },
    }),
    [router]
  );

  return { navigation, route };
}
