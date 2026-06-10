import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserRole, UserStatus } from '@foodresq/types';

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  trustScore: number;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  hasRole: (...roles: UserRole[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setTokens: (accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        set({ accessToken, refreshToken });
      },

      setUser: (user) => set({ user }),

      logout: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        set({ user: null, accessToken: null, refreshToken: null });
      },

      isAuthenticated: () => !!get().user && !!get().accessToken,

      hasRole: (...roles) => {
        const user = get().user;
        return !!user && roles.includes(user.role);
      },
    }),
    {
      name: 'foodresq-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
);
