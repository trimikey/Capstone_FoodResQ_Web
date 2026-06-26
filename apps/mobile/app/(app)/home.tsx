import { Redirect } from 'expo-router';
import HomeScreen from '@/screens/listing/HomeScreen';
import { useAuth } from '@/hooks/useAuth';

export default function HomeTab() {
  const { user } = useAuth();
  // Provider không dùng màn tìm món của receiver → đưa về tab provider.
  if (user?.role === 'provider') {
    return <Redirect href="/(app)/provider/listings" />;
  }
  return <HomeScreen />;
}
