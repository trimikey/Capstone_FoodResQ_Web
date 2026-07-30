import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';
<<<<<<< HEAD
import { translateApiMessage } from '@/lib/utils';
=======
>>>>>>> origin/master

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
<<<<<<< HEAD
type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};
=======
>>>>>>> origin/master

function getStoredTokens() {
  if (typeof window === 'undefined') {
    return { accessToken: null, refreshToken: null };
  }

  const state = useAuthStore.getState();
  const accessToken = localStorage.getItem('access_token') ?? state.accessToken;
  const refreshToken = localStorage.getItem('refresh_token') ?? state.refreshToken;
  return { accessToken, refreshToken };
}

<<<<<<< HEAD
function clearLocalSession() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('foodresq-auth');
  useAuthStore.getState().logout();
}

function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
=======
function expireSession() {
  if (typeof window === 'undefined') return;

  useAuthStore.getState().logout();
  if (window.location.pathname !== '/login') {
>>>>>>> origin/master
    window.location.href = '/login';
  }
}

<<<<<<< HEAD
function expireSession() {
  clearLocalSession();
  redirectToLogin();
}

=======
// Attach access token from localStorage/Zustand persist
>>>>>>> origin/master
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
<<<<<<< HEAD
    const errorPayload = error.response?.data as ApiErrorPayload | undefined;
    const apiMessage = errorPayload?.error?.message;
    if (typeof apiMessage === 'string' && errorPayload?.error) {
      errorPayload.error.message = translateApiMessage(apiMessage);
    }

    const original = error.config as RetryableRequestConfig | undefined;

    if (!original || error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
=======
    const original = error.config as RetryableRequestConfig | undefined;

    if (!original || error.response?.status !== 401 || original._retry) {
      return Promise.reject(error as Error);
>>>>>>> origin/master
    }

    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
<<<<<<< HEAD
          reject,
=======
          reject: (queueError) => {
            reject(queueError);
          },
>>>>>>> origin/master
        });
      });
    }

    const { refreshToken } = getStoredTokens();
<<<<<<< HEAD
    if (!refreshToken) {
      expireSession();
      return Promise.reject(error);
=======

    // Chưa có refresh token -> session hết hạn, xoá cả Zustand persist để tránh user cũ tiếp tục gọi API
    if (!refreshToken) {
      expireSession();
      return Promise.reject(error as Error);
>>>>>>> origin/master
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

<<<<<<< HEAD
      queue.forEach(({ resolve }) => resolve(newAccess));
=======
      queue.forEach(({ resolve: resolveQueued }) => resolveQueued(newAccess));
>>>>>>> origin/master
      queue = [];

      original.headers.Authorization = `Bearer ${newAccess}`;
      return api(original);
    } catch (refreshError) {
<<<<<<< HEAD
      queue.forEach(({ reject }) => reject(refreshError));
      queue = [];
      expireSession();
      return Promise.reject(refreshError);
=======
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
