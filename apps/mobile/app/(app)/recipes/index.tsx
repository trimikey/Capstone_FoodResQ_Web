import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput, FAB, Chip, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import {
  useRecipes,
  useMyRecipes,
  difficultyMeta,
  type RecipeListItem,
} from '@/hooks/useRecipes';
import { useMyProfile } from '@/hooks/useProfile';
import { AppImage } from '@/components/ui/AppImage';
import { ScreenState } from '@/components/ui/ScreenState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

type Tab = 'all' | 'mine';

/** Một thẻ công thức trong danh sách. */
function RecipeCard({ item, onPress }: { item: RecipeListItem; onPress: () => void }) {
  const dm = difficultyMeta(item.difficulty);
  const thumb = item.imageUrls?.[0];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      {thumb ? (
        <AppImage source={thumb} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <MaterialCommunityIcons name="silverware-fork-knife" size={28} color={COLORS.onSurfaceVariant} />
        </View>
      )}
      <View style={styles.recipeBadge}>
        <StatusBadge label={dm.label} tone="info" />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
        <View style={styles.metaRow}>
          {item.servings > 0 ? (
            <Text style={styles.metaText}>{item.servings} suất</Text>
          ) : null}
          <Text style={styles.metaText}>{item.ingredientCount} nguyên liệu</Text>
        </View>
        <Text style={styles.author} numberOfLines={1}>
          {item.authorName}{item.timesUsed > 0 ? ` - dùng ${item.timesUsed} lần` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Thư viện công thức nấu ăn — danh sách công khai (tab "Tất cả") + công thức của
 * tôi (tab "Của tôi"). Đầu bếp/admin thấy nút tạo mới.
 */
export default function RecipesScreen() {
  const [tab, setTab] = useState<Tab>('all');
  const [rawSearch, setRawSearch] = useState('');
  const [search, setSearch] = useState('');

  // Debounce ô tìm kiếm ~400ms.
  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch.trim()), 400);
    return () => clearTimeout(t);
  }, [rawSearch]);

  const allQuery = useRecipes(search);
  const mineQuery = useMyRecipes(tab === 'mine');
  const { data: profile } = useMyProfile();

  const canAuthor =
    profile?.role === 'admin' ||
    !!profile?.volunteer?.specializations?.some((s) => s.specialization === 'chef');

  const query = tab === 'all' ? allQuery : mineQuery;
  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  const renderEmpty = () => {
    if (query.isLoading) {
      return <ScreenState kind="loading" title="Đang tải công thức" />;
    }
    if (query.isError) {
      return <ScreenState kind="error" title="Không tải được công thức" onAction={() => query.refetch()} />;
    }
    return (
      <ScreenState
        kind="empty"
        icon="chef-hat"
        title={tab === 'mine' ? 'Bạn chưa có công thức nào' : 'Chưa có công thức phù hợp'}
        message={tab === 'mine'
          ? 'Tạo công thức đầu tiên để chia sẻ với cộng đồng bếp ăn.'
          : 'Thử từ khóa khác hoặc quay lại sau.'}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text variant="titleMedium" style={styles.headerTitle}>Công thức nấu ăn</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.hero}>
        <View style={styles.heroHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroKicker}>Kitchen playbook</Text>
            <Text style={styles.heroTitle}>Công thức cho bếp ăn cộng đồng</Text>
          </View>
          <IconButton icon="chef-hat" mode="contained" containerColor={COLORS.surface} iconColor={COLORS.primary} />
        </View>
        <TextInput
          mode="outlined"
          placeholder="Tìm công thức..."
          value={rawSearch}
          onChangeText={setRawSearch}
          left={<TextInput.Icon icon="magnify" />}
          right={rawSearch ? <TextInput.Icon icon="close" onPress={() => setRawSearch('')} /> : undefined}
          outlineColor={COLORS.outline}
          activeOutlineColor={COLORS.primary}
          style={styles.search}
          dense
        />

        <View style={styles.tabs}>
          {(['all', 'mine'] as Tab[]).map((t) => (
            <Chip
              key={t}
              selected={tab === t}
              showSelectedCheck={false}
              onPress={() => setTab(t)}
              style={[styles.tabChip, tab === t && styles.tabChipActive]}
              textStyle={tab === t ? styles.tabTextActive : undefined}
            >
              {t === 'all' ? 'Tất cả' : 'Của tôi'}
            </Chip>
          ))}
        </View>
      </View>

      <FlashList
        data={items}
        numColumns={2}
        keyExtractor={(item: RecipeListItem) => item.id}
        renderItem={({ item }: { item: RecipeListItem }) => (
          <RecipeCard item={item} onPress={() => router.push(`/(app)/recipes/${item.id}`)} />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmpty}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
      />

      {canAuthor ? (
        <FAB
          icon="plus"
          label="Tạo công thức"
          color={COLORS.onPrimary}
          style={styles.fab}
          onPress={() => router.push('/(app)/recipes/create')}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, paddingHorizontal: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontWeight: '700', color: COLORS.onSurface },
  hero: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: 28,
    padding: spacing.lg,
    backgroundColor: COLORS.primaryStrong,
    gap: spacing.md,
  },
  heroHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroKicker: { color: COLORS.secondaryContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { marginTop: 4, color: COLORS.onPrimary, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  search: { backgroundColor: COLORS.surface },
  tabs: { flexDirection: 'row', gap: 8 },
  tabChip: { backgroundColor: COLORS.surface, borderColor: COLORS.outline },
  tabChipActive: { backgroundColor: COLORS.primary },
  tabTextActive: { color: COLORS.onPrimary, fontWeight: '800' },
  list: { paddingHorizontal: 16, paddingBottom: 96 },
  card: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: COLORS.surface,
    borderRadius: radius.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    overflow: 'hidden',
    ...elevation.card,
  },
  thumb: { width: '100%', height: 116, backgroundColor: COLORS.neutralContainer },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  recipeBadge: { position: 'absolute', left: spacing.md, top: spacing.md },
  cardBody: { padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: 14, fontWeight: '900', color: COLORS.onSurface, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  author: { fontSize: 12, color: COLORS.onSurfaceVariant, fontWeight: '600' },
  emptyWrap: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#ecfdf5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.onSurface, marginBottom: 6, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  fab: { position: 'absolute', right: 20, bottom: 24, backgroundColor: COLORS.primary },
});
