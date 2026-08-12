import { forwardRef, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Button, Checkbox, Text } from 'react-native-paper';
import type { FoodCategory } from '../hooks/useListings';
import { CATEGORY_LABELS, categoryLabel } from '../utils/listingFormat';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

const FILTER_CATEGORIES = Object.keys(CATEGORY_LABELS) as FoodCategory[];
const DISTANCE_OPTIONS = [2, 5, 10, 20, 50] as const;
const DEFAULT_RADIUS_KM = 5;

export type PickupTimeFilter = 'all' | 'open_now' | 'today' | 'soon';

export interface FilterApplyPayload {
  category: FoodCategory | null;
  radiusKm: number;
  pickupTime: PickupTimeFilter;
}

export type FilterSectionKey = 'distance' | 'time' | 'category';

const PICKUP_TIME_OPTIONS: { value: PickupTimeFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'open_now', label: 'Đang nhận' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'soon', label: 'Sắp hết hạn (<2h)' },
];

interface Props {
  selected: FoodCategory | null;
  radiusKm: number;
  pickupTime: PickupTimeFilter;
  initialSection?: FilterSectionKey;
  onApply: (payload: FilterApplyPayload) => void;
  onClear: () => void;
}

const TAB_BAR_HEIGHT = 60;

export const CategoryFilterSheet = forwardRef<BottomSheet, Props>(
  ({ selected, radiusKm, pickupTime, initialSection = 'distance', onApply, onClear }, ref) => {
    const { bottom: safeBottom } = useSafeAreaInsets();
    const bottomInset = TAB_BAR_HEIGHT + safeBottom;
    const snapPoints = useMemo(() => ['78%'], []);
    const [draftCategory, setDraftCategory] = useState<FoodCategory | null>(selected);
    const [draftRadiusKm, setDraftRadiusKm] = useState(radiusKm);
    const [draftPickupTime, setDraftPickupTime] = useState<PickupTimeFilter>(pickupTime);
    const [expandedSections, setExpandedSections] = useState<FilterSectionKey[]>([initialSection]);

    const handleSheetChange = useCallback((index: number) => {
      if (index < 0) return;
      setDraftCategory(selected);
      setDraftRadiusKm(radiusKm);
      setDraftPickupTime(pickupTime);
      setExpandedSections([initialSection]);
    }, [initialSection, pickupTime, radiusKm, selected]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      []
    );

    const toggleSection = (section: FilterSectionKey) => {
      setExpandedSections((current) =>
        current.includes(section)
          ? current.filter((item) => item !== section)
          : [...current, section]
      );
    };

    const clearDraft = () => {
      setDraftCategory(null);
      setDraftRadiusKm(DEFAULT_RADIUS_KM);
      setDraftPickupTime('all');
      onClear();
    };

    const applyDraft = () => {
      onApply({
        category: draftCategory,
        radiusKm: draftRadiusKm,
        pickupTime: draftPickupTime,
      });
    };

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        bottomInset={bottomInset}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onChange={handleSheetChange}
      >
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.title}>
            Bộ lọc tìm kiếm
          </Text>
        </View>

        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <FilterSection
            title="Khoảng cách"
            summary={`${draftRadiusKm}km`}
            expanded={expandedSections.includes('distance')}
            onPress={() => toggleSection('distance')}
          >
            {DISTANCE_OPTIONS.map((distance) => (
              <CheckboxRow
                key={distance}
                label={`Trong ${distance}km`}
                selected={draftRadiusKm === distance}
                onPress={() => setDraftRadiusKm(distance)}
              />
            ))}
          </FilterSection>

          <FilterSection
            title="Thời gian nhận"
            summary={PICKUP_TIME_OPTIONS.find((item) => item.value === draftPickupTime)?.label ?? 'Tất cả'}
            expanded={expandedSections.includes('time')}
            onPress={() => toggleSection('time')}
          >
            {PICKUP_TIME_OPTIONS.map((option) => (
              <CheckboxRow
                key={option.value}
                label={option.label}
                selected={draftPickupTime === option.value}
                onPress={() => setDraftPickupTime(option.value)}
              />
            ))}
          </FilterSection>

          <FilterSection
            title="Loại thực phẩm"
            summary={draftCategory ? categoryLabel(draftCategory) : 'Tất cả'}
            expanded={expandedSections.includes('category')}
            onPress={() => toggleSection('category')}
          >
            <CheckboxRow
              label="Tất cả"
              selected={draftCategory == null}
              onPress={() => setDraftCategory(null)}
            />
            {FILTER_CATEGORIES.map((cat) => (
              <CheckboxRow
                key={cat}
                label={CATEGORY_LABELS[cat] ?? String(cat)}
                selected={draftCategory === cat}
                onPress={() => setDraftCategory(cat)}
              />
            ))}
          </FilterSection>
        </BottomSheetScrollView>

        <View style={[styles.footer, { paddingBottom: spacing.md + safeBottom }]}>
          <Button
            mode="outlined"
            icon="refresh"
            textColor={COLORS.primary}
            style={styles.footerButton}
            onPress={clearDraft}
          >
            Xóa lọc
          </Button>
          <Button
            mode="contained"
            icon="check"
            buttonColor={COLORS.primary}
            textColor={COLORS.onPrimary}
            style={styles.footerButton}
            onPress={applyDraft}
          >
            Áp dụng
          </Button>
        </View>
      </BottomSheet>
    );
  }
);

CategoryFilterSheet.displayName = 'CategoryFilterSheet';

function FilterSection({
  title,
  summary,
  expanded,
  onPress,
  children,
}: {
  title: string;
  summary: string;
  expanded: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
      >
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSummary} numberOfLines={1}>{summary}</Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '-' : '+'}</Text>
      </Pressable>
      {expanded ? <View style={styles.options}>{children}</View> : null}
    </View>
  );
}

function CheckboxRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
    >
      <Checkbox
        status={selected ? 'checked' : 'unchecked'}
        color={COLORS.primary}
        uncheckedColor={COLORS.onSurfaceVariant}
      />
      <Text style={[styles.optionLabel, selected && styles.optionLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    color: COLORS.onSurface,
    fontWeight: '900',
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  section: {
    borderRadius: radius.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    overflow: 'hidden',
  },
  sectionHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    color: COLORS.onSurface,
    fontSize: 14,
    fontWeight: '900',
  },
  sectionSummary: {
    marginTop: 2,
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
  },
  chevron: {
    width: 24,
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  options: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  optionRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingRight: spacing.md,
  },
  optionLabel: {
    flex: 1,
    color: COLORS.onSurface,
    fontSize: 14,
    fontWeight: '700',
  },
  optionLabelActive: {
    color: COLORS.primary,
    fontWeight: '900',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  footerButton: {
    flex: 1,
    borderRadius: radius.md,
  },
  pressed: {
    opacity: 0.78,
  },
});
