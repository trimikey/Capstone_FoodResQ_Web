import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput, ActivityIndicator, FAB, Chip } from 'react-native-paper';
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
import { ListingsStateView } from '@/components/ListingsStateView';

const COLORS = {
  primary: '#10b981',
  background: '#f8f9ff',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
};

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
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: dm.bg }]}>
            <Text style={[styles.badgeText, { color: dm.color }]}>{dm.label}</Text>
          </View>
          {item.servings > 0 ? (
            <Text style={styles.metaText}>{item.servings} suất</Text>
          ) : null}
          <Text style={styles.metaText}>{item.ingredientCount} nguyên liệu</Text>
        </View>
        <Text style={styles.author} numberOfLines={1}>
          {item.authorName}{item.timesUsed > 0 ? ` · dùng ${item.timesUsed} lần` : ''}
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
      return <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />;
    }
    if (query.isError) {
      return <ListingsStateView variant="error" onRetry={() => query.refetch()} />;
    }
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons name="chef-hat" size={44} color={COLORS.primary} />
        </View>
        <Text style={styles.emptyTitle}>
          {tab === 'mine' ? 'Bạn chưa có công thức nào' : 'Chưa có công thức phù hợp'}
        </Text>
        <Text style={styles.emptyBody}>
          {tab === 'mine'
            ? 'Tạo công thức đầu tiên để chia sẻ với cộng đồng bếp ăn.'
            : 'Thử từ khoá khác hoặc quay lại sau.'}
        </Text>
      </View>
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

      <TextInput
        mode="outlined"
        placeholder="Tìm công thức…"
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

      <FlashList
        data={items}
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
          color="#fff"
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
  search: { marginHorizontal: 16, backgroundColor: COLORS.surface },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  tabChip: { backgroundColor: COLORS.surface, borderColor: COLORS.outline },
  tabChipActive: { backgroundColor: COLORS.primary },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 96 },
  card: {
    flexDirection: 'row', gap: 12, backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.outline,
  },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: '#f3f4f6' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, justifyContent: 'center', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.onSurface, lineHeight: 21 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  metaText: { fontSize: 12, color: COLORS.onSurfaceVariant },
  author: { fontSize: 12, color: COLORS.onSurfaceVariant },
  emptyWrap: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#ecfdf5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.onSurface, marginBottom: 6, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  fab: { position: 'absolute', right: 20, bottom: 24, backgroundColor: COLORS.primary },
});
