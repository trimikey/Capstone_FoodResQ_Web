import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput, Button, Chip, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useCreateRecipe,
  useUpdateRecipe,
  useUploadRecipeImage,
  useRecipeDetail,
  difficultyMeta,
  type RecipeInput,
  type RecipeDifficulty,
  type RecipeIngredient,
} from '@/hooks/useRecipes';
import { useMyProfile } from '@/hooks/useProfile';
import { pickImageFromLibrary, captureImage } from '@/services/faceCapture';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { AppImage } from '@/components/ui/AppImage';
import { Popup } from '@/components/ui/AppPopup';
import { mobileColors as COLORS } from '@/theme/design';

const DIFFICULTIES: RecipeDifficulty[] = ['easy', 'medium', 'hard'];

/** Chuỗi số → số nguyên dương (rỗng/không hợp lệ = undefined). */
function toIntOrUndef(s: string): number | undefined {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

interface IngredientRow { name: string; quantity: string; unit: string }

/**
 * Tạo/sửa công thức nấu ăn (chef/admin). Có `?id` → chế độ sửa (prefill).
 * Ảnh upload qua /recipes/upload-image → lấy URL gắn vào imageUrls.
 */
export default function RecipeFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const { data: existing, isLoading: loadingExisting } = useRecipeDetail(isEdit ? id : undefined);
  const createMut = useCreateRecipe();
  const updateMut = useUpdateRecipe();
  const uploadMut = useUploadRecipeImage();

  const canAuthor =
    profile?.role === 'admin' ||
    !!profile?.volunteer?.specializations?.some((s) => s.specialization === 'chef');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState('');
  const [prep, setPrep] = useState('');
  const [cook, setCook] = useState('');
  const [difficulty, setDifficulty] = useState<RecipeDifficulty>('medium');
  const [instructions, setInstructions] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [ingName, setIngName] = useState('');
  const [ingQty, setIngQty] = useState('');
  const [ingUnit, setIngUnit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill khi sửa (1 lần khi data về).
  useEffect(() => {
    if (!isEdit || prefilled || !existing) return;
    const t = setTimeout(() => {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setServings(existing.servings ? String(existing.servings) : '');
      setPrep(existing.prepMinutes ? String(existing.prepMinutes) : '');
      setCook(existing.cookMinutes ? String(existing.cookMinutes) : '');
      setDifficulty(existing.difficulty);
      setInstructions(existing.instructions ?? '');
      setImageUrls(existing.imageUrls ?? []);
      setIngredients(
        existing.ingredients.map((i: RecipeIngredient) => ({
          name: i.name,
          quantity: i.quantity ?? '',
          unit: i.unit ?? '',
        }))
      );
      setPrefilled(true);
    }, 0);
    return () => clearTimeout(t);
  }, [isEdit, prefilled, existing]);

  const addIngredient = () => {
    const n = ingName.trim();
    if (!n) return;
    setIngredients((prev) => [...prev, { name: n, quantity: ingQty.trim(), unit: ingUnit.trim() }]);
    setIngName('');
    setIngQty('');
    setIngUnit('');
  };

  const uploadPhoto = async (pick: () => Promise<any>) => {
    try {
      const photo = await pick();
      if (!photo) return;
      const { url } = await uploadMut.mutateAsync(photo);
      setImageUrls((prev) => [...prev, url]);
    } catch (e) {
      Popup.show({ type: 'error', text1: 'Tải ảnh thất bại', text2: getErrorMessage(e) });
    }
  };

  const onSubmit = async () => {
    if (name.trim().length < 3) {
      Popup.show({ type: 'warning', text1: 'Tên quá ngắn', text2: 'Tên công thức cần tối thiểu 3 ký tự.' });
      return;
    }
    const payload: RecipeInput = {
      name: name.trim(),
      difficulty,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(toIntOrUndef(servings) ? { servings: toIntOrUndef(servings) } : {}),
      ...(toIntOrUndef(prep) ? { prepMinutes: toIntOrUndef(prep) } : {}),
      ...(toIntOrUndef(cook) ? { cookMinutes: toIntOrUndef(cook) } : {}),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      ...(imageUrls.length ? { imageUrls } : {}),
      ...(ingredients.length
        ? {
            ingredients: ingredients.map((i) => ({
              name: i.name,
              ...(i.quantity ? { quantity: i.quantity } : {}),
              ...(i.unit ? { unit: i.unit } : {}),
            })),
          }
        : {}),
    };

    try {
      setSubmitting(true);
      if (isEdit && id) {
        await updateMut.mutateAsync({ id, input: payload });
        Popup.show({ type: 'success', text1: 'Đã cập nhật công thức' });
      } else {
        await createMut.mutateAsync(payload);
        Popup.show({ type: 'success', text1: 'Đã tạo công thức' });
      }
      router.back();
    } catch (e) {
      Popup.show({ type: 'error', text1: 'Lưu thất bại', text2: getErrorMessage(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const Header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
      </Pressable>
      <Text variant="titleMedium" style={styles.headerTitle}>
        {isEdit ? 'Sửa công thức' : 'Tạo công thức'}
      </Text>
      <View style={{ width: 24 }} />
    </View>
  );

  if (profileLoading || (isEdit && loadingExisting && !prefilled)) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  // Chặn user không đủ quyền (phòng khi vào thẳng route).
  if (!canAuthor) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <View style={styles.center}>
          <MaterialCommunityIcons name="lock-outline" size={48} color={COLORS.onSurfaceVariant} />
          <Text style={styles.blockedText}>
            Chỉ đầu bếp (tình nguyện viên chuyên môn chef) hoặc quản trị viên mới đóng góp công thức.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {Header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field label="Tên công thức *">
            <TextInput
              mode="outlined" placeholder="VD: Cơm thịt kho tàu" value={name} onChangeText={setName}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input}
            />
          </Field>

          <Field label="Mô tả (tuỳ chọn)">
            <TextInput
              mode="outlined" multiline numberOfLines={3} value={description} onChangeText={setDescription}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input}
            />
          </Field>

          <View style={styles.rowFields}>
            <NumField label="Khẩu phần" value={servings} onChange={setServings} />
            <NumField label="Sơ chế (phút)" value={prep} onChange={setPrep} />
            <NumField label="Nấu (phút)" value={cook} onChange={setCook} />
          </View>

          <Text style={styles.sectionLabel}>Độ khó</Text>
          <View style={styles.diffRow}>
            {DIFFICULTIES.map((d) => {
              const dm = difficultyMeta(d);
              const on = difficulty === d;
              return (
                <Chip
                  key={d}
                  selected={on}
                  showSelectedCheck={false}
                  onPress={() => setDifficulty(d)}
                  style={[styles.diffChip, on && { backgroundColor: dm.bg, borderColor: dm.color }]}
                  textStyle={on ? { color: dm.color, fontWeight: '700' } : undefined}
                >
                  {dm.label}
                </Chip>
              );
            })}
          </View>

          {/* Nguyên liệu */}
          <Text style={styles.sectionLabel}>Nguyên liệu</Text>
          {ingredients.map((ing, i) => (
            <View key={i} style={styles.listRow}>
              <MaterialCommunityIcons name="circle-small" size={20} color={COLORS.onSurfaceVariant} />
              <Text style={styles.listText}>
                {ing.name}{ing.quantity || ing.unit ? ` — ${[ing.quantity, ing.unit].filter(Boolean).join(' ')}` : ''}
              </Text>
              <Pressable onPress={() => setIngredients((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.danger} />
              </Pressable>
            </View>
          ))}
          <View style={styles.rowFields}>
            <TextInput
              mode="outlined" dense placeholder="Tên nguyên liệu" value={ingName} onChangeText={setIngName}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 2 }]}
            />
            <TextInput
              mode="outlined" dense placeholder="SL" value={ingQty} onChangeText={setIngQty}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 1 }]}
            />
            <TextInput
              mode="outlined" dense placeholder="Đơn vị" value={ingUnit} onChangeText={setIngUnit}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 1 }]}
            />
          </View>
          <Button mode="text" icon="plus" textColor={COLORS.primary} onPress={addIngredient} compact style={styles.addBtn}>
            Thêm nguyên liệu
          </Button>

          <Field label="Cách làm (mỗi bước một dòng)">
            <TextInput
              mode="outlined" multiline numberOfLines={6} value={instructions} onChangeText={setInstructions}
              placeholder={'1. Sơ chế nguyên liệu\n2. ...'}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input}
            />
          </Field>

          {/* Ảnh */}
          <Text style={styles.sectionLabel}>Ảnh món ăn</Text>
          <View style={styles.imgRow}>
            {imageUrls.map((url, i) => (
              <View key={url + i} style={styles.imgWrap}>
                <AppImage source={url} style={styles.img} contentFit="cover" />
                <Pressable
                  onPress={() => setImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                  style={styles.imgRemove}
                  hitSlop={6}
                >
                  <MaterialCommunityIcons name="close-circle" size={22} color={COLORS.danger} />
                </Pressable>
              </View>
            ))}
            {uploadMut.isPending ? (
              <View style={[styles.img, styles.imgAdd]}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Pressable style={[styles.img, styles.imgAdd]} onPress={() => uploadPhoto(() => pickImageFromLibrary('recipe'))}>
                  <MaterialCommunityIcons name="image-plus" size={26} color={COLORS.primary} />
                </Pressable>
                <Pressable style={[styles.img, styles.imgAdd]} onPress={() => uploadPhoto(() => captureImage('id_card', 'recipe'))}>
                  <MaterialCommunityIcons name="camera-plus-outline" size={26} color={COLORS.primary} />
                </Pressable>
              </View>
            )}
          </View>

          <Button
            mode="contained" onPress={onSubmit} loading={submitting} disabled={submitting}
            buttonColor={COLORS.primary} style={styles.submitBtn} labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
          >
            {isEdit ? 'Lưu thay đổi' : 'Tạo công thức'}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.numLabel}>{label}</Text>
      <TextInput
        mode="outlined" keyboardType="numeric" value={value} onChangeText={onChange}
        outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input} dense
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, paddingHorizontal: 16, backgroundColor: COLORS.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: COLORS.outline,
  },
  headerTitle: { fontWeight: '700', color: COLORS.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  blockedText: { fontSize: 15, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 22 },
  content: { padding: 20, paddingBottom: 48 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.onSurfaceVariant, marginBottom: 8 },
  numLabel: { fontSize: 12, color: COLORS.onSurfaceVariant, marginBottom: 6, textAlign: 'center' },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface, marginTop: 8, marginBottom: 10 },
  input: { backgroundColor: COLORS.surface },
  rowFields: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 4 },
  diffRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  diffChip: { backgroundColor: COLORS.surface, borderColor: COLORS.outline, borderWidth: 1 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  listText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  addBtn: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 8 },
  imgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  imgWrap: { position: 'relative' },
  img: { width: 84, height: 84, borderRadius: 12, backgroundColor: '#f3f4f6' },
  imgAdd: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.outline, borderStyle: 'dashed' },
  imgRemove: { position: 'absolute', top: -8, right: -8, backgroundColor: '#fff', borderRadius: 11 },
  submitBtn: { marginTop: 20, borderRadius: 12, paddingVertical: 4 },
});
