import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { translateApiMessage } from '@/lib/utils';

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
type ApiErrorPayload = {
  error?: {
    message?: string;
  };
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

function clearLocalSession() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('foodresq-auth');
  useAuthStore.getState().logout();
}

function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

function expireSession() {
  clearLocalSession();
  redirectToLogin();
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
  const { accessToken } = getStoredTokens();
  const { refreshToken } = getStoredTokens();
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
    const errorPayload = error.response?.data as ApiErrorPayload | undefined;
    const apiMessage = errorPayload?.error?.message;
    if (typeof apiMessage === 'string' && errorPayload?.error) {
      errorPayload.error.message = translateApiMessage(apiMessage);
    }

    const original = error.config as RetryableRequestConfig | undefined;

    if (!original || error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }

    const { refreshToken } = getStoredTokens();
    if (!refreshToken) {
      expireSession();
      return Promise.reject(error);
    }

    try {
      isRefreshing = true;
      const newAccess = await refreshAccessToken(refreshToken);

      queue.forEach(({ resolve }) => resolve(newAccess));
      queue = [];

      original.headers.Authorization = `Bearer ${newAccess}`;
      return api(original);
    } catch (refreshError) {
      queue.forEach(({ reject }) => reject(refreshError));
      queue = [];
      expireSession();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
