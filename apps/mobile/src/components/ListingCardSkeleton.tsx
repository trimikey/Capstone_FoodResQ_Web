import { View, StyleSheet, useWindowDimensions } from 'react-native';
import ContentLoader, { Rect } from 'react-content-loader/native';

/** Skeleton 1 card listing trong lúc tải (khớp layout ListingCard). */
export function ListingCardSkeleton() {
  const { width } = useWindowDimensions();
  const w = width - 40; // trừ padding ngang 20 mỗi bên
  return (
    <View style={styles.wrap}>
      <ContentLoader
        speed={1.2}
        width={w}
        height={252}
        viewBox={`0 0 ${w} 252`}
        backgroundColor="#e5e7eb"
        foregroundColor="#f3f4f6"
      >
        <Rect x="0" y="0" rx="16" ry="16" width={w} height="160" />
        <Rect x="0" y="176" rx="6" ry="6" width={w * 0.7} height="16" />
        <Rect x="0" y="204" rx="6" ry="6" width={w * 0.45} height="12" />
        <Rect x="0" y="228" rx="6" ry="6" width={w * 0.55} height="12" />
      </ContentLoader>
    </View>
  );
}

/** Danh sách nhiều skeleton (loading lần đầu). */
export function ListingListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
});
