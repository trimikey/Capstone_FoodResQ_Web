import { StyleSheet } from 'react-native';
import { Card, Text } from 'react-native-paper';
import type { Listing } from '../hooks/useListings';

interface Props {
  listing: Listing;
  onPress?: () => void;
}

/**
 * TODO [T2.3]: hoàn thiện card — dùng AppImage (src/components/ui/AppImage)
 * cho ảnh, thêm tên provider, khoảng cách, hạn dùng, badge số lượng.
 */
export function ListingCard({ listing, onPress }: Props) {
  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content>
        <Text variant="titleMedium">{String(listing.title ?? 'Listing')}</Text>
        {/* TODO: provider · distanceKm · expiresAt */}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
});
