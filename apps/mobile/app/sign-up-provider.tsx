import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { elevation, mobileColors as COLORS, radius, spacing } from '@/theme/design';

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
  const insets = useSafeAreaInsets();
  const { register, initialize } = useAuth();
  const basicInfo = useOnboardingStore((s) => s.basicInfo);
  const resetOnboarding = useOnboardingStore((s) => s.reset);
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
      await initialize();
      resetOnboarding();
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
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text variant="titleMedium" style={styles.headerTitle}>FoodResQ</Text>
          <Text style={styles.headerSubtitle}>Thông tin nhà cung cấp</Text>
        </View>
        <Text style={styles.stepText}>2/2</Text>
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
          <View style={styles.progressWrap}>
            <View style={styles.progressDots}>
              <View style={styles.progressDotActive} />
              <View style={styles.progressDotActive} />
            </View>
            <Text style={styles.progressLabel}>Bước 2: Hồ sơ cơ sở</Text>
          </View>

          <View style={styles.intro}>
            <View style={styles.introIcon}>
              <MaterialCommunityIcons name="storefront-outline" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.eyebrow}>Nhà cung cấp</Text>
            <Text style={styles.title}>Cung cấp thông tin cơ sở</Text>
            <Text style={styles.subtitle}>
              Người nhận và tình nguyện viên cần địa chỉ, liên hệ và vị trí rõ ràng để tới lấy thực phẩm đúng giờ.
            </Text>
          </View>

          <View style={styles.card}>

          {/* Tên cơ sở */}
          <Field label="Tên cơ sở *" error={errors.businessName?.message}>
            <Controller control={control} name="businessName" render={({ field: { onChange, value } }) => (
              <TextInput mode="outlined" label="Tên cơ sở" placeholder="VD: Quán Cơm Tấm Cô Ba" value={value} onChangeText={onChange}
                left={<TextInput.Icon icon="storefront" />} outlineColor={COLORS.outline}
                activeOutlineColor={COLORS.primary} style={styles.input} error={!!errors.businessName} dense />
            )} />
          </Field>

          {/* Loại hình */}
          <Field label="Loại hình *">
            <View style={styles.chips}>
              {BUSINESS_TYPES.map((b) => (
                <Chip key={b.key} selected={businessType === b.key} showSelectedCheck
                  onPress={() => setValue('businessType', b.key, { shouldValidate: true })}
                  selectedColor={businessType === b.key ? COLORS.primary : COLORS.onSurface}
                  style={[styles.chip, businessType === b.key && styles.chipSelected]}
                  textStyle={[styles.chipText, businessType === b.key && styles.chipTextSelected]}>
                  {b.label}
                </Chip>
              ))}
            </View>
          </Field>

          {/* Địa chỉ */}
          <Field label="Địa chỉ *" error={errors.address?.message}>
            <Controller control={control} name="address" render={({ field: { onChange, value } }) => (
              <TextInput mode="outlined" label="Địa chỉ cơ sở" placeholder="Số nhà, đường, phường, quận" value={value} onChangeText={onChange}
                left={<TextInput.Icon icon="map-marker" />} outlineColor={COLORS.outline}
                activeOutlineColor={COLORS.primary} style={styles.input} error={!!errors.address} dense />
            )} />
          </Field>

          {/* Định vị trên bản đồ (OpenStreetMap) */}
          <Field label="Vị trí cơ sở trên bản đồ *">
            <MapPicker onPick={(lat, lng) => setCoords({ lat, lng })} />
            <Text style={styles.helperText}>
              Chạm trên bản đồ để lưu toạ độ lấy hàng chính xác.
            </Text>
          </Field>

          {/* SĐT */}
          <Field label="Số điện thoại liên hệ" error={errors.phone?.message}>
            <Controller control={control} name="phone" render={({ field: { onChange, value } }) => (
              <TextInput mode="outlined" label="Số điện thoại" placeholder="0912345678" value={value} onChangeText={onChange}
                keyboardType="phone-pad" left={<TextInput.Icon icon="phone" />} outlineColor={COLORS.outline}
                activeOutlineColor={COLORS.primary} style={styles.input} error={!!errors.phone} dense />
            )} />
          </Field>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            loading={submitting}
            disabled={submitting}
            buttonColor={COLORS.primary}
            style={styles.submitBtn}
            contentStyle={styles.submitContent}
            labelStyle={styles.submitLabel}
            accessibilityLabel="Hoàn tất đăng ký nhà cung cấp"
            accessibilityState={{ disabled: submitting }}
          >
            Hoàn tất đăng ký
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  formArea: { flex: 1 },
  header: {
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    backgroundColor: COLORS.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1 },
  headerTitle: { fontWeight: '900', color: COLORS.onSurface },
  headerSubtitle: { marginTop: 1, fontSize: 12, color: COLORS.onSurfaceVariant },
  stepText: { fontSize: 12, fontWeight: '900', color: COLORS.primary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  progressWrap: { alignItems: 'center', gap: 7 },
  progressDots: { flexDirection: 'row', gap: 7 },
  progressDotActive: { width: 34, height: 7, borderRadius: radius.pill, backgroundColor: COLORS.primary },
  progressLabel: { fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceVariant },
  intro: { paddingVertical: spacing.sm },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  eyebrow: { fontSize: 12, fontWeight: '900', color: COLORS.primary, textTransform: 'uppercase' },
  title: { marginTop: 4, fontSize: 28, lineHeight: 34, fontWeight: '900', color: COLORS.onSurface },
  subtitle: { marginTop: 7, color: COLORS.onSurfaceVariant, lineHeight: 20 },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    ...elevation.card,
  },
  field: { gap: 7 },
  label: { fontSize: 14, fontWeight: '800', color: COLORS.onSurface },
  helperText: { fontSize: 12, lineHeight: 17, color: COLORS.onSurfaceVariant },
  input: { minHeight: 50, backgroundColor: COLORS.surface },
  errorText: { fontSize: 12, lineHeight: 17, color: COLORS.error, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, marginBottom: 2, borderRadius: radius.pill, backgroundColor: COLORS.surfaceContainerLow },
  chipSelected: { backgroundColor: COLORS.primaryContainer },
  chipText: { color: COLORS.onSurface, fontWeight: '600' },
  chipTextSelected: { color: COLORS.primary, fontWeight: '800' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  submitBtn: { borderRadius: radius.md },
  submitContent: { minHeight: 52 },
  submitLabel: { fontSize: 15, fontWeight: '900' },
});
