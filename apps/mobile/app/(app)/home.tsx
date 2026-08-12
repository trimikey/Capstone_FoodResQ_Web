import { Redirect } from 'expo-router';
import HomeScreen from '@/screens/listing/HomeScreen';
import { useAuth } from '@/hooks/useAuth';

export default function HomeTab() {
  const { user } = useAuth();
  if (user?.role === 'provider') {
    return <Redirect href="/(app)/provider/listings" />;
  }
  if (user?.role === 'volunteer') {
    return <Redirect href="/(app)/volunteer/campaigns" />;
  }
  return <HomeScreen />;
}
