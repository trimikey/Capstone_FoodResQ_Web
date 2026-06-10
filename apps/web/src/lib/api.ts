import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Attach access token from localStorage
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
let isRefreshing = false;
let queue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error as Error);
    }

    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(api(original));
        });
      });
    }

    isRefreshing = true;
    const refreshToken = localStorage.getItem('refresh_token');

    try {
      const { data } = await axios.post<{ data: { accessToken: string; refreshToken: string } }>(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
        { refreshToken },
      );

      const newAccess = data.data.accessToken;
      const newRefresh = data.data.refreshToken;
      localStorage.setItem('access_token', newAccess);
      localStorage.setItem('refresh_token', newRefresh);

      queue.forEach((cb) => cb(newAccess));
      queue = [];

      original.headers.Authorization = `Bearer ${newAccess}`;
      return api(original);
    } catch {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
      return Promise.reject(error as Error);
    } finally {
      isRefreshing = false;
    }
  },
);
