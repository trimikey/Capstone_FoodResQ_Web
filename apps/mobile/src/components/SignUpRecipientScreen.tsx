import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { ActivityIndicator, Button, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import ErrorToast from './ErrorToast';
import { getCurrentCoords } from '@/services/geolocation';
import { reverseGeocode, searchAddress } from '@/services/geocoding';
import {
  fetchProvinces,
  fetchWards,
  filterAdministrativeUnits,
  FALLBACK_PROVINCES,
  normalizeAdministrativeSearch,
  type AdministrativeUnit,
} from '@/services/vietnamAdministrative';
import { FadeInUp } from './ui/Motion';
import {
  AuthCard,
  AuthField,
  AuthHeader,
  AuthIntro,
  AuthScaffold,
  ProgressDots,
  authStyles,
} from './auth/AuthLayout';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

type RecipientType = 'individual' | 'charity';
type PickerStep = 'province' | 'ward';

const signUpRecipientSchema = z.object({
  recipientType: z.enum(['individual', 'charity']),
  idNumber: z.string().optional(),
  organizationName: z.string().optional(),
  taxId: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  address: z.string().trim().min(5, 'Địa chỉ phải từ 5 ký tự'),
}).superRefine((data, ctx) => {
  if (data.recipientType === 'charity') {
    if (!data.organizationName?.trim() || data.organizationName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationName'],
        message: 'Tên tổ chức phải từ 2 ký tự',
      });
    }
  }
});

export type SignUpRecipientInput = z.infer<typeof signUpRecipientSchema>;

interface SignUpRecipientScreenProps {
  onSuccess?: (data: SignUpRecipientInput) => void | Promise<void>;
  onBack?: () => void;
  isLoading?: boolean;
  initialRecipientType?: RecipientType;
}

export function SignUpRecipientScreen({
  onSuccess,
  onBack,
  isLoading = false,
  initialRecipientType = 'individual',
}: SignUpRecipientScreenProps) {
  const [recipientType, setRecipientType] = useState<RecipientType>(initialRecipientType);
  const [quickPaste, setQuickPaste] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [selectedProvince, setSelectedProvince] = useState<AdministrativeUnit | null>(null);
  const [selectedWard, setSelectedWard] = useState<AdministrativeUnit | null>(null);
  const [provinces, setProvinces] = useState<AdministrativeUnit[]>(FALLBACK_PROVINCES);
  const [wards, setWards] = useState<AdministrativeUnit[]>([]);
  const [isLoadingProvinces, setIsLoadingProvinces] = useState(true);
  const [isLoadingWards, setIsLoadingWards] = useState(false);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [pickerStep, setPickerStep] = useState<PickerStep>('province');
  const [pickerQuery, setPickerQuery] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isPinningCurrent, setIsPinningCurrent] = useState(false);
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    getValues,
    setError,
    clearErrors,
  } = useForm<SignUpRecipientInput>({
    resolver: zodResolver(signUpRecipientSchema),
    defaultValues: {
      recipientType: initialRecipientType,
      idNumber: '',
      organizationName: '',
      taxId: '',
      address: '',
      lat: undefined,
      lng: undefined,
    },
  });

  const hasCoords = !!coords;
  const administrativeLabel = selectedProvince && selectedWard
    ? `${selectedProvince.name}, ${selectedWard.name}`
    : '';

  const normalizedAddress = useMemo(() => {
    return [streetAddress.trim(), selectedWard?.name, selectedProvince?.name]
      .filter(Boolean)
      .join(', ');
  }, [selectedProvince?.name, selectedWard?.name, streetAddress]);

  const pickerItems = useMemo(() => {
    const items = pickerStep === 'province' ? provinces : wards;
    return filterAdministrativeUnits(items, pickerQuery);
  }, [pickerQuery, pickerStep, provinces, wards]);

  useEffect(() => {
    const controller = new AbortController();
    fetchProvinces(controller.signal)
      .then(setProvinces)
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingProvinces(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedProvince) return;

    const controller = new AbortController();
    fetchWards(selectedProvince.code, controller.signal)
      .then(setWards)
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingWards(false);
      });

    return () => controller.abort();
  }, [selectedProvince]);

  useEffect(() => {
    setValue('address', normalizedAddress, { shouldValidate: false });
    if (normalizedAddress.length >= 5) clearErrors('address');
  }, [clearErrors, normalizedAddress, setValue]);

  const handleRecipientTypeChange = (value: RecipientType) => {
    setRecipientType(value);
    setValue('recipientType', value, { shouldValidate: true });
  };

  const openProvincePicker = () => {
    setPickerStep('province');
    setPickerQuery('');
    setIsPickerVisible(true);
  };

  const selectProvince = (province: AdministrativeUnit) => {
    setIsLoadingWards(true);
    setWards([]);
    setSelectedProvince(province);
    setSelectedWard(null);
    setCoords(null);
    setValue('lat', undefined, { shouldValidate: false });
    setValue('lng', undefined, { shouldValidate: false });
    setPickerStep('ward');
    setPickerQuery('');
  };

  const selectWard = (ward: AdministrativeUnit) => {
    setSelectedWard(ward);
    setCoords(null);
    setValue('lat', undefined, { shouldValidate: false });
    setValue('lng', undefined, { shouldValidate: false });
    setPickerQuery('');
    setIsPickerVisible(false);
  };

  const applyQuickPaste = async () => {
    const pasted = quickPaste.trim();
    if (pasted.length < 5) {
      showError('Dán địa chỉ có ít nhất 5 ký tự.', 2500);
      return;
    }
    setStreetAddress(pasted);
    setCoords(null);
    setValue('lat', undefined, { shouldValidate: false });
    setValue('lng', undefined, { shouldValidate: false });
    await matchAdministrativeUnitsFromText(pasted);
  };

  const matchAdministrativeUnitsFromText = async (text: string) => {
    const normalized = normalizeAdministrativeSearch(text);
    const province = provinces.find((item) => normalized.includes(normalizeAdministrativeSearch(item.name)));
    if (!province) return;

    setSelectedProvince(province);
    const provinceWards = await fetchWards(province.code);
    setWards(provinceWards);
    const ward = provinceWards.find((item) => normalized.includes(normalizeAdministrativeSearch(item.name)));
    if (ward) setSelectedWard(ward);
  };

  const pinCurrentLocation = async () => {
    try {
      clearError();
      setIsPinningCurrent(true);
      const result = await getCurrentCoords();
      if (!result.coords) {
        showError('Không lấy được GPS thật. Kiểm tra quyền vị trí và bật định vị trên thiết bị.', 3000);
        return;
      }

      const resolvedAddress = await reverseGeocode(result.coords.lat, result.coords.lng);
      const address = resolvedAddress || `${result.coords.lat.toFixed(6)}, ${result.coords.lng.toFixed(6)}`;
      setStreetAddress(address);
      setCoords(result.coords);
      setValue('address', address, { shouldValidate: true });
      setValue('lat', result.coords.lat, { shouldValidate: true });
      setValue('lng', result.coords.lng, { shouldValidate: true });
      await matchAdministrativeUnitsFromText(address);
    } catch (err) {
      showError(getErrorMessage(err), 3000);
    } finally {
      setIsPinningCurrent(false);
    }
  };

  const onSubmit = async () => {
    try {
      clearError();
      clearErrors('address');

      const finalAddress = normalizedAddress || streetAddress.trim();
      if (!selectedProvince || !selectedWard || streetAddress.trim().length < 3) {
        setError('address', {
          type: 'manual',
          message: 'Vui lòng chọn Tỉnh/Thành phố, Phường/Xã và nhập số nhà/tên đường.',
        });
        return;
      }

      let lat = coords?.lat;
      let lng = coords?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setIsResolvingAddress(true);
        const results = await searchAddress(finalAddress);
        lat = results[0]?.lat;
        lng = results[0]?.lng;
      }

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setError('address', {
          type: 'manual',
          message: 'Không xác định được tọa độ. Hãy bấm dùng vị trí hiện tại hoặc nhập địa chỉ chi tiết hơn.',
        });
        return;
      }

      await onSuccess?.({
        recipientType,
        address: finalAddress,
        lat,
        lng,
        organizationName: getValues('organizationName'),
        idNumber: getValues('idNumber'),
        taxId: getValues('taxId'),
      });
    } catch (err) {
      showError(getErrorMessage(err), 3000);
    } finally {
      setIsResolvingAddress(false);
    }
  };

  return (
    <AuthScaffold
      footer={
        <View style={styles.footerActions}>
          <Button
            mode="outlined"
            onPress={onBack}
            disabled={isLoading || isResolvingAddress}
            style={[authStyles.secondaryButton, styles.backFooterButton]}
            contentStyle={authStyles.buttonContent}
            labelStyle={authStyles.buttonLabel}
          >
            Quay lại
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading || isResolvingAddress || isPinningCurrent}
            loading={isLoading || isResolvingAddress}
            buttonColor={COLORS.primary}
            style={[authStyles.primaryButton, styles.mainFooterButton]}
            contentStyle={authStyles.buttonContent}
            labelStyle={authStyles.buttonLabel}
          >
            {isLoading || isResolvingAddress ? 'Đang lưu' : 'Hoàn tất'}
          </Button>
        </View>
      }
    >
      <AuthHeader
        onBack={onBack}
        disabled={isLoading || isResolvingAddress}
        title="FoodResQ"
        subtitle="Thông tin người nhận"
        right={<Text style={styles.stepText}>2/2</Text>}
      />

      <ProgressDots total={2} active={1} label="Bước 2: Hồ sơ nhận thực phẩm" />

      <AuthIntro
        icon="account-heart-outline"
        eyebrow="Người nhận"
        title={recipientType === 'charity' ? 'Thông tin tổ chức' : 'Thông tin cá nhân'}
        description="FoodResQ dùng thông tin này để xác minh hồ sơ và chuẩn hóa điểm nhận hỗ trợ."
      />

      <FadeInUp delay={80}>
        <AuthCard>
          <AuthField label="Loại hồ sơ">
            <View style={styles.typeRow}>
              <TypeButton
                label="Cá nhân"
                icon="account-outline"
                selected={recipientType === 'individual'}
                disabled={isLoading}
                onPress={() => handleRecipientTypeChange('individual')}
              />
              <TypeButton
                label="Tổ chức"
                icon="hand-heart-outline"
                selected={recipientType === 'charity'}
                disabled={isLoading}
                onPress={() => handleRecipientTypeChange('charity')}
              />
            </View>
          </AuthField>

          {recipientType === 'charity' ? (
            <AuthField label="Tên tổ chức" error={errors.organizationName?.message}>
              <Controller
                control={control}
                name="organizationName"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    mode="outlined"
                    label="Tên pháp lý hoặc tên hoạt động"
                    placeholder="VD: Mái ấm FoodResQ"
                    value={value}
                    onChangeText={onChange}
                    editable={!isLoading}
                    left={<TextInput.Icon icon="office-building-outline" color={COLORS.onSurfaceVariant} />}
                    style={authStyles.input}
                    outlineColor={COLORS.outline}
                    activeOutlineColor={COLORS.primary}
                    error={!!errors.organizationName}
                    dense
                  />
                )}
              />
            </AuthField>
          ) : null}
        </AuthCard>
      </FadeInUp>

      <FadeInUp delay={120}>
        <View style={styles.quickCard}>
          <View style={styles.quickHeader}>
            <MaterialCommunityIcons name="home-map-marker" size={22} color={COLORS.secondary} />
            <View style={styles.quickCopy}>
              <Text style={styles.quickTitle}>Số nhà</Text>
              <Text style={styles.quickDescription}>
                Nhập số nhà, tên đường hoặc tòa nhà.
              </Text>
            </View>
          </View>
          <TextInput
            mode="outlined"
            placeholder="VD: 12 Nguyễn Huệ"
            value={quickPaste}
            onChangeText={setQuickPaste}
            editable={!isLoading}
            dense
            style={[authStyles.input, styles.quickInput]}
            outlineColor={COLORS.outline}
            activeOutlineColor={COLORS.secondary}
            right={<TextInput.Icon icon="auto-fix" onPress={applyQuickPaste} forceTextInputFocus={false} />}
          />
        </View>
      </FadeInUp>

      <FadeInUp delay={160}>
        <AuthCard>
          <Text style={styles.sectionTitle}>Địa chỉ</Text>
          <Pressable
            onPress={pinCurrentLocation}
            disabled={isLoading || isPinningCurrent}
            style={({ pressed }) => [
              styles.currentLocationButton,
              pressed && authStyles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sử dụng vị trí hiện tại của tôi"
          >
            {isPinningCurrent ? (
              <ActivityIndicator size={20} color={COLORS.secondary} />
            ) : (
              <MaterialCommunityIcons name="map-marker" size={22} color={COLORS.secondary} />
            )}
            <Text style={styles.currentLocationText}>Sử dụng vị trí hiện tại của tôi</Text>
          </Pressable>

          <AuthField error={errors.address?.message} label="Khu vực">
            <Pressable
              onPress={openProvincePicker}
              disabled={isLoading || isLoadingProvinces}
              style={({ pressed }) => [
                styles.selectRow,
                pressed && authStyles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Chọn Tỉnh Thành phố và Phường Xã"
            >
              <Text
                style={[
                  styles.selectText,
                  !administrativeLabel && styles.placeholderText,
                ]}
                numberOfLines={2}
              >
                {administrativeLabel || 'Tỉnh/Thành phố và Phường/Xã'}
              </Text>
              {isLoadingProvinces ? (
                <ActivityIndicator size={18} color={COLORS.primary} />
              ) : (
                <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.onSurfaceVariant} />
              )}
            </Pressable>
          </AuthField>

          <AuthField
            label="Địa chỉ chi tiết"
            helper={hasCoords ? `Đã có tọa độ (${coords?.lat.toFixed(4)}, ${coords?.lng.toFixed(4)})` : 'Hệ thống sẽ xác định tọa độ khi hoàn tất.'}
          >
            <TextInput
              mode="outlined"
              placeholder="Tên đường, tòa nhà, số nhà."
              value={streetAddress}
              onChangeText={(value) => {
                setStreetAddress(value);
                setCoords(null);
                setValue('lat', undefined, { shouldValidate: false });
                setValue('lng', undefined, { shouldValidate: false });
              }}
              editable={!isLoading}
              multiline
              numberOfLines={3}
              style={[authStyles.input, authStyles.multilineInput]}
              outlineColor={COLORS.outline}
              activeOutlineColor={COLORS.primary}
              left={<TextInput.Icon icon="map-marker-outline" color={COLORS.onSurfaceVariant} />}
            />
          </AuthField>
        </AuthCard>
      </FadeInUp>

      <AddressPickerModal
        visible={isPickerVisible}
        step={pickerStep}
        query={pickerQuery}
        items={pickerItems}
        selectedProvince={selectedProvince}
        loading={pickerStep === 'province' ? isLoadingProvinces : isLoadingWards}
        onQueryChange={setPickerQuery}
        onBack={() => {
          if (pickerStep === 'ward') {
            setPickerStep('province');
            setPickerQuery('');
            return;
          }
          setIsPickerVisible(false);
        }}
        onUseCurrent={pinCurrentLocation}
        onSelect={(item) => {
          if (pickerStep === 'province') selectProvince(item);
          else selectWard(item);
        }}
      />

      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={3000}
      />
    </AuthScaffold>
  );
}

function AddressPickerModal({
  visible,
  step,
  query,
  items,
  selectedProvince,
  loading,
  onQueryChange,
  onBack,
  onUseCurrent,
  onSelect,
}: {
  visible: boolean;
  step: PickerStep;
  query: string;
  items: AdministrativeUnit[];
  selectedProvince: AdministrativeUnit | null;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onBack: () => void;
  onUseCurrent: () => void;
  onSelect: (item: AdministrativeUnit) => void;
}) {
  const title = step === 'province' ? 'Tỉnh/Thành phố' : selectedProvince?.name ?? 'Phường/Xã';
  const placeholder = step === 'province'
    ? 'Tìm kiếm Tỉnh/Thành phố'
    : 'Tìm kiếm Phường/Xã';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onBack}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Pressable
            onPress={onBack}
            hitSlop={10}
            style={({ pressed }) => [styles.modalBackButton, pressed && authStyles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
          >
            <MaterialCommunityIcons name="arrow-left" size={28} color={COLORS.secondary} />
          </Pressable>
          <TextInput
            mode="flat"
            value={query}
            onChangeText={onQueryChange}
            placeholder={placeholder}
            dense
            underlineColor="transparent"
            activeUnderlineColor="transparent"
            left={<TextInput.Icon icon="magnify" color={COLORS.onSurfaceVariant} />}
            style={styles.modalSearch}
          />
        </View>

        <View style={styles.modalBody}>
          <Pressable
            onPress={onUseCurrent}
            style={({ pressed }) => [
              styles.modalCurrentButton,
              pressed && authStyles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sử dụng vị trí hiện tại của tôi"
          >
            <MaterialCommunityIcons name="map-marker" size={28} color={COLORS.secondary} />
            <Text style={styles.modalCurrentText}>Sử dụng vị trí hiện tại của tôi</Text>
          </Pressable>

          <Text style={styles.modalSectionLabel}>{title}</Text>
          {loading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.modalEmptyText}>Đang tải danh mục...</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => String(item.code)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.modalEmptyText}>Không có kết quả phù hợp</Text>}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [
                    styles.modalItem,
                    pressed && authStyles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Chọn ${item.name}`}
                >
                  <Text style={styles.modalItemText}>{item.name}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.outline} />
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function TypeButton({
  label,
  icon,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.typeButton,
        selected && styles.typeButtonSelected,
        pressed && authStyles.pressed,
      ]}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
    >
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={selected ? COLORS.primary : COLORS.onSurfaceVariant}
      />
      <Text style={[styles.typeLabel, selected && styles.typeLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeButton: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  typeButtonSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.onSurfaceVariant,
  },
  typeLabelSelected: {
    color: COLORS.primary,
  },
  quickCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#ffd8d0',
    backgroundColor: '#fff7f5',
  },
  quickHeader: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickCopy: {
    flex: 1,
  },
  quickTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  quickDescription: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.onSurfaceVariant,
  },
  quickInput: {
    minHeight: 48,
    backgroundColor: COLORS.surface,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  currentLocationButton: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  currentLocationText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.onSurface,
  },
  selectRow: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.onSurface,
  },
  placeholderText: {
    color: COLORS.onSurfaceVariant,
  },
  footerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  backFooterButton: {
    flex: 1,
  },
  mainFooterButton: {
    flex: 2,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    minHeight: 92,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
  },
  modalBackButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSearch: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: COLORS.surfaceContainerLow,
    overflow: 'hidden',
  },
  modalBody: {
    flex: 1,
    paddingTop: spacing.lg,
  },
  modalCurrentButton: {
    minHeight: 58,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  modalCurrentText: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.onSurface,
  },
  modalSectionLabel: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  modalItem: {
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
  },
  modalItemText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 23,
    color: COLORS.onSurface,
  },
  modalLoading: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  modalEmptyText: {
    padding: spacing.lg,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
});

export default SignUpRecipientScreen;
