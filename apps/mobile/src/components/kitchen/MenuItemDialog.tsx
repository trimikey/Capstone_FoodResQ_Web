import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Portal, Dialog, Button, TextInput, Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAddMenuItem } from '@/hooks/useKitchenOps';
import { useRecipes } from '@/hooks/useRecipes';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';

interface Props {
  visible: boolean;
  campaignId: string;
  onDismiss: () => void;
}

const COLORS = {
  primary: '#10b981',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
};

type Mode = 'recipe' | 'custom';

/** Charity thêm món vào thực đơn — chọn từ thư viện công thức hoặc nhập món tự do. */
export function MenuItemDialog({ visible, campaignId, onDismiss }: Props) {
  const addMut = useAddMenuItem();
  const [mode, setMode] = useState<Mode>('recipe');
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [servings, setServings] = useState('');
  const { data, isLoading } = useRecipes('');

  const recipes = data?.items ?? [];

  const reset = () => {
    setMode('recipe');
    setRecipeId(null);
    setCustomName('');
    setServings('');
  };

  const handleDismiss = () => {
    if (addMut.isPending) return;
    reset();
    onDismiss();
  };

  const handleSubmit = async () => {
    if (mode === 'recipe' && !recipeId) {
      Popup.show({ type: 'warning', text1: 'Chưa chọn công thức' });
      return;
    }
    if (mode === 'custom' && !customName.trim()) {
      Popup.show({ type: 'warning', text1: 'Chưa nhập tên món' });
      return;
    }
    const n = parseInt(servings, 10);
    try {
      await addMut.mutateAsync({
        campaignId,
        ...(mode === 'recipe' ? { recipeId: recipeId! } : { customName: customName.trim() }),
        ...(Number.isFinite(n) && n > 0 ? { plannedServings: n } : {}),
      });
      Popup.show({ type: 'success', text1: 'Đã thêm món' });
      reset();
      onDismiss();
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Thêm món thất bại', text2: getErrorMessage(err) });
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>Thêm món vào thực đơn</Dialog.Title>
        <Dialog.Content>
          <View style={styles.modeRow}>
            <ModeBtn label="Từ công thức" on={mode === 'recipe'} onPress={() => setMode('recipe')} />
            <ModeBtn label="Món tự do" on={mode === 'custom'} onPress={() => setMode('custom')} />
          </View>

          {mode === 'recipe' ? (
            isLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} />
            ) : recipes.length === 0 ? (
              <Text style={styles.muted}>Chưa có công thức nào trong thư viện. Hãy tạo công thức trước hoặc dùng &quot;Món tự do&quot;.</Text>
            ) : (
              <ScrollView style={styles.recipeList} nestedScrollEnabled>
                {recipes.map((r) => {
                  const sel = recipeId === r.id;
                  return (
                    <Pressable key={r.id} onPress={() => setRecipeId(r.id)} style={[styles.recipeRow, sel && styles.recipeRowSel]}>
                      <MaterialCommunityIcons
                        name={sel ? 'radiobox-marked' : 'radiobox-blank'}
                        size={20} color={sel ? COLORS.primary : COLORS.onSurfaceVariant}
                      />
                      <Text style={styles.recipeName} numberOfLines={1}>{r.name}</Text>
                      {r.servings > 0 ? <Text style={styles.muted}>{r.servings} suất</Text> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )
          ) : (
            <TextInput
              mode="outlined" label="Tên món *" placeholder="VD: Canh rau củ"
              value={customName} onChangeText={setCustomName}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary}
              style={styles.input} disabled={addMut.isPending}
            />
          )}

          <TextInput
            mode="outlined" label="Số suất dự kiến (tuỳ chọn)" keyboardType="numeric"
            value={servings} onChangeText={setServings}
            outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary}
            style={[styles.input, { marginTop: 12 }]} disabled={addMut.isPending}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleDismiss} textColor={COLORS.onSurfaceVariant} disabled={addMut.isPending}>
            Huỷ
          </Button>
          <Button mode="contained" buttonColor={COLORS.primary} onPress={handleSubmit}
            loading={addMut.isPending} disabled={addMut.isPending}>
            Thêm món
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function ModeBtn({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.modeBtn, on && styles.modeBtnOn]}>
      <Text style={[styles.modeText, on && styles.modeTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: 20 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.outline, alignItems: 'center' },
  modeBtnOn: { backgroundColor: '#ecfdf5', borderColor: COLORS.primary },
  modeText: { fontSize: 14, color: COLORS.onSurfaceVariant, fontWeight: '600' },
  modeTextOn: { color: COLORS.primary },
  recipeList: { maxHeight: 220 },
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  recipeRowSel: { backgroundColor: '#ecfdf5' },
  recipeName: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  input: { backgroundColor: COLORS.surface },
  muted: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 19 },
});
