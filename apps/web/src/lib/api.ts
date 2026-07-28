<<<<<<< HEAD
import axios from 'axios';
import { translateApiMessage } from '@/lib/utils';
=======
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';

const apiBaseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
>>>>>>> origin/master

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

// Attach access token from localStorage/Zustand persist
api.interceptors.request.use((config) => {
  const { accessToken } = getStoredTokens();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Auto-refresh on 401
let isRefreshing = false;
let queue: QueuedRequest[] = [];

function clearLocalSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('foodresq-auth');
}

function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

api.interceptors.response.use(
  (res) => res,
<<<<<<< HEAD
  async (error) => {
    const original = error.config;
    const apiMessage = error.response?.data?.error?.message;
    if (typeof apiMessage === 'string') {
      error.response.data.error.message = translateApiMessage(apiMessage);
    }
=======
  async (error: AxiosError) => {
    const original = error.config as RetryableRequestConfig | undefined;
>>>>>>> origin/master

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

    // Chưa có refresh token -> session hết hạn, xoá cả Zustand persist để tránh user cũ tiếp tục gọi API
    if (!refreshToken) {
<<<<<<< HEAD
      clearLocalSession();
      redirectToLogin();
=======
      expireSession();
>>>>>>> origin/master
      return Promise.reject(error as Error);
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

      queue.forEach(({ resolve: resolveQueued }) => resolveQueued(newAccess));
      queue = [];

      original.headers.Authorization = `Bearer ${newAccess}`;
      return api(original);
<<<<<<< HEAD
    } catch {
      clearLocalSession();
      redirectToLogin();
      return Promise.reject(error as Error);
=======
    } catch (refreshError) {
      queue.forEach(({ reject: rejectQueued }) => rejectQueued(refreshError));
      queue = [];
      expireSession();
      return Promise.reject(refreshError as Error);
>>>>>>> origin/master
    } finally {
      isRefreshing = false;
    }
  },
);
