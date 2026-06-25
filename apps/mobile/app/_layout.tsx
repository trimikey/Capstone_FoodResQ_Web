import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppPopupHost } from '@/components/ui/AppPopup';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth';
import { setSessionExpiredHandler } from '@/api/client';
import { queryClient } from '@/lib/queryClient';

export default function RootLayout() {
  const { initialize } = useAuth();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Khi interceptor refresh token thất bại → reset session để auth guard
  // điều hướng về login. Dùng getState() để không phụ thuộc render.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      useAuthStore.getState().clearSession();
      queryClient.clear();
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <PaperProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
            {/* Popup giữa màn hình — đặt cuối, trong PaperProvider để Portal nổi trên mọi màn */}
            <AppPopupHost />
          </PaperProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
