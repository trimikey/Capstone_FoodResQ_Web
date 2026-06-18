import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/hooks/useAuth';

export default function RootLayout() {
  const { initialize } = useAuth();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
          {/* Toast đặt cuối, ngoài navigator để luôn nổi trên mọi màn hình */}
          <Toast />
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
