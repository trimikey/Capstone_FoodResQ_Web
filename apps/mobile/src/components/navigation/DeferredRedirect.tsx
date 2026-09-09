import { useEffect } from 'react';
import { ActivityIndicator, InteractionManager, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { mobileColors as COLORS } from '@/theme/design';

interface DeferredRedirectProps {
  href: Href;
}

export function DeferredRedirect({ href }: DeferredRedirectProps) {
  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) router.replace(href);
    });

    return () => {
      cancelled = true;
      task.cancel?.();
    };
  }, [href]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}
