import { useEffect } from 'react';
import { onlineManager, useQueryClient } from '@tanstack/react-query';

type NetInfoModule = typeof import('@react-native-community/netinfo');

let netInfoModule: NetInfoModule | null = null;
try {
  // Native module may be unavailable until the Expo dev client is rebuilt.
  // Keep the app usable after a JS-only reload.
  netInfoModule = require('@react-native-community/netinfo') as NetInfoModule;
} catch {
  netInfoModule = null;
}

function isReachable(isConnected?: boolean | null, isInternetReachable?: boolean | null) {
  return Boolean(isConnected) && isInternetReachable !== false;
}

onlineManager.setEventListener((setOnline) => {
  if (!netInfoModule) {
    setOnline(true);
    return () => undefined;
  }

  return netInfoModule.default.addEventListener((state) => {
    setOnline(isReachable(state.isConnected, state.isInternetReachable));
  });
});

export function useNetworkStatus() {
  const nativeNetInfo = netInfoModule?.useNetInfo();
  const queryClient = useQueryClient();
  const isOnline = netInfoModule
    ? isReachable(nativeNetInfo?.isConnected, nativeNetInfo?.isInternetReachable)
    : true;

  useEffect(() => {
    onlineManager.setOnline(isOnline);
    if (isOnline) {
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  }, [isOnline, queryClient]);

  return { isOnline, isOffline: !isOnline };
}
