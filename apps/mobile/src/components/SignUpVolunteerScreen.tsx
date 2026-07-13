import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import ErrorToast from './ErrorToast';
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

const volunteerInfoSchema = z
  .object({
    idCard: z.string().min(5, 'Cần nhập số giấy tờ tùy thân'),
    specializations: z.array(z.enum(['shipper', 'chef', 'waiter']))
      .min(1, 'Chọn ít nhất một chuyên môn'),
    vehicleType: z.string().optional(),
    plateNumber: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.specializations.includes('shipper')) {
      if (!data.vehicleType?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['vehicleType'],
          message: 'Cần nhập loại phương tiện cho shipper',
        });
      }
      if (!data.plateNumber?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['plateNumber'],
          message: 'Cần nhập biển số cho shipper',
        });
      }
    }
  });

export type VolunteerInfoInput = z.infer<typeof volunteerInfoSchema>;

type Specialization = 'shipper' | 'chef' | 'waiter';

interface SpecializationOption {
  id: Specialization;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

const SPECIALIZATIONS: SpecializationOption[] = [
  {
    id: 'shipper',
    title: 'Shipper',
    description: 'Nhận và giao thực phẩm tới điểm nhận.',
    icon: 'truck-delivery-outline',
  },
  {
    id: 'chef',
    title: 'Bếp',
    description: 'Chuẩn bị suất ăn và kiểm tra chất lượng.',
    icon: 'chef-hat',
  },
  {
    id: 'waiter',
    title: 'Phục vụ',
    description: 'Hỗ trợ phân phát tại chiến dịch.',
    icon: 'silverware-fork-knife',
  },
];

interface SignUpVolunteerScreenProps {
  onSuccess?: (data: VolunteerInfoInput) => void | Promise<void>;
  onBack?: () => void;
  isLoading?: boolean;
}

export function SignUpVolunteerScreen({
  onSuccess,
  onBack,
  isLoading = false,
}: SignUpVolunteerScreenProps) {
  const [selectedSpecs, setSelectedSpecs] = useState<Specialization[]>([]);
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<VolunteerInfoInput>({
    resolver: zodResolver(volunteerInfoSchema),
    defaultValues: {
      idCard: '',
      specializations: [],
      vehicleType: '',
      plateNumber: '',
    },
  });

  const isShipperSelected = selectedSpecs.includes('shipper');

  const handleSpecializationChange = (spec: Specialization) => {
    setSelectedSpecs((prev) => {
      const next = prev.includes(spec)
        ? prev.filter((item) => item !== spec)
        : [...prev, spec];
      setValue('specializations', next, { shouldValidate: true });
      return next;
    });
  };

  const onSubmit = async (data: VolunteerInfoInput) => {
    try {
      clearError();
      await onSuccess?.({
        ...data,
        specializations: selectedSpecs,
      });
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  return (
    <AuthScaffold
      footer={
        <View style={styles.footerActions}>
          <Button
            mode="outlined"
            onPress={onBack}
            disabled={isLoading}
            style={[authStyles.secondaryButton, styles.backFooterButton]}
            contentStyle={authStyles.buttonContent}
            labelStyle={authStyles.buttonLabel}
          >
            Quay lại
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading || selectedSpecs.length === 0}
            loading={isLoading}
            buttonColor={COLORS.primary}
            style={[authStyles.primaryButton, styles.mainFooterButton]}
            contentStyle={authStyles.buttonContent}
            labelStyle={authStyles.buttonLabel}
          >
            {isLoading ? 'Đang lưu' : 'Hoàn tất'}
          </Button>
        </View>
      }
    >
      <AuthHeader
        onBack={onBack}
        disabled={isLoading}
        title="FoodResQ"
        subtitle="Thông tin tình nguyện viên"
        right={<Text style={styles.stepText}>2/2</Text>}
      />

      <ProgressDots total={2} active={1} label="Bước 2: Hồ sơ hỗ trợ" />

      <AuthIntro
        icon="account-hard-hat-outline"
        eyebrow="Tình nguyện viên"
        title="Bạn có thể hỗ trợ ở vai trò nào?"
        description="Chọn một hoặc nhiều chuyên môn. Nếu chọn shipper, app cần thêm thông tin phương tiện."
      />

      <FadeInUp delay={80}>
        <AuthCard>
          <AuthField label="Số giấy tờ tùy thân" error={errors.idCard?.message}>
            <Controller
              control={control}
              name="idCard"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="CCCD/CMND"
                  placeholder="VD: 012345678901"
                  value={value}
                  onChangeText={onChange}
                  editable={!isLoading}
                  left={<TextInput.Icon icon="card-account-details-outline" color={COLORS.onSurfaceVariant} />}
                  style={authStyles.input}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.idCard}
                  dense
                />
              )}
            />
          </AuthField>

          <AuthField
            label="Chuyên môn hỗ trợ"
            error={Array.isArray(errors.specializations) ? undefined : errors.specializations?.message}
          >
            <View style={styles.specList}>
              {SPECIALIZATIONS.map((spec) => {
                const isSelected = selectedSpecs.includes(spec.id);
                return (
                  <Pressable
                    key={spec.id}
                    onPress={() => handleSpecializationChange(spec.id)}
                    disabled={isLoading}
                    style={({ pressed }) => [
                      styles.specCard,
                      isSelected && styles.specCardSelected,
                      pressed && authStyles.pressed,
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${spec.title}. ${spec.description}`}
                    accessibilityState={{ checked: isSelected, disabled: isLoading }}
                  >
                    <Checkbox
                      status={isSelected ? 'checked' : 'unchecked'}
                      disabled={isLoading}
                      color={COLORS.primary}
                    />
                    <View style={styles.specCopy}>
                      <Text style={[styles.specTitle, isSelected && styles.specTitleSelected]}>
                        {spec.title}
                      </Text>
                      <Text style={styles.specDescription}>{spec.description}</Text>
                    </View>
                    <MaterialCommunityIcons
                      name={spec.icon}
                      size={23}
                      color={isSelected ? COLORS.primary : COLORS.onSurfaceVariant}
                    />
                  </Pressable>
                );
              })}
            </View>
          </AuthField>

          {isShipperSelected ? (
            <View style={styles.shipperBox}>
              <Text style={styles.shipperTitle}>Thông tin phương tiện</Text>
              <AuthField label="Loại phương tiện" error={errors.vehicleType?.message}>
                <Controller
                  control={control}
                  name="vehicleType"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      mode="outlined"
                      label="Xe máy, xe đạp, ô tô..."
                      value={value}
                      onChangeText={onChange}
                      editable={!isLoading}
                      left={<TextInput.Icon icon="motorbike" color={COLORS.onSurfaceVariant} />}
                      style={authStyles.input}
                      outlineColor={COLORS.outline}
                      activeOutlineColor={COLORS.primary}
                      error={!!errors.vehicleType}
                      dense
                    />
                  )}
                />
              </AuthField>

              <AuthField label="Biển số xe" error={errors.plateNumber?.message}>
                <Controller
                  control={control}
                  name="plateNumber"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      mode="outlined"
                      label="VD: 59A1 12345"
                      value={value}
                      onChangeText={onChange}
                      editable={!isLoading}
                      left={<TextInput.Icon icon="identifier" color={COLORS.onSurfaceVariant} />}
                      style={authStyles.input}
                      outlineColor={COLORS.outline}
                      activeOutlineColor={COLORS.primary}
                      error={!!errors.plateNumber}
                      dense
                    />
                  )}
                />
              </AuthField>
            </View>
          ) : null}
        </AuthCard>
      </FadeInUp>

      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={3000}
      />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  stepText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
  },
  specList: {
    gap: spacing.sm,
  },
  specCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceContainerLow,
    paddingRight: spacing.md,
  },
  specCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
  },
  specCopy: {
    flex: 1,
    minWidth: 0,
  },
  specTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  specTitleSelected: {
    color: COLORS.primary,
  },
  specDescription: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.onSurfaceVariant,
  },
  shipperBox: {
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    backgroundColor: COLORS.surfaceContainerLow,
    padding: spacing.md,
    gap: spacing.md,
  },
  shipperTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.onSurface,
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
});

export default SignUpVolunteerScreen;
