import HomeScreen from '@/screens/listing/HomeScreen';
import { useAuth } from '@/hooks/useAuth';
import { DeferredRedirect } from '@/components/navigation/DeferredRedirect';

export default function HomeTab() {
  const { user } = useAuth();
  if (user?.role === 'provider') {
    return <DeferredRedirect href="/(app)/provider/listings" />;
  }
  if (user?.role === 'volunteer') {
    return <DeferredRedirect href="/(app)/volunteer/campaigns" />;
  }
  return <HomeScreen />;
}
