import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, Portal, Dialog } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRecipeDetail, useDeleteRecipe, difficultyMeta } from '@/hooks/useRecipes';
import { useMyProfile } from '@/hooks/useProfile';
import { AppImage } from '@/components/ui/AppImage';
import { Popup } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS } from '@/theme/design';

/** Một chỉ số nhỏ (servings/prep/cook). */
function Stat({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={20} color={COLORS.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Chi tiết công thức — ảnh, chỉ số, nguyên liệu, các bước. Chủ sở hữu/admin sửa/xoá. */
export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: r, isLoading, isError, refetch } = useRecipeDetail(id);
  const { data: profile } = useMyProfile();
  const deleteMut = useDeleteRecipe();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canEdit =
    !!r && !!profile && (profile.role === 'admin' || profile.id === r.createdByUserId);

  const Header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
      </Pressable>
      <Text variant="titleMedium" style={styles.headerTitle}>Công thức</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <ScreenState kind="loading" title="Đang tải công thức" />
      </SafeAreaView>
    );
  }

  if (isError || !r) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <ScreenState kind="error" title="Không tải được công thức" actionLabel="Thử lại" onAction={() => refetch()} />
      </SafeAreaView>
    );
  }

  const dm = difficultyMeta(r.difficulty);
  const steps = (r.instructions ?? '')
    .split('\n')
    .map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(r.id);
      Popup.show({ type: 'success', text1: 'Đã xoá công thức' });
      setConfirmDelete(false);
      router.back();
    } catch (e: any) {
      Popup.show({ type: 'error', text1: 'Xoá thất bại', text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.' });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {Header}
      <ScrollView contentContainerStyle={styles.content}>
        {r.imageUrls?.[0] ? (
          <AppImage source={r.imageUrls[0]} style={styles.hero} contentFit="cover" />
        ) : null}

        <View style={styles.titleRow}>
          <Text style={styles.title}>{r.name}</Text>
          <View style={[styles.badge, { backgroundColor: dm.bg }]}>
            <Text style={[styles.badgeText, { color: dm.color }]}>{dm.label}</Text>
          </View>
        </View>
        <Text style={styles.author}>
          {r.createdBy.fullName}{r.timesUsed > 0 ? ` - đã dùng ${r.timesUsed} lần` : ''}
        </Text>

        {r.description ? <Text style={styles.description}>{r.description}</Text> : null}

        <View style={styles.statsRow}>
          {r.servings > 0 ? <Stat icon="account-group-outline" label="Khẩu phần" value={`${r.servings}`} /> : null}
          {r.prepMinutes ? <Stat icon="knife" label="Sơ chế" value={`${r.prepMinutes}′`} /> : null}
          {r.cookMinutes ? <Stat icon="pot-steam-outline" label="Nấu" value={`${r.cookMinutes}′`} /> : null}
        </View>

        {r.ingredients.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Nguyên liệu</Text>
            {r.ingredients.map((ing, i) => (
              <View key={ing.id ?? i} style={styles.ingRow}>
                <MaterialCommunityIcons name="circle-small" size={20} color={COLORS.primary} />
                <Text style={styles.ingText}>
                  <Text style={styles.ingName}>{ing.name}</Text>
                  {ing.quantity || ing.unit ? ` - ${[ing.quantity, ing.unit].filter(Boolean).join(' ')}` : ''}
                  {ing.note ? ` (${ing.note})` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {steps.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cách làm</Text>
            {steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {canEdit ? (
          <View style={styles.actions}>
            <Button
              mode="outlined"
              icon="pencil"
              textColor={COLORS.primary}
              style={[styles.actionBtn, { borderColor: COLORS.primary }]}
              onPress={() => router.push(`/(app)/recipes/create?id=${r.id}`)}
            >
              Sửa
            </Button>
            <Button
              mode="outlined"
              icon="trash-can-outline"
              textColor={COLORS.danger}
              style={[styles.actionBtn, { borderColor: COLORS.danger }]}
              onPress={() => setConfirmDelete(true)}
            >
              Xoá
            </Button>
          </View>
        ) : null}
      </ScrollView>

      <Portal>
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)} style={{ borderRadius: 20 }}>
          <Dialog.Title style={{ fontSize: 18, fontWeight: '700' }}>Xoá công thức?</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: COLORS.onSurfaceVariant }}>
              Công thức “{r.name}” sẽ bị xoá. Hành động này không thể hoàn tác.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)} textColor={COLORS.onSurfaceVariant} disabled={deleteMut.isPending}>
              Huỷ
            </Button>
            <Button mode="contained" buttonColor={COLORS.danger} onPress={handleDelete} loading={deleteMut.isPending} disabled={deleteMut.isPending}>
              Xoá
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { padding: 20, paddingBottom: 40 },
  hero: { width: '100%', height: 200, borderRadius: 16, marginBottom: 16, backgroundColor: COLORS.surfaceContainerLow },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: COLORS.onSurface, lineHeight: 29 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  author: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 4 },
  description: { fontSize: 15, color: COLORS.onSurface, lineHeight: 22, marginTop: 12 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  stat: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 12,
    alignItems: 'center', gap: 2, borderWidth: 1, borderColor: COLORS.outline,
  },
  statValue: { fontSize: 16, fontWeight: '700', color: COLORS.onSurface },
  statLabel: { fontSize: 11, color: COLORS.onSurfaceVariant },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.onSurface, marginBottom: 12 },
  ingRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 3 },
  ingText: { flex: 1, fontSize: 15, color: COLORS.onSurface, lineHeight: 22 },
  ingName: { fontWeight: '600' },
  stepRow: { flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  stepNum: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepText: { flex: 1, fontSize: 15, color: COLORS.onSurface, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 28 },
  actionBtn: { flex: 1, borderRadius: 12 },
});
