import { useAuthStore } from '../stores/auth';
import type { LoginInput, RegisterInput } from '../utils/validators';

/**
 * Custom hook for authentication
 * Provides login, register, logout functionality and auth state
 */
export function useAuth() {
  const {
    user,
    accessToken,
    isLoading,
    error,
    isInitialized,
    login,
    loginWithFirebase,
    register,
    logout,
    initialize,
    restoreToken,
    clearError,
    updateUser,
  } = useAuthStore();

  const isAuthenticated = !!accessToken && !!user;

  return {
    // State
    user,
    accessToken,
    isLoading,
    error,
    isInitialized,
    isAuthenticated,

    // Methods
    login,
    loginWithFirebase,
    register,
    logout,
    initialize,
    restoreToken,
    clearError,
    updateUser,
  };
}
