import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppPopupHost, AppToastHost } from '@/components/ui/AppPopup';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth';
import { setSessionExpiredHandler } from '@/api/client';
import { queryClient } from '@/lib/queryClient';
import { appTheme } from '@/theme/design';

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
          <BottomSheetModalProvider>
            <PaperProvider theme={appTheme}>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false }} />
              <OfflineBanner />
              <AppToastHost />
              {/* Popup giữa màn hình — đặt cuối, trong PaperProvider để Portal nổi trên mọi màn */}
              <AppPopupHost />
            </PaperProvider>
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
