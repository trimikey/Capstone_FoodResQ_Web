import { Stack, useLocalSearchParams } from 'expo-router';
import ListingDetailScreen from '@/screens/listing/ListingDetailScreen';

export default function ListingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Chi tiết' }} />
      <ListingDetailScreen id={String(id)} />
    </>
  );
}
