import { Stack, useLocalSearchParams } from 'expo-router';
import { BackButton } from '@/components/ui/BackButton';
import ListingDetailScreen from '@/screens/listing/ListingDetailScreen';

export default function ListingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Chi tiết',
          headerLeft: () => <BackButton />,
        }}
      />
      <ListingDetailScreen id={String(id)} />
    </>
  );
}
