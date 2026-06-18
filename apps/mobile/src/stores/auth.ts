import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, { ApiResponse, LoginResponse, endpoints } from '../api/client';
import { LoginInput, RegisterInput } from '../utils/validators';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  restoreToken: () => Promise<void>;
  clearSession: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  // Initial state
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: false,
  error: null,
  isInitialized: false,

  // Initialize: restore token from storage on app start
  initialize: async () => {
    try {
      set({ isLoading: true });
      const accessToken = await AsyncStorage.getItem('accessToken');
      const refreshToken = await AsyncStorage.getItem('refreshToken');

      if (accessToken) {
        // Try to fetch user profile
        try {
          const response = await apiClient.get<ApiResponse<User>>(
            endpoints.auth.me
          );
          if (response.data.success) {
            set({
              user: response.data.data,
              accessToken,
              refreshToken,
              isInitialized: true,
              isLoading: false,
            });
          }
        } catch (error) {
          // Token might be expired, clear it
          await AsyncStorage.removeItem('accessToken');
          await AsyncStorage.removeItem('refreshToken');
          set({
            isInitialized: true,
            isLoading: false,
          });
        }
      } else {
        set({
          isInitialized: true,
          isLoading: false,
        });
      }
    } catch (error) {
      set({
        isInitialized: true,
        isLoading: false,
        error: 'Failed to initialize auth',
      });
    }
  },

  // Login
  login: async (input: LoginInput) => {
    try {
      set({ isLoading: true, error: null });

      const response = await apiClient.post<ApiResponse<LoginResponse>>(
        endpoints.auth.login,
        input
      );

      if (response.data.success) {
        const { accessToken, refreshToken, user } = response.data.data;

        // Store tokens
        await AsyncStorage.setItem('accessToken', accessToken);
        await AsyncStorage.setItem('refreshToken', refreshToken);

        set({
          user,
          accessToken,
          refreshToken,
          isLoading: false,
        });
      } else {
        throw new Error(response.data.error?.message || 'Login failed');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Register
  register: async (input: RegisterInput) => {
    try {
      set({ isLoading: true, error: null });

      // API yêu cầu `fullName` (không phải `name`) và `role` thuộc enum.
      // role/phone được truyền thêm runtime từ flow đăng ký (cast vì RegisterInput không khai báo).
      const extra = input as RegisterInput & { role?: string; phone?: string };
      const response = await apiClient.post<ApiResponse<LoginResponse>>(
        endpoints.auth.register,
        {
          email: input.email,
          password: input.password,
          fullName: input.name,
          role: extra.role ?? 'receiver',
          ...(extra.phone ? { phone: extra.phone } : {}),
        }
      );

      if (response.data.success) {
        const { accessToken, refreshToken, user } = response.data.data;

        // Store tokens
        await AsyncStorage.setItem('accessToken', accessToken);
        await AsyncStorage.setItem('refreshToken', refreshToken);

        set({
          user,
          accessToken,
          refreshToken,
          isLoading: false,
        });
      } else {
        throw new Error(response.data.error?.message || 'Registration failed');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Logout
  logout: async () => {
    try {
      set({ isLoading: true });

      // Call logout endpoint (optional)
      try {
        await apiClient.post(endpoints.auth.logout);
      } catch (error) {
        // Logout endpoint có thể fail (vd 401 do token đã hết hạn) — vẫn xoá token local bình thường.
        // Dùng debug để không kích hoạt LogBox overlay vì đây là trường hợp mong đợi.
        if (__DEV__) console.debug('Logout endpoint bỏ qua được:', error);
      }

      // Clear stored tokens
      await AsyncStorage.removeItem('accessToken');
      await AsyncStorage.removeItem('refreshToken');

      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Logout failed';
      set({ error: message, isLoading: false });
    }
  },

  // Restore token from storage (used on app startup)
  restoreToken: async () => {
    try {
      const accessToken = await AsyncStorage.getItem('accessToken');
      const refreshToken = await AsyncStorage.getItem('refreshToken');

      if (accessToken && refreshToken) {
        set({
          accessToken,
          refreshToken,
        });
      }
    } catch (error) {
      console.error('Error restoring token:', error);
    }
  },

  // Clear session in-memory (gọi khi refresh token fail từ interceptor).
  // Token trong AsyncStorage đã được client.ts xoá; ở đây chỉ reset state
  // để auth guard điều hướng về màn login ngay.
  clearSession: () => {
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      error: null,
    });
  },

  // Clear error message
  clearError: () => {
    set({ error: null });
  },
}));
