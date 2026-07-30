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

api.interceptors.request.use((config) => {
  const { accessToken } = getStoredTokens();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
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

    isRefreshing = true;

    try {
      const { data } = await axios.post<{ data: { accessToken: string; refreshToken: string } }>(
        `${apiBaseURL}/auth/refresh`,
        { refreshToken },
      );

      const newAccess = data.data.accessToken;
      const newRefresh = data.data.refreshToken;
      useAuthStore.getState().setTokens(newAccess, newRefresh);

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
