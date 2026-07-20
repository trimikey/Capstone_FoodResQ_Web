import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Text, TextInput, Button, Avatar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Popup } from '@/components/ui/AppPopup';
import {
  updateProfileSchema,
  UpdateProfileFormInput,
} from '@/utils/validators';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfile';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import {
  pickAndUploadAvatar,
  ImagePickCancelledError,
} from '@/services/avatarUpload';
import { AppImage } from '@/components/ui/AppImage';
import { AddressPicker, type AddressValue } from '@/components/AddressPicker';
import type { UpdateProfileInput } from '@/api/client';
import { mobileColors as COLORS } from '@/theme/design';

/**
 * Chỉnh sửa hồ sơ — PATCH /users/me ({ fullName?, phone?, avatarUrl? }).
 * Prefill từ GET /users/me; chỉ gửi field thực sự thay đổi để tránh ghi đè
 * không cần thiết. Thành công → đồng bộ store (useUpdateProfile) + quay lại.
 */
export default function EditProfileScreen() {
  const { data: profile } = useMyProfile();
  const updateProfile = useUpdateProfile();
  const [submitting, setSubmitting] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [addressValue, setAddressValue] = useState<AddressValue | null>(null);

  const canEditAddress = profile?.role === 'provider' || profile?.role === 'receiver';
  const currentAddress = profile?.provider?.address ?? profile?.receiver?.address ?? '';
  const currentLat = profile?.provider?.lat ?? profile?.receiver?.lat ?? null;
  const currentLng = profile?.provider?.lng ?? profile?.receiver?.lng ?? null;

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpdateProfileFormInput>({
    resolver: zodResolver(updateProfileSchema),
    values: {
      fullName: profile?.fullName ?? '',
      phone: profile?.phone ?? '',
      avatarUrl: profile?.avatarUrl ?? '',
      address: currentAddress,
    },
  });

  const avatarUrl = watch('avatarUrl');
  const fullName = watch('fullName');

  const effectiveAddress: AddressValue | null =
    addressValue ??
    (currentAddress && currentLat != null && currentLng != null
      ? { address: currentAddress, lat: currentLat, lng: currentLng }
      : currentAddress
        ? { address: currentAddress, lat: 10.8231, lng: 106.6297 }
        : null);

  // Chọn ảnh từ thư viện → upload Firebase Storage → gán URL vào form.
  const handleChangeAvatar = async () => {
    try {
      setUploading(true);
      const url = await pickAndUploadAvatar();
      setValue('avatarUrl', url, { shouldValidate: true });
      Popup.show({ type: 'success', text1: 'Đã tải ảnh lên' });
    } catch (err) {
      if (err instanceof ImagePickCancelledError) return; // huỷ, không báo lỗi
      Popup.show({
        type: 'error',
        text1: 'Tải ảnh thất bại',
        text2: getErrorMessage(err),
      });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (form: UpdateProfileFormInput) => {
    // Chỉ gửi field thay đổi so với hồ sơ hiện tại.
    const payload: UpdateProfileInput = {};
    if (form.fullName !== (profile?.fullName ?? '')) {
      payload.fullName = form.fullName;
    }
    if (form.phone !== (profile?.phone ?? '')) {
      payload.phone = form.phone;
    }
    if (form.avatarUrl !== (profile?.avatarUrl ?? '')) {
      payload.avatarUrl = form.avatarUrl;
    }
    if (canEditAddress && addressValue && addressValue.address.trim() !== currentAddress) {
      payload.address = addressValue.address.trim();
      payload.lat = addressValue.lat;
      payload.lng = addressValue.lng;
    } else if (
      canEditAddress &&
      addressValue &&
      (addressValue.lat !== currentLat || addressValue.lng !== currentLng)
    ) {
      payload.address = addressValue.address.trim();
      payload.lat = addressValue.lat;
      payload.lng = addressValue.lng;
    }

    if (Object.keys(payload).length === 0) {
      Popup.show({ type: 'info', text1: 'Không có thay đổi nào' });
      router.back();
      return;
    }

    try {
      setSubmitting(true);
      await updateProfile.mutateAsync(payload);
      Popup.show({
        type: 'success',
        text1: 'Đã cập nhật hồ sơ',
      });
      router.back();
    } catch (err) {
      Popup.show({
        type: 'error',
        text1: 'Cập nhật thất bại',
        text2: getErrorMessage(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={COLORS.onSurface}
          />
        </Pressable>
        <Text variant="titleMedium" style={styles.headerTitle}>
          Chỉnh sửa hồ sơ
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {/* Ảnh đại diện: preview + nút chọn/upload */}
          <View style={styles.avatarBlock}>
            {avatarUrl ? (
              <AppImage source={{ uri: avatarUrl }} style={styles.avatarPreview} />
            ) : (
              <Avatar.Text
                size={96}
                label={(fullName || '?').charAt(0).toUpperCase()}
                style={{ backgroundColor: COLORS.primary }}
              />
            )}
            <Button
              mode="outlined"
              icon="camera"
              onPress={handleChangeAvatar}
              loading={uploading}
              disabled={uploading || submitting}
              textColor={COLORS.primary}
              style={styles.changeAvatarBtn}
            >
              {uploading ? 'Đang tải lên...' : 'Đổi ảnh'}
            </Button>
          </View>

          {/* Họ tên */}
          <Field label="Họ và tên">
            <Controller
              control={control}
              name="fullName"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  placeholder="Nguyễn Văn A"
                  value={value}
                  onChangeText={onChange}
                  editable={!submitting}
                  left={<TextInput.Icon icon="account" />}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  style={styles.input}
                  error={!!errors.fullName}
                />
              )}
            />
            <FieldError message={errors.fullName?.message} />
          </Field>

          {/* Số điện thoại */}
          <Field label="Số điện thoại">
            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  placeholder="0912345678"
                  value={value}
                  onChangeText={onChange}
                  keyboardType="phone-pad"
                  editable={!submitting}
                  left={<TextInput.Icon icon="phone" />}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  style={styles.input}
                  error={!!errors.phone}
                />
              )}
            />
            <FieldError message={errors.phone?.message} />
          </Field>

          {canEditAddress ? (
            <Field label={profile?.role === 'provider' ? 'Địa chỉ cửa hàng' : 'Điểm giao mặc định'}>
              <AddressPicker
                initialCoords={
                  currentLat != null && currentLng != null
                    ? { lat: currentLat, lng: currentLng }
                    : null
                }
                value={effectiveAddress}
                onChange={(next) => {
                  setAddressValue(next);
                  setValue('address', next.address, { shouldValidate: true });
                }}
                error={errors.address?.message}
              />
            </Field>
          ) : null}

          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            loading={submitting}
            disabled={submitting}
            buttonColor={COLORS.primary}
            style={styles.saveBtn}
            labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
          >
            Lưu thay đổi
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { fontWeight: '700', color: COLORS.onSurface },
  content: { padding: 20 },
  avatarBlock: { alignItems: 'center', marginBottom: 20, gap: 12 },
  avatarPreview: { width: 96, height: 96, borderRadius: 48 },
  changeAvatarBtn: { borderColor: COLORS.primary, borderRadius: 12 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    marginBottom: 8,
  },
  input: { backgroundColor: COLORS.surface },
  error: { fontSize: 12, color: COLORS.error, marginTop: 4 },
  saveBtn: { marginTop: 8, borderRadius: 12, paddingVertical: 4 },
});
