import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { DeferredRedirect } from '@/components/navigation/DeferredRedirect';

export default function Index() {
  const { isInitialized, isAuthenticated, user } = useAuth();

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!isAuthenticated) return <DeferredRedirect href="/sign-in" />;
  if (user?.role === 'provider') return <DeferredRedirect href="/(app)/provider/listings" />;
  if (user?.role === 'volunteer') return <DeferredRedirect href="/(app)/volunteer/campaigns" />;
  return <DeferredRedirect href="/(app)/home" />;
}
