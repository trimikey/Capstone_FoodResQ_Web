import { useEffect } from 'react';
import { onlineManager, useQueryClient } from '@tanstack/react-query';

type NetInfoModule = typeof import('@react-native-community/netinfo');
type NetInfoApi = NetInfoModule['default'] & Pick<NetInfoModule, 'useNetInfo'>;

let netInfoApi: NetInfoApi | null = null;
try {
  // Native module may be unavailable until the Expo dev client is rebuilt.
  // Keep the app usable after a JS-only reload.
  const loadedNetInfo = require('@react-native-community/netinfo') as NetInfoModule & {
    default?: NetInfoModule['default'];
  };
  netInfoApi = (loadedNetInfo.default ?? loadedNetInfo) as NetInfoApi;
} catch {
  netInfoApi = null;
}

function isReachable(isConnected?: boolean | null, isInternetReachable?: boolean | null) {
  if (isConnected === false || isInternetReachable === false) return false;
  return true;
}

onlineManager.setEventListener((setOnline) => {
  if (!netInfoApi) {
    setOnline(true);
    return () => undefined;
  }

  return netInfoApi.addEventListener((state) => {
    setOnline(isReachable(state.isConnected, state.isInternetReachable));
  });
});

export function useNetworkStatus() {
  const nativeNetInfo = netInfoApi?.useNetInfo();
  const queryClient = useQueryClient();
  const isOnline = netInfoApi
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
