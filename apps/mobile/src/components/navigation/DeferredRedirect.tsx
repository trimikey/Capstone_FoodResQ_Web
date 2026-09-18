import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { mobileColors as COLORS } from '@/theme/design';

interface DeferredRedirectProps {
  href: Href;
}

export function DeferredRedirect({ href }: DeferredRedirectProps) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => router.replace(href));

    return () => cancelAnimationFrame(frame);
  }, [href]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}
