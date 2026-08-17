import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';

const apiBaseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export const api = axios.create({
  baseURL: apiBaseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };
type QueuedRequest = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};
type RefreshPayload = { data: { accessToken: string; refreshToken: string } };

function jwtExpiresSoon(token: string, skewSeconds = 30): boolean {
  try {
    const [, payload] = token.split('.');
    if (!payload) return true;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof window === 'undefined'
        ? Buffer.from(normalized, 'base64').toString('utf8')
        : atob(normalized);
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    if (!exp) return true;
    return exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}

function getStoredTokens() {
  if (typeof window === 'undefined') {
    return { accessToken: null, refreshToken: null };
  }

  const state = useAuthStore.getState();
  const accessToken = localStorage.getItem('access_token') ?? state.accessToken;
  const refreshToken = localStorage.getItem('refresh_token') ?? state.refreshToken;
  return { accessToken, refreshToken };
}

function expireSession() {
  if (typeof window === 'undefined') return;

  useAuthStore.getState().logout();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(refreshToken: string): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<RefreshPayload>(`${apiBaseURL}/auth/refresh`, { refreshToken })
      .then(({ data }) => {
        const newAccess = data.data.accessToken;
        const newRefresh = data.data.refreshToken;
        useAuthStore.getState().setTokens(newAccess, newRefresh);
        return newAccess;
      })
      .catch((error) => {
        expireSession();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.request.use(async (config) => {
  const { accessToken, refreshToken } = getStoredTokens();
  const isRefreshRequest = typeof config.url === 'string' && config.url.includes('/auth/refresh');
  let token = accessToken;

  if (!isRefreshRequest && token && jwtExpiresSoon(token) && refreshToken) {
    token = await refreshAccessToken(refreshToken);
  }

  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let queue: QueuedRequest[] = [];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetryableRequestConfig | undefined;

    if (!original || error.response?.status !== 401 || original._retry) {
      return Promise.reject(error as Error);
    }

    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject: (queueError) => {
            reject(queueError);
          },
        });
      });
    }

    const { refreshToken } = getStoredTokens();

    if (!refreshToken) {
      expireSession();
      return Promise.reject(error as Error);
    }

    try {
      isRefreshing = true;
      const newAccess = await refreshAccessToken(refreshToken);

      queue.forEach(({ resolve: resolveQueued }) => resolveQueued(newAccess));
      queue = [];

      original.headers.Authorization = `Bearer ${newAccess}`;
      return api(original);
    } catch (refreshError) {
      queue.forEach(({ reject: rejectQueued }) => rejectQueued(refreshError));
      queue = [];
      expireSession();
      return Promise.reject(refreshError as Error);
    } finally {
      isRefreshing = false;
    }
  },
);
