import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Axios instance for API calls
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Add authorization token to headers
 */
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const accessToken = await AsyncStorage.getItem('accessToken');
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
    } catch (error) {
      console.error('Error reading token from storage:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor: Handle token refresh on 401
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    // If error is 401 and we haven't already retried this request
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');

        if (!refreshToken) {
          // No refresh token available, need to login again
          await handleLogout();
          return Promise.reject(error);
        }

        // Call refresh endpoint
        const refreshResponse = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken: newAccessToken } = refreshResponse.data.data;

        // Store new access token
        await AsyncStorage.setItem('accessToken', newAccessToken);

        // Update header for original request
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        // Retry original request with new token
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        await handleLogout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Callback được đăng ký từ tầng app (vd auth store) để reset session khi
 * refresh token thất bại — giúp auth guard điều hướng về login ngay lập tức
 * mà không tạo circular import (store import client, không ngược lại).
 */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/**
 * Handle logout when token refresh fails
 */
async function handleLogout(): Promise<void> {
  try {
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('refreshToken');
    onSessionExpired?.();
  } catch (error) {
    console.error('Error during logout:', error);
  }
}

/**
 * API response type
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

/**
 * Shape user backend trả về (NestJS dùng `fullName`, kèm vài field hồ sơ).
 * Store sẽ chuẩn hoá về `User` nội bộ (map fullName -> name).
 */
export interface ApiUser {
  id: string;
  email: string;
  fullName?: string;
  name?: string;
  role: string;
  status?: string;
  avatarUrl?: string | null;
  trustScore?: number;
}

/**
 * Login response type
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

/**
 * Firebase auth response — như LoginResponse nhưng kèm cờ tài khoản mới
 * (để app điều hướng hoàn thiện hồ sơ/role).
 */
export interface FirebaseAuthResponse extends LoginResponse {
  isNewUser: boolean;
}

/**
 * API endpoints
 */
export const endpoints = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
    firebase: '/auth/firebase',
  },
  listings: {
    search: '/listings',
    detail: (id: string) => `/listings/${id}`,
  },
  reservations: {
    create: '/reservations',
    list: '/reservations/my',
    detail: (id: string) => `/reservations/${id}`,
  },
};

export default apiClient;
