import { useEffect, useRef, useState, useCallback } from 'react';
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
import { Text, TextInput, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller, type FieldErrors } from 'react-hook-form';
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
  captureAndUploadListingImage,
  pickAndUploadListingImages,
  ImagePickCancelledError,
} from '@/services/listingImageUpload';
import { CATEGORY_LABELS, UNIT_LABELS } from '@/utils/listingFormat';
import { buildValidationMessage } from '@/utils/listingValidation';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Popup } from '@/components/ui/AppPopup';
import { AppImage } from '@/components/ui/AppImage';
import { AddressPicker } from '@/components/AddressPicker';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);
const UNIT_KEYS = Object.keys(UNIT_LABELS);
const DISCRETE_UNITS = ['portion', 'item', 'box'];
const CREATE_STEPS = [
  { key: 1, label: 'Th\u00f4ng tin', icon: 'food-apple-outline' },
  { key: 2, label: 'S\u1ed1 l\u01b0\u1ee3ng & gi\u1edd', icon: 'clock-outline' },
  { key: 3, label: '\u1ea2nh & \u0111\u1ecba \u0111i\u1ec3m', icon: 'map-marker-radius-outline' },
] as const;

function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtMinute(minute?: number): string {
  if (minute == null || !Number.isFinite(minute)) return '--:--';
  const normalized = Math.max(0, Math.min(1439, Math.trunc(minute)));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(normalized / 60))}:${p(normalized % 60)}`;
}

function dateFromMinute(minute?: number): Date {
  const d = new Date();
  const normalized = minute ?? 7 * 60;
  d.setHours(Math.floor(normalized / 60), normalized % 60, 0, 0);
  return d;
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

function openTimePicker(currentMinute: number | undefined, onPick: (minute: number) => void) {
  DateTimePickerAndroid.open({
    value: dateFromMinute(currentMinute),
    mode: 'time',
    is24Hour: true,
    onChange: (_e, d) => {
      if (!d) return;
      onPick(d.getHours() * 60 + d.getMinutes());
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
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const isEdit = !!editId;
  const editingIsPublished = !!editingListing && editingListing.status !== 'draft';

  const categorySheetRef = useRef<BottomSheetModal>(null);
  const [pendingCategories, setPendingCategories] = useState<string[]>([]);
  const unitSheetRef = useRef<BottomSheetModal>(null);
  const renderCategoryBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    []
  );
  const titleText = isEdit
    ? editingIsPublished
      ? 'Sửa thông tin phụ'
      : 'Sửa tin nháp'
    : 'Đăng tin mới';

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    trigger,
    formState: { errors },
  } = useForm<CreateListingFormInput>({
    resolver: zodResolver(createListingSchema),
    defaultValues: {
      title: '',
      categories: [] as string[],
      categoryOtherLabel: '',
      quantityTotal: undefined as unknown as number,
      quantityUnit: 'portion',
      maxPerReservation: 1,
      pickupStartTime: undefined,
      pickupEndTime: undefined,
      expiryTime: undefined,
      pickupAddress: '',
      description: '',
      weightPerUnitKg: undefined,
      storageConditions: '',
      allergenNotes: '',
      dailyStartMinute: 7 * 60,
      dailyEndMinute: 21 * 60,
    },
  });

  useEffect(() => {
    getCurrentCoords().then(({ coords }) => setCoords(coords));
  }, []);

  useEffect(() => {
    if (!editingListing) return;
    reset({
      title: editingListing.title ?? '',
      categories: editingListing.category ? [editingListing.category] : [],
      categoryOtherLabel: '',
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
      dailyStartMinute: editingListing.dailyStartMinute ?? 7 * 60,
      dailyEndMinute: editingListing.dailyEndMinute ?? 21 * 60,
    });
    setCoords({ lat: editingListing.lat, lng: editingListing.lng });
    setImageUrls(editingListing.imageUrls ?? []);
  }, [editingListing, reset]);

  if (user && user.role !== 'provider') {
    return <Redirect href="/(app)/home" />;
  }

  const categories = watch('categories');
  const categoryOtherLabel = watch('categoryOtherLabel');
  const quantityUnit = watch('quantityUnit');
  const pickupAddress = watch('pickupAddress');
  const pickupStart = watch('pickupStartTime');
  const pickupEnd = watch('pickupEndTime');
  const expiry = watch('expiryTime');
  const dailyStartMinute = watch('dailyStartMinute');
  const dailyEndMinute = watch('dailyEndMinute');

  const openCategorySheet = () => {
    setPendingCategories(categories ?? []);
    categorySheetRef.current?.present();
  };
  const confirmCategories = () => {
    setValue('categories', pendingCategories, { shouldValidate: true });
    categorySheetRef.current?.dismiss();
  };
  const selectUnit = (u: string) => {
    setValue('quantityUnit', u, { shouldValidate: true });
    unitSheetRef.current?.dismiss();
  };

  const handlePickImages = async () => {
    try {
      setUploading(true);
      const urls = await pickAndUploadListingImages(5 - imageUrls.length);
      setImageUrls((prev) => [...prev, ...urls].slice(0, 5));
      Popup.show({ type: 'success', text1: `Đã tải ${urls.length} ảnh` });
    } catch (err) {
      if (err instanceof ImagePickCancelledError) return;
      Popup.show({ type: 'error', text1: 'Tải ảnh thất bại', text2: getErrorMessage(err) });
    } finally {
      setUploading(false);
    }
  };

  const handleCaptureImage = async () => {
    try {
      setUploading(true);
      const url = await captureAndUploadListingImage();
      setImageUrls((prev) => [...prev, url].slice(0, 5));
      Popup.show({ type: 'success', text1: 'Đã chụp và tải ảnh' });
    } catch (err) {
      if (err instanceof ImagePickCancelledError) return;
      Popup.show({
        type: 'error',
        text1: 'Không chụp được ảnh',
        text2: getErrorMessage(err),
      });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (url: string) => {
    setImageUrls((prev) => prev.filter((item) => item !== url));
  };

  const goNext = async () => {
    if (activeStep === 1) {
      const ok = await trigger(['title', 'categories', 'categoryOtherLabel', 'description']);
      if (!ok) {
        Popup.show({ type: 'warning', text1: 'C\u1ea7n ho\u00e0n t\u1ea5t th\u00f4ng tin m\u00f3n \u0103n' });
        return;
      }
    }
    if (activeStep === 2) {
      const ok = await trigger([
        'quantityTotal',
        'quantityUnit',
        'maxPerReservation',
        'weightPerUnitKg',
        'pickupStartTime',
        'pickupEndTime',
        'expiryTime',
        'dailyStartMinute',
        'dailyEndMinute',
        'storageConditions',
        'allergenNotes',
      ]);
      if (!ok || !pickupStart || !pickupEnd || !expiry) {
        Popup.show({
          type: 'warning',
          text1: 'C\u1ea7n ho\u00e0n t\u1ea5t s\u1ed1 l\u01b0\u1ee3ng v\u00e0 th\u1eddi gian',
          text2: 'Ch\u1ecdn \u0111\u1ee7 b\u1eaft \u0111\u1ea7u l\u1ea5y, h\u1ea1n l\u1ea5y, h\u1ea1n s\u1eed d\u1ee5ng v\u00e0 khung gi\u1edd m\u1edf c\u1eeda trong ng\u00e0y.',
        });
        return;
      }
    }
    setActiveStep((prev) => (prev === 1 ? 2 : 3));
  };

  const onInvalid = (errs: FieldErrors<CreateListingFormInput>) => {
    Popup.show({
      type: 'error',
      text1: 'Vui lòng kiểm tra lại thông tin',
      text2: buildValidationMessage(errs) || 'Có trường chưa hợp lệ, hãy xem chi tiết bên dưới.',
      duration: 0,
    });
  };

  const onSubmit = async (form: CreateListingFormInput) => {
    if (!coords) {
      Popup.show({ type: 'warning', text1: 'Chưa lấy được vị trí', text2: 'Vui lòng thử lại sau giây lát.' });
      return;
    }
    // Ảnh là bắt buộc khi TẠO tin (BE chặn bằng @ArrayNotEmpty). Sửa tin đã đăng thì
    // không cần vì ảnh cũ vẫn còn.
    if (!editingIsPublished && imageUrls.length === 0) {
      Popup.show({
        type: 'warning',
        text1: 'Cần ít nhất 1 ảnh thực phẩm',
        text2: 'Người nhận cần nhìn thấy món trước khi đặt.',
      });
      return;
    }
    if (!editingIsPublished && (!form.pickupStartTime || !form.pickupEndTime || !form.expiryTime)) {
      Popup.show({
        type: 'warning',
        text1: 'Chưa chọn đủ thời gian',
        text2: 'Vui lòng chọn giờ bắt đầu, giờ kết thúc và hạn sử dụng.',
      });
      return;
    }
    const fullPayload: CreateListingInput = {
      title: form.title,
      category: form.categories[0],
      quantityTotal: form.quantityTotal,
      quantityUnit: form.quantityUnit,
      maxPerReservation: form.maxPerReservation,
      pickupStartTime: form.pickupStartTime!.toISOString(),
      pickupEndTime: form.pickupEndTime!.toISOString(),
      expiryTime: form.expiryTime!.toISOString(),
      pickupAddress: form.pickupAddress,
      lat: coords.lat,
      lng: coords.lng,
      ...(form.description ? { description: form.description } : {}),
      ...(form.weightPerUnitKg ? { weightPerUnitKg: form.weightPerUnitKg } : {}),
      ...(form.storageConditions ? { storageConditions: form.storageConditions } : {}),
      ...(form.allergenNotes ? { allergenNotes: form.allergenNotes } : {}),
      ...(imageUrls.length ? { imageUrls } : {}),
      dailyStartMinute: form.dailyStartMinute,
      dailyEndMinute: form.dailyEndMinute,
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
        const created = await createListing.mutateAsync(fullPayload);
        Popup.show({
          type: 'success',
          text1: '\u0110\u00e3 t\u1ea1o tin nh\u00e1p',
          text2: 'B\u1ea5m \"\u0110\u0103ng tin\" \u1edf m\u00e0n chi ti\u1ebft \u0111\u1ec3 hi\u1ec3n th\u1ecb tr\u00ean web.',
        });
        router.replace(`/(app)/provider/${created.id}`);
        return;
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
          {!editingIsPublished ? (
            <StepProgress activeStep={activeStep} />
          ) : null}

          {(editingIsPublished || activeStep === 3) ? (
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
                <>
                  <Pressable
                    style={[styles.addImage, uploading && styles.controlDisabled]}
                    onPress={handleCaptureImage}
                    disabled={uploading}
                    accessibilityRole="button"
                    accessibilityLabel={uploading ? 'Đang tải ảnh món ăn' : 'Chụp ảnh món ăn'}
                    accessibilityState={{ disabled: uploading, busy: uploading }}
                  >
                    <MaterialCommunityIcons
                      name={uploading ? 'progress-upload' : 'camera-outline'}
                      size={26}
                      color={COLORS.primary}
                    />
                    <Text style={styles.addImageText}>{uploading ? 'Đang tải' : 'Chụp ảnh'}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.addImage, uploading && styles.controlDisabled]}
                    onPress={handlePickImages}
                    disabled={uploading}
                    accessibilityRole="button"
                    accessibilityLabel={uploading ? 'Đang tải ảnh món ăn' : 'Chọn ảnh món ăn từ thư viện'}
                    accessibilityState={{ disabled: uploading, busy: uploading }}
                  >
                    <MaterialCommunityIcons name="image-multiple-outline" size={26} color={COLORS.primary} />
                    <Text style={styles.addImageText}>Thư viện</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </Section>
          ) : null}

          {editingIsPublished ? (
            <View style={styles.lockNotice}>
              <MaterialCommunityIcons name="lock-outline" size={18} color="#0369a1" />
              <Text style={styles.lockNoticeText}>
                Tin đã đăng chỉ sửa mô tả, ảnh, bảo quản, dị ứng. Muốn đổi giờ, địa điểm hoặc số lượng hãy huỷ rồi tạo lại.
              </Text>
            </View>
          ) : null}

          {!editingIsPublished && activeStep === 1 ? (
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
                  />
                )} />
              </Field>

              <Field
                label="Loại thực phẩm *"
                error={errors.categories?.message ?? (errors as Record<string, { message?: string }>)['categories']?.message}
              >
                <Pressable
                  onPress={openCategorySheet}
                  style={[styles.categoryBtn, !!(errors.categories) && styles.categoryBtnError]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    categories && categories.length > 0
                      ? `Loại thực phẩm đã chọn: ${categories.map((k) => CATEGORY_LABELS[k]).join(', ')}`
                      : 'Chọn loại thực phẩm'
                  }
                >
                  <View style={styles.categoryBtnIcon}>
                    <MaterialCommunityIcons name="food-apple-outline" size={18} color={COLORS.primary} />
                  </View>
                  <Text
                    style={[
                      styles.categoryBtnText,
                      (!categories || categories.length === 0) && styles.categoryBtnPlaceholder,
                    ]}
                    numberOfLines={1}
                  >
                    {categories && categories.length > 0
                      ? categories.map((k) => CATEGORY_LABELS[k]).join(', ')
                      : 'Loại thực phẩm'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.onSurfaceVariant} />
                </Pressable>
              </Field>

              {categories?.includes('other') ? (
                <Field
                  label="Mô tả loại thực phẩm *"
                  helper="Nhập tên loại thực phẩm cụ thể, ví dụ: bánh cuốn, chè đậu."
                  error={errors.categoryOtherLabel?.message}
                >
                  <Controller
                    control={control}
                    name="categoryOtherLabel"
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        mode="outlined"
                        label="Loại thực phẩm khác"
                        placeholder="VD: bánh cuốn, chè đậu xanh"
                        value={value ?? ''}
                        onChangeText={onChange}
                        outlineColor={COLORS.outline}
                        activeOutlineColor={COLORS.primary}
                        style={styles.input}
                        dense
                        error={!!errors.categoryOtherLabel}
                        maxLength={100}
                      />
                    )}
                  />
                </Field>
              ) : null}
            </Section>
          ) : null}

          {!editingIsPublished && activeStep === 2 ? (
            <Section icon="scale-balance" title="Số lượng">
              <Field
                label="Số lượng *"
                helper={
                  DISCRETE_UNITS.includes(quantityUnit)
                    ? 'Số nguyên (phần/cái/hộp không tính lẻ).'
                    : 'Cho phép số thập phân, ví dụ 2.5 kg.'
                }
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
                  />
                )} />
              </Field>

              <Field label="Đơn vị *">
                <Pressable
                  onPress={() => unitSheetRef.current?.present()}
                  style={styles.categoryBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Đơn vị: ${UNIT_LABELS[quantityUnit] ?? 'Chọn đơn vị'}`}
                >
                  <View style={styles.categoryBtnIcon}>
                    <MaterialCommunityIcons name="scale-balance" size={18} color={COLORS.primary} />
                  </View>
                  <Text style={styles.categoryBtnText}>{UNIT_LABELS[quantityUnit] ?? 'Chọn đơn vị'}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.onSurfaceVariant} />
                </Pressable>
              </Field>

              <Field
                label="Tối đa mỗi lượt đặt *"
                helper="1–10, không vượt quá tổng số lượng."
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
                  />
                )} />
              </Field>
            </Section>
          ) : null}

          {!editingIsPublished && activeStep === 2 ? (
            <Section
              icon="clock-outline"
              title="Thời gian nhận"
              helper="Giờ bắt đầu phải cách hiện tại ít nhất 30 phút. Chọn khung giờ đủ rộng để người nhận hoặc shipper tới lấy."
            >
              <Field label="Giờ bắt đầu lấy *" error={errors.pickupStartTime?.message}>
                <DateButton
                  label="Bắt đầu"
                  value={pickupStart}
                  onPress={() => openDateTimePicker(pickupStart ?? new Date(), (d) => {
                    setValue('pickupStartTime', d, { shouldValidate: true });
                    if (pickupEnd) trigger('pickupEndTime');
                  })}
                  hasError={!!errors.pickupStartTime}
                />
                <Pressable
                  onPress={() => {
                    setValue('pickupStartTime', new Date(), { shouldValidate: true });
                    if (pickupEnd) trigger('pickupEndTime');
                  }}
                  style={styles.nowBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Dùng thời điểm hiện tại"
                >
                  <MaterialCommunityIcons name="clock-fast" size={13} color={COLORS.primary} />
                  <Text style={styles.nowBtnText}>Hiện tại</Text>
                </Pressable>
              </Field>
              <Field label="Giờ kết thúc lấy *" error={errors.pickupEndTime?.message}>
                <DateButton
                  label="Kết thúc"
                  value={pickupEnd}
                  onPress={() => openDateTimePicker(pickupEnd ?? new Date(), (d) => {
                    setValue('pickupEndTime', d, { shouldValidate: true });
                    if (expiry) trigger('expiryTime');
                  })}
                  hasError={!!errors.pickupEndTime}
                />
                <Pressable
                  onPress={() => {
                    setValue('pickupEndTime', new Date(), { shouldValidate: true });
                    if (expiry) trigger('expiryTime');
                  }}
                  style={styles.nowBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Dùng thời điểm hiện tại"
                >
                  <MaterialCommunityIcons name="clock-fast" size={13} color={COLORS.primary} />
                  <Text style={styles.nowBtnText}>Hiện tại</Text>
                </Pressable>
              </Field>
              <Field label="Hạn sử dụng *" error={errors.expiryTime?.message}>
                <DateButton
                  label="Hạn dùng"
                  value={expiry}
                  onPress={() => openDateTimePicker(expiry ?? new Date(), (d) => setValue('expiryTime', d, { shouldValidate: true }))}
                  hasError={!!errors.expiryTime}
                />
                <Pressable
                  onPress={() => setValue('expiryTime', new Date(), { shouldValidate: true })}
                  style={styles.nowBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Dùng thời điểm hiện tại"
                >
                  <MaterialCommunityIcons name="clock-fast" size={13} color={COLORS.primary} />
                  <Text style={styles.nowBtnText}>Hiện tại</Text>
                </Pressable>
              </Field>

              <View style={styles.inlinePanel}>
                <View style={styles.inlinePanelHead}>
                  <MaterialCommunityIcons name="store-clock-outline" size={18} color={COLORS.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inlinePanelTitle}>Gi\u1edd m\u1edf c\u1eeda nh\u1eadn h\u00e0ng trong ng\u00e0y</Text>
                    <Text style={styles.inlinePanelHelper}>Ng\u01b0\u1eddi nh\u1eadn ch\u1ec9 \u0111\u1eb7t/l\u1ea5y trong khung n\u00e0y m\u1ed7i ng\u00e0y, t\u01b0\u01a1ng t\u1ef1 web c\u1eeda h\u00e0ng.</Text>
                  </View>
                </View>
                <View style={[styles.rowFields, compactLayout && styles.rowFieldsStacked]}>
                  <View style={styles.rowField}>
                    <Field label="M\u1edf nh\u1eadn t\u1eeb *" error={errors.dailyStartMinute?.message}>
                      <TimeButton
                        label="M\u1edf nh\u1eadn"
                        value={dailyStartMinute}
                        onPress={() => openTimePicker(dailyStartMinute, (minute) => {
                          setValue('dailyStartMinute', minute, { shouldValidate: true });
                          trigger('dailyEndMinute');
                        })}
                        hasError={!!errors.dailyStartMinute}
                      />
                    </Field>
                  </View>
                  <View style={styles.rowField}>
                    <Field label="\u0110\u00f3ng nh\u1eadn l\u00fac *" error={errors.dailyEndMinute?.message}>
                      <TimeButton
                        label="\u0110\u00f3ng nh\u1eadn"
                        value={dailyEndMinute}
                        onPress={() => openTimePicker(dailyEndMinute, (minute) => {
                          setValue('dailyEndMinute', minute, { shouldValidate: true });
                          trigger('dailyEndMinute');
                        })}
                        hasError={!!errors.dailyEndMinute}
                      />
                    </Field>
                  </View>
                </View>
              </View>
            </Section>
          ) : null}

          {!editingIsPublished && activeStep === 3 ? (
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
                    setValue('pickupAddress', address, { shouldValidate: true });
                    setCoords({ lat, lng });
                  }}
                  error={errors.pickupAddress?.message}
                />
              </Field>
            </Section>
          ) : null}

          {(editingIsPublished || activeStep === 2) ? (
          <Section icon="shield-check-outline" title="Ghi ch\u00fa an to\u00e0n">
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
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {!editingIsPublished && activeStep > 1 ? (
            <Button
              mode="outlined"
              onPress={() => setActiveStep((prev) => (prev === 3 ? 2 : 1))}
              disabled={submitting || uploading}
              textColor={COLORS.onSurface}
              style={styles.backStepBtn}
              contentStyle={styles.submitContent}
              labelStyle={styles.submitLabel}
              icon="arrow-left"
            >
              Quay l\u1ea1i
            </Button>
          ) : null}
          <Button
            mode="contained"
            onPress={!editingIsPublished && activeStep < 3 ? goNext : handleSubmit(onSubmit, onInvalid)}
            loading={submitting}
            disabled={submitting || uploading}
            buttonColor={COLORS.primary}
            style={styles.submitBtn}
            contentStyle={styles.submitContent}
            labelStyle={styles.submitLabel}
            accessibilityLabel="Tạo tin thực phẩm"
            accessibilityState={{ disabled: submitting || uploading, busy: submitting }}
            icon={!editingIsPublished && activeStep < 3 ? 'arrow-right' : undefined}
          >
            {!editingIsPublished && activeStep < 3 ? 'Ti\u1ebfp t\u1ee5c' : isEdit ? 'L\u01b0u thay \u0111\u1ed5i' : 'T\u1ea1o tin (Nh\u00e1p)'}
          </Button>
          <Text style={styles.footerHint} numberOfLines={2}>
            {isEdit ? 'Lưu xong sẽ quay lại danh sách tin.' : 'Tin sẽ được lưu ở trạng thái nháp để bạn kiểm tra trước khi đăng.'}
          </Text>
        </View>
      </KeyboardAvoidingView>

      <BottomSheetModal
        ref={categorySheetRef}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderCategoryBackdrop}
        handleIndicatorStyle={{ backgroundColor: COLORS.outline }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.categorySheet}>
          <Text style={styles.categorySheetTitle}>Chọn loại thực phẩm</Text>
          <Text style={styles.categorySheetSub}>Chọn một hoặc nhiều loại phù hợp.</Text>
          {CATEGORY_KEYS.map((k) => {
            const selected = pendingCategories.includes(k);
            return (
              <Pressable
                key={k}
                onPress={() =>
                  setPendingCategories((prev) =>
                    prev.includes(k) ? prev.filter((c) => c !== k) : [...prev, k]
                  )
                }
                style={styles.categoryItem}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={CATEGORY_LABELS[k]}
              >
                <MaterialCommunityIcons
                  name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={22}
                  color={selected ? COLORS.primary : COLORS.onSurfaceVariant}
                />
                <Text style={[styles.categoryItemText, selected && styles.categoryItemSelected]}>
                  {CATEGORY_LABELS[k]}
                </Text>
              </Pressable>
            );
          })}
          <Button
            mode="contained"
            onPress={confirmCategories}
            buttonColor={COLORS.primary}
            style={styles.categoryConfirmBtn}
            contentStyle={{ minHeight: 48 }}
            labelStyle={{ fontSize: 15, fontWeight: '800' }}
            disabled={pendingCategories.length === 0}
          >
            Xác nhận
          </Button>
        </BottomSheetScrollView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={unitSheetRef}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderCategoryBackdrop}
        handleIndicatorStyle={{ backgroundColor: COLORS.outline }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.categorySheet}>
          <Text style={styles.categorySheetTitle}>Chọn đơn vị</Text>
          {UNIT_KEYS.map((u) => {
            const selected = quantityUnit === u;
            return (
              <Pressable
                key={u}
                onPress={() => selectUnit(u)}
                style={styles.categoryItem}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={UNIT_LABELS[u]}
              >
                <MaterialCommunityIcons
                  name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                  size={22}
                  color={selected ? COLORS.primary : COLORS.onSurfaceVariant}
                />
                <Text style={[styles.categoryItemText, selected && styles.categoryItemSelected]}>
                  {UNIT_LABELS[u]}
                </Text>
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

function StepProgress({ activeStep }: { activeStep: 1 | 2 | 3 }) {
  return (
    <View style={styles.stepper}>
      {CREATE_STEPS.map((step, index) => {
        const done = step.key < activeStep;
        const active = step.key === activeStep;
        return (
          <View key={step.key} style={styles.stepperItem}>
            <View style={[styles.stepCircle, active && styles.stepCircleActive, done && styles.stepCircleDone]}>
              <MaterialCommunityIcons
                name={done ? 'check' : step.icon}
                size={17}
                color={active || done ? '#ffffff' : COLORS.onSurfaceVariant}
              />
            </View>
            <Text style={[styles.stepLabel, active && styles.stepLabelActive]} numberOfLines={1}>
              {step.label}
            </Text>
            {index < CREATE_STEPS.length - 1 ? <View style={styles.stepLine} /> : null}
          </View>
        );
      })}
    </View>
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
  hasError,
}: {
  label: string;
  value: Date | undefined;
  onPress: () => void;
  disabled?: boolean;
  hasError?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.dateBtn, disabled && styles.controlDisabled, hasError && styles.dateBtnError]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={value ? `Chọn ${label.toLowerCase()}: ${fmtDateTime(value)}` : `Chọn ${label.toLowerCase()}`}
      accessibilityState={{ disabled }}
    >
      <View style={styles.dateIcon}>
        <MaterialCommunityIcons
          name="calendar-clock"
          size={19}
          color={value ? COLORS.primary : COLORS.onSurfaceVariant}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.dateLabel}>{label}</Text>
        <Text style={[styles.dateText, !value && styles.datePlaceholder]}>
          {value ? fmtDateTime(value) : 'Chọn thời gian'}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.onSurfaceVariant} />
    </Pressable>
  );
}

function TimeButton({
  label,
  value,
  onPress,
  hasError,
}: {
  label: string;
  value: number | undefined;
  onPress: () => void;
  hasError?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.dateBtn, hasError && styles.dateBtnError]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${fmtMinute(value)}`}
    >
      <View style={styles.dateIcon}>
        <MaterialCommunityIcons name="clock-outline" size={19} color={COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.dateLabel}>{label}</Text>
        <Text style={styles.dateText}>{fmtMinute(value)}</Text>
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
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: spacing.md,
    gap: 6,
  },
  stepperItem: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  stepCircleActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepCircleDone: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepLabel: { flex: 1, minWidth: 0, fontSize: 12, color: COLORS.onSurfaceVariant, fontWeight: '700' },
  stepLabelActive: { color: COLORS.primary, fontWeight: '900' },
  stepLine: { width: 16, height: 1, backgroundColor: COLORS.outline },
  inlinePanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceContainerLow,
    padding: spacing.md,
    gap: spacing.md,
  },
  inlinePanelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  inlinePanelTitle: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface },
  inlinePanelHelper: { marginTop: 2, fontSize: 12, lineHeight: 17, color: COLORS.onSurfaceVariant },
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
    width: 104,
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
  dateBtnError: { borderColor: COLORS.error },
  dateLabel: { fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceVariant },
  dateText: { marginTop: 1, fontSize: 15, color: COLORS.onSurface, fontWeight: '700' },
  datePlaceholder: { color: COLORS.onSurfaceVariant, fontWeight: '400' },
  nowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 3,
  },
  nowBtnText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  submitBtn: { borderRadius: radius.md },
  backStepBtn: { borderRadius: radius.md, marginBottom: 8, borderColor: COLORS.outline },
  submitContent: { minHeight: 50 },
  submitLabel: { fontSize: 16, fontWeight: '800' },
  footerHint: { marginTop: 7, fontSize: 12, lineHeight: 16, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  categoryBtn: {
    minHeight: 52,
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
  categoryBtnError: { borderColor: COLORS.error },
  categoryBtnIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBtnText: { flex: 1, fontSize: 15, color: COLORS.onSurface, fontWeight: '600' },
  categoryBtnPlaceholder: { color: COLORS.onSurfaceVariant, fontWeight: '400' },
  categorySheet: { paddingHorizontal: 20, paddingBottom: 32 },
  categorySheetTitle: { fontSize: 18, fontWeight: '800', color: COLORS.onSurface, marginBottom: 4 },
  categorySheetSub: { fontSize: 13, color: COLORS.onSurfaceVariant, marginBottom: 12 },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
  },
  categoryItemText: { fontSize: 15, color: COLORS.onSurface, flex: 1 },
  categoryItemSelected: { color: COLORS.primary, fontWeight: '700' },
  categoryConfirmBtn: { marginTop: 20, borderRadius: radius.md },
});
