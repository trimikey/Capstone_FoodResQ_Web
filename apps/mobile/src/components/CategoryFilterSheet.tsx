import { forwardRef, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Text, Chip } from 'react-native-paper';
import type { FoodCategory } from '../hooks/useListings';
import { CATEGORY_LABELS } from '../utils/listingFormat';

const COLORS = { primary: '#10b981', onSurface: '#121c2a', onSurfaceVariant: '#6b7280' };

/** Các category cho phép lọc (khớp nhãn vi-VN). */
const FILTER_CATEGORIES = Object.keys(CATEGORY_LABELS) as FoodCategory[];

interface Props {
  selected: FoodCategory | null;
  onSelect: (category: FoodCategory | null) => void;
}

/**
 * Bottom-sheet chọn category. Dùng inline (ref-based) — parent giữ ref và gọi
 * expand()/close(), không cần BottomSheetModalProvider ở root.
 */
export const CategoryFilterSheet = forwardRef<BottomSheet, Props>(
  ({ selected, onSelect }, ref) => {
    const snapPoints = useMemo(() => ['50%'], []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      []
    );

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView style={styles.content}>
          <Text variant="titleMedium" style={styles.title}>
            Lọc theo loại thực phẩm
          </Text>
          <View style={styles.chips}>
            <Chip
              selected={selected == null}
              showSelectedCheck
              onPress={() => onSelect(null)}
              style={styles.chip}
              selectedColor={COLORS.primary}
            >
              Tất cả
            </Chip>
            {FILTER_CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                selected={selected === cat}
                showSelectedCheck
                onPress={() => onSelect(cat)}
                style={styles.chip}
                selectedColor={COLORS.primary}
              >
                {CATEGORY_LABELS[cat]}
              </Chip>
            ))}
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

CategoryFilterSheet.displayName = 'CategoryFilterSheet';

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  title: { fontWeight: '700', color: COLORS.onSurface, marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginBottom: 4 },
});
