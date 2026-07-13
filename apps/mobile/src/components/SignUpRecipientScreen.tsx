import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
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

type RecipientType = 'individual' | 'charity';

const signUpRecipientSchema = z.object({
  recipientType: z.enum(['individual', 'charity']),
  idNumber: z.string().optional(),
  organizationName: z.string().optional(),
  taxId: z.string().optional(),
  address: z.string().min(10, 'Địa chỉ cần tối thiểu 10 ký tự'),
}).superRefine((data, ctx) => {
  if (data.recipientType === 'individual' && !data.idNumber?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['idNumber'],
      message: 'Cần nhập số giấy tờ tùy thân',
    });
  }
  if (data.recipientType === 'charity') {
    if (!data.organizationName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationName'],
        message: 'Cần nhập tên tổ chức',
      });
    }
    if (!data.taxId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['taxId'],
        message: 'Cần nhập mã số thuế',
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
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<SignUpRecipientInput>({
    resolver: zodResolver(signUpRecipientSchema),
    defaultValues: {
      recipientType: initialRecipientType,
      idNumber: '',
      organizationName: '',
      taxId: '',
      address: '',
    },
  });

  const handleRecipientTypeChange = (value: RecipientType) => {
    setRecipientType(value);
    setValue('recipientType', value, { shouldValidate: true });
  };

  const onSubmit = async (data: SignUpRecipientInput) => {
    try {
      clearError();
      await onSuccess?.(data);
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
            disabled={isLoading}
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
        subtitle="Thông tin người nhận"
        right={<Text style={styles.stepText}>2/2</Text>}
      />

      <ProgressDots total={2} active={1} label="Bước 2: Hồ sơ nhận thực phẩm" />

      <AuthIntro
        icon="account-heart-outline"
        eyebrow="Người nhận"
        title={recipientType === 'charity' ? 'Thông tin tổ chức' : 'Thông tin cá nhân'}
        description="FoodResQ dùng thông tin này để xác minh hồ sơ và gợi ý điểm chia sẻ thực phẩm phù hợp."
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

          {recipientType === 'individual' ? (
            <AuthField label="Số giấy tờ tùy thân" error={errors.idNumber?.message}>
              <Controller
                control={control}
                name="idNumber"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    mode="outlined"
                    label="CCCD/CMND hoặc giấy tờ tương đương"
                    placeholder="VD: 012345678901"
                    value={value}
                    onChangeText={onChange}
                    editable={!isLoading}
                    left={<TextInput.Icon icon="card-account-details-outline" color={COLORS.onSurfaceVariant} />}
                    style={authStyles.input}
                    outlineColor={COLORS.outline}
                    activeOutlineColor={COLORS.primary}
                    error={!!errors.idNumber}
                    dense
                  />
                )}
              />
            </AuthField>
          ) : (
            <>
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

              <AuthField label="Mã số thuế / mã đăng ký" error={errors.taxId?.message}>
                <Controller
                  control={control}
                  name="taxId"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      mode="outlined"
                      label="Mã số thuế hoặc giấy phép"
                      placeholder="VD: 0312345678"
                      value={value}
                      onChangeText={onChange}
                      editable={!isLoading}
                      left={<TextInput.Icon icon="file-document-outline" color={COLORS.onSurfaceVariant} />}
                      style={authStyles.input}
                      outlineColor={COLORS.outline}
                      activeOutlineColor={COLORS.primary}
                      error={!!errors.taxId}
                      dense
                    />
                  )}
                />
              </AuthField>
            </>
          )}

          <AuthField
            label="Địa chỉ nhận hỗ trợ"
            helper="Dùng để gợi ý các tin thực phẩm gần bạn hơn."
            error={errors.address?.message}
          >
            <Controller
              control={control}
              name="address"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Địa chỉ"
                  placeholder="Số nhà, đường, phường/xã, quận/huyện"
                  value={value}
                  onChangeText={onChange}
                  editable={!isLoading}
                  multiline
                  numberOfLines={3}
                  left={<TextInput.Icon icon="map-marker-outline" color={COLORS.onSurfaceVariant} />}
                  style={[authStyles.input, authStyles.multilineInput]}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.address}
                />
              )}
            />
          </AuthField>
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

export default SignUpRecipientScreen;
