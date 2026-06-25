import { useState } from 'react';
import { View, StyleSheet, useWindowDimensions, FlatList } from 'react-native';
import { Icon } from 'react-native-paper';
import { AppImage } from './ui/AppImage';

const COLORS = { primary: '#10b981', outlineVariant: '#e5e7eb', onSurfaceVariant: '#6b7280' };

interface Props {
  imageUrls: string[];
  height?: number;
}

/** Carousel ảnh ngang có dot indicator. Rỗng → ô placeholder. */
export function ImageCarousel({ imageUrls, height = 280 }: Props) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  if (!imageUrls || imageUrls.length === 0) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <Icon source="image-off-outline" size={48} color={COLORS.onSurfaceVariant} />
      </View>
    );
  }

  return (
    <View style={{ width, height }}>
      <FlatList
        data={imageUrls}
        keyExtractor={(uri, i) => `${uri}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item }) => (
          <AppImage source={{ uri: item }} style={{ width, height }} />
        )}
      />
      {imageUrls.length > 1 && (
        <View style={styles.dots}>
          {imageUrls.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: COLORS.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  dotActive: { backgroundColor: COLORS.primary, width: 18 },
});
