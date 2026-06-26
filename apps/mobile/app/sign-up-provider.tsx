import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput, Button, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  signUpProviderSchema,
  type SignUpProviderFormInput,
} from '@/utils/validators';
import { useAuth } from '@/hooks/useAuth';
import { useOnboardingStore } from '@/stores/onboarding';
import { type Coords } from '@/services/geolocation';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { MapPicker } from '@/components/MapPicker';

const COLORS = {
  primary: '#10b981',
  background: '#f8f9ff',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
  error: '#ba1a1a',
};

const BUSINESS_TYPES: { key: SignUpProviderFormInput['businessType']; label: string }[] = [
  { key: 'restaurant', label: 'Nhà hàng / Quán ăn' },
  { key: 'supermarket', label: 'Siêu thị / Cửa hàng' },
  { key: 'bakery', label: 'Tiệm bánh' },
  { key: 'hotel', label: 'Khách sạn' },
  { key: 'other', label: 'Khác' },
];

/**
 * Đăng ký Provider — bước 2: thông tin cơ sở (sau SignUpBasic).
 * Lấy email/password/name từ onboarding store, thu thập businessName/loại hình/
 * địa chỉ/định vị/SĐT rồi gọi register với đầy đủ field.
 */
export default function SignUpProviderScreen() {
  const { register } = useAuth();
  const basicInfo = useOnboardingStore((s) => s.basicInfo);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignUpProviderFormInput>({
    resolver: zodResolver(signUpProviderSchema),
    defaultValues: {
      businessName: '',
      businessType: 'restaurant',
      address: '',
      phone: '',
    },
  });

  const businessType = watch('businessType');

  const onSubmit = async (form: SignUpProviderFormInput) => {
    if (!basicInfo.email || !basicInfo.password || !basicInfo.name) {
      Popup.show({ type: 'error', text1: 'Thiếu thông tin tài khoản', text2: 'Vui lòng quay lại bước trước.' });
      return;
    }
    try {
      setSubmitting(true);
      await register({
        email: basicInfo.email,
        password: basicInfo.password,
        name: basicInfo.name,
        role: 'provider',
        businessName: form.businessName,
        businessType: form.businessType,
        address: form.address,
        ...(form.phone ? { phone: form.phone } : {}),
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      } as any);
      Popup.show({
        type: 'success',
        text1: 'Đăng ký thành công',
        text2: 'Hồ sơ cơ sở đang chờ quản trị viên xác minh.',
      });
      router.replace('/(app)/home');
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Đăng ký thất bại', text2: getErrorMessage(err) });
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
        <Text variant="titleMedium" style={styles.headerTitle}>Thông tin cơ sở</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>
            Bước cuối — cung cấp thông tin cơ sở để người nhận tìm tới lấy thực phẩm.
          </Text>

          {/* Tên cơ sở */}
          <Field label="Tên cơ sở *" error={errors.businessName?.message}>
            <Controller control={control} name="businessName" render={({ field: { onChange, value } }) => (
              <TextInput mode="outlined" placeholder="VD: Quán Cơm Tấm Cô Ba" value={value} onChangeText={onChange}
                left={<TextInput.Icon icon="storefront" />} outlineColor={COLORS.outline}
                activeOutlineColor={COLORS.primary} style={styles.input} error={!!errors.businessName} />
            )} />
          </Field>

          {/* Loại hình */}
          <Field label="Loại hình *">
            <View style={styles.chips}>
              {BUSINESS_TYPES.map((b) => (
                <Chip key={b.key} selected={businessType === b.key} showSelectedCheck
                  onPress={() => setValue('businessType', b.key, { shouldValidate: true })}
                  selectedColor={COLORS.primary} style={styles.chip}>
                  {b.label}
                </Chip>
              ))}
            </View>
          </Field>

          {/* Địa chỉ */}
          <Field label="Địa chỉ *" error={errors.address?.message}>
            <Controller control={control} name="address" render={({ field: { onChange, value } }) => (
              <TextInput mode="outlined" placeholder="Số nhà, đường, phường, quận" value={value} onChangeText={onChange}
                left={<TextInput.Icon icon="map-marker" />} outlineColor={COLORS.outline}
                activeOutlineColor={COLORS.primary} style={styles.input} error={!!errors.address} />
            )} />
          </Field>

          {/* Định vị trên bản đồ (OpenStreetMap) */}
          <Field label="Vị trí cơ sở trên bản đồ *">
            <MapPicker onPick={(lat, lng) => setCoords({ lat, lng })} />
          </Field>

          {/* SĐT */}
          <Field label="Số điện thoại liên hệ" error={errors.phone?.message}>
            <Controller control={control} name="phone" render={({ field: { onChange, value } }) => (
              <TextInput mode="outlined" placeholder="0912345678" value={value} onChangeText={onChange}
                keyboardType="phone-pad" left={<TextInput.Icon icon="phone" />} outlineColor={COLORS.outline}
                activeOutlineColor={COLORS.primary} style={styles.input} error={!!errors.phone} />
            )} />
          </Field>

          <Button mode="contained" onPress={handleSubmit(onSubmit)} loading={submitting}
            disabled={submitting} buttonColor={COLORS.primary} style={styles.submitBtn}
            labelStyle={{ fontSize: 16, fontWeight: 'bold' }}>
            Hoàn tất đăng ký
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  content: { padding: 20, paddingBottom: 40 },
  subtitle: { color: COLORS.onSurfaceVariant, marginBottom: 16, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.onSurfaceVariant, marginBottom: 8 },
  input: { backgroundColor: COLORS.surface },
  errorText: { fontSize: 12, color: COLORS.error, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginBottom: 4 },
  gpsBtn: { borderColor: COLORS.primary, borderRadius: 12, marginBottom: 14 },
  submitBtn: { marginTop: 8, borderRadius: 12, paddingVertical: 4 },
});
