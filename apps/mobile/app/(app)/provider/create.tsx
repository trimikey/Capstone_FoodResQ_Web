import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput, Button, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  createListingSchema,
  type CreateListingFormInput,
} from '@/utils/validators';
import { useAuth } from '@/hooks/useAuth';
import { useListingDetail } from '@/hooks/useListings';
import {
  useCreateListing,
  useUpdateListing,
  type CreateListingInput,
  type UpdateListingInput,
} from '@/hooks/useProviderListings';
import { getCurrentCoords, type Coords } from '@/services/geolocation';
import {
  pickAndUploadListingImages,
  ImagePickCancelledError,
} from '@/services/listingImageUpload';
import { CATEGORY_LABELS, UNIT_LABELS } from '@/utils/listingFormat';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { AppImage } from '@/components/ui/AppImage';
import { AddressPicker } from '@/components/AddressPicker';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compactLayout = width < 390;
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { user } = useAuth();
  const createListing = useCreateListing();
  const updateListing = useUpdateListing();
  const { data: editingListing } = useListingDetail(editId ?? '');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!editId;
  const editingIsPublished = !!editingListing && editingListing.status !== 'draft';
  const titleText = isEdit
    ? editingIsPublished
      ? 'Sửa thông tin phụ'
      : 'Sửa tin nháp'
    : 'Đăng tin mới';

  // mặc định: bắt đầu = +1h, kết thúc = +3h, hạn dùng = +5h
  const now = new Date();
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
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

  useEffect(() => {
    if (!editingListing) return;
    reset({
      title: editingListing.title ?? '',
      category: editingListing.category ?? '',
      quantityTotal: Number(editingListing.quantityTotal ?? editingListing.quantityRemaining) || 1,
      quantityUnit: editingListing.quantityUnit ?? 'portion',
      maxPerReservation: editingListing.maxPerReservation ?? 1,
      pickupStartTime: new Date(editingListing.pickupStartTime),
      pickupEndTime: new Date(editingListing.pickupEndTime),
      expiryTime: new Date(editingListing.expiryTime ?? editingListing.pickupEndTime),
      pickupAddress: editingListing.pickupAddress ?? '',
      description: editingListing.description ?? '',
      weightPerUnitKg: editingListing.weightPerUnitKg ?? undefined,
      storageConditions: editingListing.storageConditions ?? '',
      allergenNotes: editingListing.allergenNotes ?? '',
    });
    setCoords({ lat: editingListing.lat, lng: editingListing.lng });
    setImageUrls(editingListing.imageUrls ?? []);
  }, [editingListing, reset]);

  if (user && user.role !== 'provider') {
    return <Redirect href="/(app)/home" />;
  }

  const category = watch('category');
  const quantityUnit = watch('quantityUnit');
  const pickupAddress = watch('pickupAddress');
  const pickupStart = watch('pickupStartTime');
  const pickupEnd = watch('pickupEndTime');
  const expiry = watch('expiryTime');

  const handlePickImages = async () => {
    try {
      setUploading(true);
      const urls = await pickAndUploadListingImages(5);
      setImageUrls((prev) => [...prev, ...urls].slice(0, 5));
      Popup.show({ type: 'success', text1: `Đã tải ${urls.length} ảnh` });
    } catch (err) {
      if (err instanceof ImagePickCancelledError) return;
      Popup.show({ type: 'error', text1: 'Tải ảnh thất bại', text2: getErrorMessage(err) });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (url: string) => {
    setImageUrls((prev) => prev.filter((item) => item !== url));
  };

  const onSubmit = async (form: CreateListingFormInput) => {
    if (!coords) {
      Popup.show({ type: 'warning', text1: 'Chưa lấy được vị trí', text2: 'Vui lòng thử lại sau giây lát.' });
      return;
    }
    const fullPayload: CreateListingInput = {
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
    const updatePayload: UpdateListingInput = editingIsPublished
      ? {
          ...(form.description ? { description: form.description } : {}),
          ...(form.storageConditions ? { storageConditions: form.storageConditions } : {}),
          ...(form.allergenNotes ? { allergenNotes: form.allergenNotes } : {}),
          ...(imageUrls.length ? { imageUrls } : {}),
        }
      : fullPayload;
    try {
      setSubmitting(true);
      if (isEdit && editId) {
        await updateListing.mutateAsync({ id: editId, input: updatePayload });
        Popup.show({
          type: 'success',
          text1: editingIsPublished ? 'Đã cập nhật thông tin phụ' : 'Đã lưu tin nháp',
        });
      } else {
        await createListing.mutateAsync(fullPayload);
        Popup.show({ type: 'success', text1: 'Đã tạo tin (nháp)', text2: 'Bấm "Đăng tin" trong chi tiết để công khai.' });
      }
      router.replace('/(app)/provider/listings');
    } catch (err) {
      Popup.show({ type: 'error', text1: isEdit ? 'Lưu tin thất bại' : 'Tạo tin thất bại', text2: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text variant="titleMedium" style={styles.headerTitle}>{titleText}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {editingIsPublished ? 'Chỉ sửa mô tả, ảnh, bảo quản, dị ứng' : 'Tạo nháp trước, đăng sau khi kiểm tra'}
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.formArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 132 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Section
            icon="image-multiple-outline"
            title="Ảnh món ăn"
            helper="Tối đa 5 ảnh rõ món ăn và bao bì nếu có."
          >
            <View style={styles.imageRow}>
              {imageUrls.map((u, index) => (
                <View key={u} style={styles.thumbWrap}>
                  <AppImage source={{ uri: u }} style={styles.thumb} />
                  <Pressable
                    onPress={() => removeImage(u)}
                    hitSlop={8}
                    style={styles.removeImageBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Xoá ảnh ${index + 1}`}
                  >
                    <MaterialCommunityIcons name="close" size={16} color="#ffffff" />
                  </Pressable>
                </View>
              ))}
              {imageUrls.length < 5 ? (
                <Pressable
                  style={[styles.addImage, uploading && styles.controlDisabled]}
                  onPress={handlePickImages}
                  disabled={uploading}
                  accessibilityRole="button"
                  accessibilityLabel={uploading ? 'Đang tải ảnh món ăn' : 'Thêm ảnh món ăn'}
                  accessibilityState={{ disabled: uploading }}
                >
                  <MaterialCommunityIcons
                    name={uploading ? 'progress-upload' : 'camera-plus-outline'}
                    size={26}
                    color={COLORS.primary}
                  />
                  <Text style={styles.addImageText}>{uploading ? 'Đang tải' : 'Thêm ảnh'}</Text>
                </Pressable>
              ) : null}
            </View>
          </Section>

          {editingIsPublished ? (
            <View style={styles.lockNotice}>
              <MaterialCommunityIcons name="lock-outline" size={18} color="#0369a1" />
              <Text style={styles.lockNoticeText}>
                Tin đã đăng chỉ sửa mô tả, ảnh, bảo quản, dị ứng. Muốn đổi giờ, địa điểm hoặc số lượng hãy huỷ rồi tạo lại.
              </Text>
            </View>
          ) : null}

          <Section icon="food-apple-outline" title="Thông tin thực phẩm">
            <Field label="Tiêu đề *" error={errors.title?.message}>
              <Controller control={control} name="title" render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Tên món hoặc loại thực phẩm"
                  placeholder="VD: Cơm hộp cuối ngày"
                  value={value}
                  onChangeText={onChange}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  style={styles.input}
                  dense
                  error={!!errors.title}
                  disabled={editingIsPublished}
                />
              )} />
            </Field>

            <Field label="Loại thực phẩm *" error={errors.category?.message}>
              <View style={styles.chips}>
                {CATEGORY_KEYS.map((k) => {
                  const selected = category === k;
                  return (
                    <Chip
                      key={k}
                      selected={selected}
                      showSelectedCheck
                      onPress={() => !editingIsPublished && setValue('category', k, { shouldValidate: true })}
                      disabled={editingIsPublished}
                      selectedColor={selected ? COLORS.primary : COLORS.onSurface}
                      style={[styles.chip, selected && styles.chipSelected]}
                      textStyle={[styles.chipText, selected && styles.chipTextSelected]}
                    >
                      {CATEGORY_LABELS[k]}
                    </Chip>
                  );
                })}
              </View>
            </Field>
          </Section>

          <Section icon="scale-balance" title="Số lượng">
            <View style={[styles.rowFields, compactLayout && styles.rowFieldsStacked]}>
              <View style={styles.rowField}>
                <Field
                  label="Số lượng *"
                  helper="Nhập tổng số phần có thể chia sẻ."
                  error={errors.quantityTotal?.message}
                >
                  <Controller control={control} name="quantityTotal" render={({ field: { onChange, value } }) => (
                    <TextInput
                      mode="outlined"
                      label="Tổng số lượng"
                      keyboardType="numeric"
                      placeholder="VD: 20"
                      value={value ? String(value) : ''}
                      onChangeText={onChange}
                      outlineColor={COLORS.outline}
                      activeOutlineColor={COLORS.primary}
                      style={styles.input}
                      dense
                      error={!!errors.quantityTotal}
                      disabled={editingIsPublished}
                    />
                  )} />
                </Field>
              </View>
              <View style={styles.rowField}>
                <Field label="Đơn vị *">
                  <View style={styles.chips}>
                    {UNIT_KEYS.map((u) => {
                      const selected = quantityUnit === u;
                      return (
                        <Chip
                          key={u}
                          selected={selected}
                          compact={false}
                          onPress={() => !editingIsPublished && setValue('quantityUnit', u, { shouldValidate: true })}
                          disabled={editingIsPublished}
                          selectedColor={selected ? COLORS.primary : COLORS.onSurface}
                          style={[styles.chip, selected && styles.chipSelected]}
                          textStyle={[styles.chipText, selected && styles.chipTextSelected]}
                        >
                          {UNIT_LABELS[u]}
                        </Chip>
                      );
                    })}
                  </View>
                </Field>
              </View>
            </View>

            <Field
              label="Tối đa mỗi lượt đặt *"
              helper="Giới hạn 1-10 để nhiều người cùng nhận được."
              error={errors.maxPerReservation?.message}
            >
              <Controller control={control} name="maxPerReservation" render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Số phần tối đa"
                  keyboardType="numeric"
                  value={value ? String(value) : ''}
                  onChangeText={onChange}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  style={styles.input}
                  dense
                  error={!!errors.maxPerReservation}
                  disabled={editingIsPublished}
                />
              )} />
            </Field>

            <Field label="Khối lượng mỗi phần (tuỳ chọn)" helper="Dùng kg, ví dụ 0.35 nếu biết rõ.">
              <Controller control={control} name="weightPerUnitKg" render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Kg mỗi phần"
                  keyboardType="numeric"
                  placeholder="VD: 0.35"
                  value={value ? String(value) : ''}
                  onChangeText={onChange}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  style={styles.input}
                  dense
                  disabled={editingIsPublished}
                />
              )} />
            </Field>
          </Section>

          <Section
            icon="clock-outline"
            title="Thời gian nhận"
            helper="Chọn khung giờ đủ rộng để người nhận hoặc shipper tới lấy."
          >
            <Field label="Giờ bắt đầu lấy *">
              <DateButton
                label="Bắt đầu"
                value={pickupStart}
                onPress={() => openDateTimePicker(pickupStart, (d) => setValue('pickupStartTime', d, { shouldValidate: true }))}
                disabled={editingIsPublished}
              />
            </Field>
            <Field label="Giờ kết thúc lấy *" error={errors.pickupEndTime?.message}>
              <DateButton
                label="Kết thúc"
                value={pickupEnd}
                onPress={() => openDateTimePicker(pickupEnd, (d) => setValue('pickupEndTime', d, { shouldValidate: true }))}
                disabled={editingIsPublished}
              />
            </Field>
            <Field label="Hạn sử dụng *" error={errors.expiryTime?.message}>
              <DateButton
                label="Hạn dùng"
                value={expiry}
                onPress={() => openDateTimePicker(expiry, (d) => setValue('expiryTime', d, { shouldValidate: true }))}
                disabled={editingIsPublished}
              />
            </Field>
          </Section>

          <Section
            icon="map-marker-radius-outline"
            title="Địa chỉ lấy hàng"
            helper="Chọn gợi ý địa chỉ để hệ thống lưu đúng toạ độ."
          >
            <Field label="Địa chỉ lấy hàng *">
              <AddressPicker
                initialCoords={coords}
                value={
                  pickupAddress && coords
                    ? { address: pickupAddress, lat: coords.lat, lng: coords.lng }
                    : null
                }
                onChange={({ address, lat, lng }) => {
                  if (editingIsPublished) return;
                  setValue('pickupAddress', address, { shouldValidate: true });
                  setCoords({ lat, lng });
                }}
                error={errors.pickupAddress?.message}
              />
            </Field>
          </Section>

          <Section icon="shield-check-outline" title="Ghi chú an toàn">
            <Field label="Mô tả (tuỳ chọn)" helper="Ghi tình trạng món, cách đóng gói hoặc thời điểm nấu.">
              <Controller control={control} name="description" render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Mô tả ngắn"
                  multiline
                  numberOfLines={3}
                  value={value}
                  onChangeText={onChange}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  style={[styles.input, styles.multilineInput]}
                />
              )} />
            </Field>
            <Field label="Điều kiện bảo quản (tuỳ chọn)" helper="VD: giữ lạnh, dùng trong ngày, tránh nắng.">
              <Controller control={control} name="storageConditions" render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Điều kiện bảo quản"
                  value={value}
                  onChangeText={onChange}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  style={styles.input}
                  dense
                />
              )} />
            </Field>
            <Field label="Lưu ý dị ứng (tuỳ chọn)" helper="VD: có đậu phộng, sữa, hải sản hoặc trứng.">
              <Controller control={control} name="allergenNotes" render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Thông tin dị ứng"
                  value={value}
                  onChangeText={onChange}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  style={styles.input}
                  dense
                />
              )} />
            </Field>
          </Section>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            loading={submitting}
            disabled={submitting || uploading}
            buttonColor={COLORS.primary}
            style={styles.submitBtn}
            contentStyle={styles.submitContent}
            labelStyle={styles.submitLabel}
            accessibilityLabel="Tạo tin thực phẩm"
            accessibilityState={{ disabled: submitting || uploading, busy: submitting }}
          >
            {isEdit ? 'Lưu thay đổi' : 'Tạo tin'}
          </Button>
          <Text style={styles.footerHint} numberOfLines={2}>
            {isEdit ? 'Lưu xong sẽ quay lại danh sách tin.' : 'Tin sẽ được lưu ở trạng thái nháp để bạn kiểm tra trước khi đăng.'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({
  icon,
  title,
  helper,
  children,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}>
          <MaterialCommunityIcons name={icon} size={18} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {helper ? <Text style={styles.sectionHelper}>{helper}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function Field({
  label,
  helper,
  error,
  children,
}: {
  label: string;
  helper?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {helper && !error ? <Text style={styles.helperText}>{helper}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function DateButton({
  label,
  value,
  onPress,
  disabled,
}: {
  label: string;
  value: Date;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.dateBtn, disabled && styles.controlDisabled]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Chọn ${label.toLowerCase()}: ${fmtDateTime(value)}`}
      accessibilityState={{ disabled }}
    >
      <View style={styles.dateIcon}>
        <MaterialCommunityIcons name="calendar-clock" size={19} color={COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.dateLabel}>{label}</Text>
        <Text style={styles.dateText}>{fmtDateTime(value)}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.onSurfaceVariant} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  formArea: { flex: 1 },
  header: {
    minHeight: 64, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: COLORS.outline,
  },
  backBtn: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { fontWeight: '800', color: COLORS.onSurface },
  headerSub: { marginTop: 2, fontSize: 12, color: COLORS.onSurfaceVariant },
  content: { padding: spacing.lg, gap: spacing.md },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.onSurface },
  sectionHelper: { marginTop: 2, fontSize: 13, lineHeight: 18, color: COLORS.onSurfaceVariant },
  lockNotice: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  lockNoticeText: { flex: 1, fontSize: 13, lineHeight: 18, color: '#075985', fontWeight: '600' },
  field: { gap: 7 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  helperText: { fontSize: 12, lineHeight: 17, color: COLORS.onSurfaceVariant },
  input: { minHeight: 48, backgroundColor: COLORS.surface },
  multilineInput: { minHeight: 96, textAlignVertical: 'top' },
  errorText: { fontSize: 12, lineHeight: 17, color: COLORS.error, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, marginBottom: 2, borderRadius: radius.pill, backgroundColor: COLORS.surfaceContainerLow },
  chipSelected: { backgroundColor: COLORS.primaryContainer },
  chipText: { color: COLORS.onSurface, fontWeight: '600' },
  chipTextSelected: { color: COLORS.primary, fontWeight: '800' },
  rowFields: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rowFieldsStacked: { flexDirection: 'column', gap: 0 },
  rowField: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { width: 82, height: 82 },
  thumb: { width: 82, height: 82, borderRadius: radius.md, backgroundColor: COLORS.outline },
  removeImageBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(18,28,42,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImage: {
    width: 118,
    height: 82,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  controlDisabled: { opacity: 0.6 },
  addImageText: { fontSize: 12, color: COLORS.primary, fontWeight: '800' },
  dateBtn: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  dateIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: { fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceVariant },
  dateText: { marginTop: 1, fontSize: 15, color: COLORS.onSurface, fontWeight: '700' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  submitBtn: { borderRadius: radius.md },
  submitContent: { minHeight: 50 },
  submitLabel: { fontSize: 16, fontWeight: '800' },
  footerHint: { marginTop: 7, fontSize: 12, lineHeight: 16, color: COLORS.onSurfaceVariant, textAlign: 'center' },
});
