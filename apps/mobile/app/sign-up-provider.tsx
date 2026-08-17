import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput, Button, Menu } from 'react-native-paper';
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
import { uploadRegisterEvidenceToBackend } from '@/services/imageUpload';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { MapPicker, type MapPickerHandle } from '@/components/MapPicker';
import { elevation, mobileColors as COLORS, radius, spacing } from '@/theme/design';

const BUSINESS_TYPES: { key: SignUpProviderFormInput['businessType']; label: string }[] = [
  { key: 'restaurant', label: 'Nhà hàng / Quán ăn' },
  { key: 'supermarket', label: 'Siêu thị / Cửa hàng' },
  { key: 'bakery', label: 'Tiệm bánh' },
  { key: 'hotel', label: 'Khách sạn' },
  { key: 'other', label: 'Khác' },
];

const MAX_EVIDENCE = 3;

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

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
  const [menuVisible, setMenuVisible] = useState(false);
  const [phoneMode, setPhoneMode] = useState<'registered' | 'custom'>(
    basicInfo.phone ? 'registered' : 'custom'
  );
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Minh chứng: local URIs + uploaded URLs (index tương ứng)
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const mapRef = useRef<MapPickerHandle>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      businessType: undefined,
      address: '',
      // Điền sẵn phone đã đăng ký nếu có
      phone: basicInfo.phone ?? '',
    },
  });

  const businessType = watch('businessType');

  // Đồng bộ phone form khi basicInfo.phone có sẵn và phoneMode là 'registered'
  useEffect(() => {
    if (phoneMode === 'registered' && basicInfo.phone) {
      setValue('phone', basicInfo.phone, { shouldValidate: false });
    }
  }, [phoneMode, basicInfo.phone, setValue]);

  const handlePhoneModeChange = (mode: 'registered' | 'custom') => {
    setPhoneMode(mode);
    if (mode === 'registered') {
      setValue('phone', basicInfo.phone ?? '', { shouldValidate: true });
    } else {
      setValue('phone', '', { shouldValidate: false });
    }
  };

  // Khi ghim bản đồ → reverse geocode → điền vào ô địa chỉ
  const handleMapPick = useCallback(async (lat: number, lng: number) => {
    setCoords({ lat, lng });
    setSuggestions([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=vi`,
        { headers: { 'User-Agent': 'FoodResQ/1.0 (capstone)' } }
      );
      const data = await res.json();
      if (data?.display_name) {
        setValue('address', data.display_name, { shouldValidate: true });
      }
    } catch {}
  }, [setValue]);

  // Debounced search khi người dùng gõ địa chỉ
  const triggerAddressSearch = useCallback((text: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!text.trim() || text.length < 3) {
      setSuggestions([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&countrycodes=vn&limit=5`,
          { headers: { 'User-Agent': 'FoodResQ/1.0 (capstone)' } }
        );
        const data: NominatimResult[] = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  // Chọn gợi ý → điền địa chỉ + dịch ghim bản đồ
  const handleSuggestionSelect = useCallback((item: NominatimResult) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    setValue('address', item.display_name, { shouldValidate: true });
    setCoords({ lat, lng });
    mapRef.current?.recenter(lat, lng);
    setSuggestions([]);
  }, [setValue]);

  // Chọn ảnh minh chứng và upload ngay
  const pickEvidence = async () => {
    if (evidenceUris.length >= MAX_EVIDENCE) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Popup.show({ type: 'error', text1: 'Cần quyền thư viện ảnh', text2: 'Vui lòng cho phép truy cập thư viện trong Cài đặt.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    const uri = result.assets[0].uri;
    const idx = evidenceUris.length;
    setEvidenceUris((prev) => [...prev, uri]);
    setEvidenceUrls((prev) => [...prev, '']); // placeholder
    setUploadingIdx(idx);
    try {
      const url = await uploadRegisterEvidenceToBackend(uri);
      setEvidenceUrls((prev) => {
        const next = [...prev];
        next[idx] = url;
        return next;
      });
    } catch {
      // Xoá ảnh lỗi
      setEvidenceUris((prev) => prev.filter((_, i) => i !== idx));
      setEvidenceUrls((prev) => prev.filter((_, i) => i !== idx));
      Popup.show({ type: 'error', text1: 'Tải ảnh thất bại', text2: 'Vui lòng thử lại.' });
    } finally {
      setUploadingIdx(null);
    }
  };

  const removeEvidence = (idx: number) => {
    setEvidenceUris((prev) => prev.filter((_, i) => i !== idx));
    setEvidenceUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = async (form: SignUpProviderFormInput) => {
    if (!basicInfo.email || !basicInfo.password || !basicInfo.name) {
      Popup.show({ type: 'error', text1: 'Thiếu thông tin tài khoản', text2: 'Vui lòng quay lại bước trước.' });
      return;
    }
    if (evidenceUrls.some((u) => !u)) {
      Popup.show({ type: 'error', text1: 'Đang tải ảnh', text2: 'Vui lòng chờ tải ảnh xong trước khi gửi.' });
      return;
    }
    if (evidenceUrls.length === 0) {
      Popup.show({ type: 'error', text1: 'Thiếu ảnh minh chứng', text2: 'Vui lòng tải lên ít nhất 1 ảnh (GPKD hoặc ảnh cơ sở) để admin xét duyệt.' });
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
        ...(evidenceUrls.length > 0 ? { evidenceUrls } : {}),
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
            <Menu
              visible={menuVisible}
              onDismiss={() => setMenuVisible(false)}
              anchor={
                <Pressable
                  onPress={() => setMenuVisible(true)}
                  style={styles.dropdown}
                  accessibilityRole="button"
                  accessibilityLabel="Chọn loại hình cơ sở"
                >
                  <MaterialCommunityIcons name="store-outline" size={18} color={COLORS.onSurfaceVariant} style={styles.dropdownIcon} />
                  <Text style={styles.dropdownText} numberOfLines={1}>
                    {BUSINESS_TYPES.find((b) => b.key === businessType)?.label ?? 'Chọn loại hình'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={COLORS.onSurfaceVariant} />
                </Pressable>
              }
              contentStyle={styles.menuContent}
            >
              {BUSINESS_TYPES.map((b) => (
                <Menu.Item
                  key={b.key}
                  title={b.label}
                  trailingIcon={businessType === b.key ? 'check' : undefined}
                  titleStyle={businessType === b.key ? styles.menuItemSelected : undefined}
                  onPress={() => {
                    setValue('businessType', b.key, { shouldValidate: true });
                    setMenuVisible(false);
                  }}
                />
              ))}
            </Menu>
          </Field>

          {/* Địa chỉ + autocomplete */}
          <Field label="Địa chỉ *" error={errors.address?.message}>
            <Controller
              control={control}
              name="address"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Tìm địa chỉ cơ sở"
                  placeholder="Gõ để tìm hoặc ghim trên bản đồ"
                  value={value}
                  onChangeText={(text) => { onChange(text); triggerAddressSearch(text); }}
                  left={<TextInput.Icon icon="map-marker" />}
                  right={searching ? <TextInput.Icon icon={() => <ActivityIndicator size={16} color={COLORS.primary} />} /> : undefined}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  style={styles.input}
                  error={!!errors.address}
                  dense
                />
              )}
            />
            {suggestions.length > 0 && (
              <View style={styles.suggestions}>
                {suggestions.map((s) => (
                  <Pressable
                    key={s.place_id}
                    style={styles.suggestionItem}
                    onPress={() => handleSuggestionSelect(s)}
                    android_ripple={{ color: COLORS.primaryContainer }}
                  >
                    <MaterialCommunityIcons name="map-marker-outline" size={16} color={COLORS.primary} style={styles.suggestionIcon} />
                    <Text style={styles.suggestionText} numberOfLines={2}>{s.display_name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {coords && (
              <View style={styles.coordsBadge}>
                <MaterialCommunityIcons name="check-circle-outline" size={14} color={COLORS.primary} />
                <Text style={styles.coordsText}>
                  Đã ghim: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </Text>
              </View>
            )}
          </Field>

          {/* Định vị trên bản đồ (OpenStreetMap) */}
          <Field label="Vị trí cơ sở trên bản đồ *">
            <MapPicker ref={mapRef} onPick={handleMapPick} />
            <Text style={styles.helperText}>
              Kéo ghim hoặc chạm bản đồ — địa chỉ sẽ tự điền vào ô trên.
            </Text>
          </Field>

          {/* SĐT */}
          <Field label="Số điện thoại liên hệ" error={errors.phone?.message}>
            {basicInfo.phone ? (
              <View style={styles.phoneToggle}>
                <Pressable
                  style={[styles.phoneToggleBtn, phoneMode === 'registered' && styles.phoneToggleBtnActive]}
                  onPress={() => handlePhoneModeChange('registered')}
                >
                  <Text style={[styles.phoneToggleText, phoneMode === 'registered' && styles.phoneToggleTextActive]}>
                    Số đã đăng ký
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.phoneToggleBtn, phoneMode === 'custom' && styles.phoneToggleBtnActive]}
                  onPress={() => handlePhoneModeChange('custom')}
                >
                  <Text style={[styles.phoneToggleText, phoneMode === 'custom' && styles.phoneToggleTextActive]}>
                    Số khác
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {phoneMode === 'registered' && basicInfo.phone ? (
              <View style={styles.phoneReadonly}>
                <MaterialCommunityIcons name="phone-check" size={18} color={COLORS.primary} />
                <Text style={styles.phoneReadonlyText}>{basicInfo.phone}</Text>
              </View>
            ) : (
              <Controller control={control} name="phone" render={({ field: { onChange, value } }) => (
                <TextInput mode="outlined" label="Số điện thoại" placeholder="0912345678" value={value} onChangeText={onChange}
                  keyboardType="phone-pad" left={<TextInput.Icon icon="phone" />} outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary} style={styles.input} error={!!errors.phone} dense />
              )} />
            )}
          </Field>

          {/* Ảnh minh chứng */}
          <Field label={`Ảnh minh chứng * (${evidenceUris.length}/${MAX_EVIDENCE})`}>
            <View style={styles.evidenceBanner}>
              <MaterialCommunityIcons name="information-outline" size={15} color={COLORS.primary} />
              <Text style={styles.evidenceBannerText}>
                Tải lên GPKD, ảnh cơ sở hoặc CCCD để admin xét duyệt nhanh hơn.
              </Text>
            </View>
            <View style={styles.evidenceGrid}>
              {evidenceUris.map((uri, idx) => (
                <View key={uri} style={styles.evidenceSlot}>
                  <Image source={{ uri }} style={styles.evidenceThumb} resizeMode="cover" />
                  {uploadingIdx === idx ? (
                    <View style={styles.evidenceOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  ) : (
                    <Pressable style={styles.evidenceRemove} onPress={() => removeEvidence(idx)} hitSlop={4}>
                      <MaterialCommunityIcons name="close-circle" size={20} color="#fff" />
                    </Pressable>
                  )}
                </View>
              ))}
              {evidenceUris.length < MAX_EVIDENCE && (
                <Pressable style={styles.evidenceAdd} onPress={pickEvidence} disabled={uploadingIdx !== null}>
                  {uploadingIdx !== null ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="camera-plus-outline" size={26} color={COLORS.primary} />
                      <Text style={styles.evidenceAddText}>Thêm ảnh</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          </Field>

          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            loading={submitting}
            disabled={submitting || uploadingIdx !== null}
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

const SLOT = 96;

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
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    gap: 8,
  },
  dropdownIcon: { marginRight: 2 },
  dropdownText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  menuContent: { backgroundColor: COLORS.surface },
  menuItemSelected: { color: COLORS.primary, fontWeight: '800' },
  // Suggestions
  suggestions: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    ...elevation.card,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
  },
  suggestionIcon: { marginTop: 1 },
  suggestionText: { flex: 1, fontSize: 13, color: COLORS.onSurface, lineHeight: 18 },
  // Coords badge
  coordsBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  coordsText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  // Phone toggle
  phoneToggle: {
    flexDirection: 'row',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: COLORS.outline,
    overflow: 'hidden',
  },
  phoneToggleBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  phoneToggleBtnActive: { backgroundColor: COLORS.primaryContainer },
  phoneToggleText: { fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceVariant },
  phoneToggleTextActive: { color: COLORS.primary, fontWeight: '800' },
  phoneReadonly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  phoneReadonlyText: { fontSize: 15, color: COLORS.onSurface, fontWeight: '600' },
  // Evidence
  evidenceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  evidenceBannerText: { flex: 1, fontSize: 12, lineHeight: 17, color: COLORS.primary, fontWeight: '600' },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  evidenceSlot: {
    width: SLOT,
    height: SLOT,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  evidenceThumb: { width: SLOT, height: SLOT, borderRadius: radius.md },
  evidenceOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceRemove: { position: 'absolute', top: 4, right: 4 },
  evidenceAdd: {
    width: SLOT,
    height: SLOT,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryContainer,
  },
  evidenceAddText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  // Footer
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
