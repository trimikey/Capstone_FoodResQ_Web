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
import { Text, TextInput, Button, Chip, HelperText } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  createListingSchema,
  type CreateListingFormInput,
} from '@/utils/validators';
import { useCreateListing, type CreateListingInput } from '@/hooks/useProviderListings';
import { getCurrentCoords, type Coords } from '@/services/geolocation';
import {
  pickAndUploadListingImages,
  ImagePickCancelledError,
} from '@/services/listingImageUpload';
import { CATEGORY_LABELS, UNIT_LABELS } from '@/utils/listingFormat';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { AppImage } from '@/components/ui/AppImage';

const COLORS = {
  primary: '#10b981',
  background: '#f8f9ff',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
  error: '#ba1a1a',
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);
const UNIT_KEYS = Object.keys(UNIT_LABELS);

function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Mở picker chọn ngày rồi giờ (Android), trả Date đã chọn. */
function openDateTimePicker(current: Date, onPick: (d: Date) => void) {
  DateTimePickerAndroid.open({
    value: current,
    mode: 'date',
    onChange: (_e, date) => {
      if (!date) return;
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        is24Hour: true,
        onChange: (_e2, dt) => {
          if (dt) onPick(dt);
        },
      });
    },
  });
}

export default function CreateListingScreen() {
  const createListing = useCreateListing();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // mặc định: bắt đầu = +1h, kết thúc = +3h, hạn dùng = +5h
  const now = new Date();
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateListingFormInput>({
    resolver: zodResolver(createListingSchema),
    defaultValues: {
      title: '',
      category: '',
      quantityTotal: undefined as unknown as number,
      quantityUnit: 'portion',
      maxPerReservation: 1,
      pickupStartTime: new Date(now.getTime() + 1 * 3600_000),
      pickupEndTime: new Date(now.getTime() + 3 * 3600_000),
      expiryTime: new Date(now.getTime() + 5 * 3600_000),
      pickupAddress: '',
      description: '',
      weightPerUnitKg: undefined,
      storageConditions: '',
      allergenNotes: '',
    },
  });

  useEffect(() => {
    getCurrentCoords().then(({ coords }) => setCoords(coords));
  }, []);

  const category = watch('category');
  const quantityUnit = watch('quantityUnit');
  const pickupStart = watch('pickupStartTime');
  const pickupEnd = watch('pickupEndTime');
  const expiry = watch('expiryTime');

  const handlePickImages = async () => {
    try {
      setUploading(true);
      const urls = await pickAndUploadListingImages(5);
      setImageUrls(urls);
      Popup.show({ type: 'success', text1: `Đã tải ${urls.length} ảnh` });
    } catch (err) {
      if (err instanceof ImagePickCancelledError) return;
      Popup.show({ type: 'error', text1: 'Tải ảnh thất bại', text2: getErrorMessage(err) });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (form: CreateListingFormInput) => {
    if (!coords) {
      Popup.show({ type: 'warning', text1: 'Chưa lấy được vị trí', text2: 'Vui lòng thử lại sau giây lát.' });
      return;
    }
    const payload: CreateListingInput = {
      title: form.title,
      category: form.category,
      quantityTotal: form.quantityTotal,
      quantityUnit: form.quantityUnit,
      maxPerReservation: form.maxPerReservation,
      pickupStartTime: form.pickupStartTime.toISOString(),
      pickupEndTime: form.pickupEndTime.toISOString(),
      expiryTime: form.expiryTime.toISOString(),
      pickupAddress: form.pickupAddress,
      lat: coords.lat,
      lng: coords.lng,
      ...(form.description ? { description: form.description } : {}),
      ...(form.weightPerUnitKg ? { weightPerUnitKg: form.weightPerUnitKg } : {}),
      ...(form.storageConditions ? { storageConditions: form.storageConditions } : {}),
      ...(form.allergenNotes ? { allergenNotes: form.allergenNotes } : {}),
      ...(imageUrls.length ? { imageUrls } : {}),
    };
    try {
      setSubmitting(true);
      await createListing.mutateAsync(payload);
      Popup.show({ type: 'success', text1: 'Đã tạo tin (nháp)', text2: 'Bấm "Đăng tin" trong chi tiết để công khai.' });
      router.replace('/(app)/provider/listings');
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Tạo tin thất bại', text2: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text variant="titleMedium" style={styles.headerTitle}>Đăng tin mới</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Ảnh */}
          <Text style={styles.label}>Ảnh món ăn</Text>
          <View style={styles.imageRow}>
            {imageUrls.map((u) => (
              <AppImage key={u} source={{ uri: u }} style={styles.thumb} />
            ))}
            <Pressable style={styles.addImage} onPress={handlePickImages} disabled={uploading}>
              <MaterialCommunityIcons
                name={uploading ? 'progress-upload' : 'camera-plus'}
                size={28}
                color={COLORS.primary}
              />
              <Text style={styles.addImageText}>{uploading ? 'Đang tải...' : 'Thêm ảnh'}</Text>
            </Pressable>
          </View>

          {/* Tiêu đề */}
          <Field label="Tiêu đề *" error={errors.title?.message}>
            <Controller control={control} name="title" render={({ field: { onChange, value } }) => (
              <TextInput mode="outlined" placeholder="VD: Cơm hộp thừa cuối ngày" value={value} onChangeText={onChange}
                outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input} error={!!errors.title} />
            )} />
          </Field>

          {/* Loại */}
          <Field label="Loại thực phẩm *" error={errors.category?.message}>
            <View style={styles.chips}>
              {CATEGORY_KEYS.map((k) => (
                <Chip key={k} selected={category === k} showSelectedCheck
                  onPress={() => setValue('category', k, { shouldValidate: true })}
                  selectedColor={COLORS.primary} style={styles.chip}>
                  {CATEGORY_LABELS[k]}
                </Chip>
              ))}
            </View>
          </Field>

          {/* Số lượng + đơn vị */}
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <Field label="Số lượng *" error={errors.quantityTotal?.message}>
                <Controller control={control} name="quantityTotal" render={({ field: { onChange, value } }) => (
                  <TextInput mode="outlined" keyboardType="numeric" placeholder="VD: 20"
                    value={value ? String(value) : ''} onChangeText={onChange}
                    outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input} error={!!errors.quantityTotal} />
                )} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Đơn vị *">
                <View style={styles.chips}>
                  {UNIT_KEYS.map((u) => (
                    <Chip key={u} selected={quantityUnit === u} compact
                      onPress={() => setValue('quantityUnit', u, { shouldValidate: true })}
                      selectedColor={COLORS.primary} style={styles.chip}>
                      {UNIT_LABELS[u]}
                    </Chip>
                  ))}
                </View>
              </Field>
            </View>
          </View>

          {/* Max per reservation */}
          <Field label="Tối đa mỗi lượt đặt (1-10) *" error={errors.maxPerReservation?.message}>
            <Controller control={control} name="maxPerReservation" render={({ field: { onChange, value } }) => (
              <TextInput mode="outlined" keyboardType="numeric" value={value ? String(value) : ''} onChangeText={onChange}
                outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input} error={!!errors.maxPerReservation} />
            )} />
          </Field>

          {/* Thời gian */}
          <Field label="Giờ bắt đầu lấy *">
            <DateButton value={pickupStart} onPress={() => openDateTimePicker(pickupStart, (d) => setValue('pickupStartTime', d, { shouldValidate: true }))} />
          </Field>
          <Field label="Giờ kết thúc lấy *" error={errors.pickupEndTime?.message}>
            <DateButton value={pickupEnd} onPress={() => openDateTimePicker(pickupEnd, (d) => setValue('pickupEndTime', d, { shouldValidate: true }))} />
          </Field>
          <Field label="Hạn sử dụng *" error={errors.expiryTime?.message}>
            <DateButton value={expiry} onPress={() => openDateTimePicker(expiry, (d) => setValue('expiryTime', d, { shouldValidate: true }))} />
          </Field>

          {/* Địa chỉ */}
          <Field label="Địa chỉ lấy hàng *" error={errors.pickupAddress?.message}>
            <Controller control={control} name="pickupAddress" render={({ field: { onChange, value } }) => (
              <TextInput mode="outlined" placeholder="VD: 12 Nguyễn Huệ, Q1" value={value} onChangeText={onChange}
                outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input} error={!!errors.pickupAddress} />
            )} />
          </Field>
          <HelperText type="info" visible={true} style={{ marginTop: -8 }}>
            {coords ? '📍 Đã lấy toạ độ vị trí hiện tại của bạn' : 'Đang lấy vị trí…'}
          </HelperText>

          {/* Optional */}
          <Field label="Mô tả (tuỳ chọn)">
            <Controller control={control} name="description" render={({ field: { onChange, value } }) => (
              <TextInput mode="outlined" multiline numberOfLines={3} value={value} onChangeText={onChange}
                outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input} />
            )} />
          </Field>
          <Field label="Lưu ý dị ứng (tuỳ chọn)">
            <Controller control={control} name="allergenNotes" render={({ field: { onChange, value } }) => (
              <TextInput mode="outlined" value={value} onChangeText={onChange}
                outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input} />
            )} />
          </Field>

          <Button mode="contained" onPress={handleSubmit(onSubmit)} loading={submitting}
            disabled={submitting || uploading} buttonColor={COLORS.primary} style={styles.submitBtn}
            labelStyle={{ fontSize: 16, fontWeight: 'bold' }}>
            Tạo tin
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function DateButton({ value, onPress }: { value: Date; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.dateBtn}>
      <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.onSurfaceVariant} />
      <Text style={styles.dateText}>{fmtDateTime(value)}</Text>
    </Pressable>
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
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.onSurfaceVariant, marginBottom: 8 },
  input: { backgroundColor: COLORS.surface },
  errorText: { fontSize: 12, color: COLORS.error, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginBottom: 4 },
  rowFields: { flexDirection: 'row', gap: 12 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  thumb: { width: 80, height: 80, borderRadius: 12, backgroundColor: COLORS.outline },
  addImage: {
    width: 80, height: 80, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
    borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  addImageText: { fontSize: 10, color: COLORS.primary, fontWeight: '600' },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: COLORS.surface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.outline,
  },
  dateText: { fontSize: 15, color: COLORS.onSurface },
  submitBtn: { marginTop: 12, borderRadius: 12, paddingVertical: 4 },
});
