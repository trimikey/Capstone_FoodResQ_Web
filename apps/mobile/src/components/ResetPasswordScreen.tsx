import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, ResetPasswordInput } from '../utils/validators';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import ErrorToast from './ErrorToast';
import { FadeInUp } from './ui/Motion';
import {
  AuthCard,
  AuthField,
  AuthHeader,
  AuthIntro,
  AuthScaffold,
  authStyles,
} from './auth/AuthLayout';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

interface ResetPasswordScreenProps {
  email: string;
  otp: string;
  onSuccess?: (newPassword: string) => void | Promise<void>;
  onBack?: () => void;
  isLoading?: boolean;
}

export function ResetPasswordScreen({
  email,
  otp,
  onSuccess,
  onBack,
  isLoading = false,
}: ResetPasswordScreenProps) {
  const [showPassword, setShowPassword] = useState(false);
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const password = watch('password');
  const confirmPassword = watch('confirmPassword');

  const strength = getPasswordStrength(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const canSubmit = passwordsMatch && !isLoading;

  const onSubmit = async (data: ResetPasswordInput) => {
    try {
      clearError();
      await onSuccess?.(data.password);
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  return (
    <AuthScaffold
      footer={
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          disabled={!canSubmit}
          loading={isLoading}
          buttonColor={COLORS.primary}
          style={authStyles.primaryButton}
          contentStyle={authStyles.buttonContent}
          labelStyle={authStyles.buttonLabel}
          accessibilityLabel="Lưu mật khẩu mới"
          accessibilityState={{ disabled: !canSubmit }}
        >
          {isLoading ? 'Đang cập nhật' : 'Lưu mật khẩu mới'}
        </Button>
      }
    >
      <AuthHeader
        onBack={onBack}
        disabled={isLoading}
        title="FoodResQ"
        subtitle="Bảo mật tài khoản"
      />

      <AuthIntro
        icon="lock-reset"
        eyebrow="Mật khẩu mới"
        title="Tạo mật khẩu an toàn"
        description={
          <>
            Tài khoản <Text style={styles.emailText}>{email}</Text> đã được xác thực bằng mã OTP.
          </>
        }
      />

      <FadeInUp delay={80}>
        <AuthCard>
          <AuthField label="Mật khẩu mới" error={errors.password?.message}>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Mật khẩu mới"
                  placeholder="Nhập mật khẩu mới"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!isLoading}
                  left={<TextInput.Icon icon="lock-outline" color={COLORS.onSurfaceVariant} />}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      onPress={() => setShowPassword((current) => !current)}
                      color={COLORS.onSurfaceVariant}
                      forceTextInputFocus={false}
                    />
                  }
                  style={authStyles.input}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.password}
                  dense
                />
              )}
            />
          </AuthField>

          {password ? <PasswordStrength password={password} strength={strength} /> : null}

          <AuthField label="Xác nhận mật khẩu" error={errors.confirmPassword?.message}>
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Nhập lại mật khẩu"
                  placeholder="Nhập lại mật khẩu mới"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!isLoading}
                  left={<TextInput.Icon icon="lock-check-outline" color={COLORS.onSurfaceVariant} />}
                  style={authStyles.input}
                  outlineColor={value && passwordsMatch ? COLORS.success : COLORS.outline}
                  activeOutlineColor={value && passwordsMatch ? COLORS.success : COLORS.primary}
                  error={!!errors.confirmPassword}
                  dense
                />
              )}
            />
            {confirmPassword && passwordsMatch ? (
              <Text style={styles.matchText}>Mật khẩu xác nhận khớp.</Text>
            ) : null}
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

function getPasswordStrength(pwd: string): 'weak' | 'medium' | 'strong' {
  if (!pwd) return 'weak';
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const isLongEnough = pwd.length >= 8;
  if (hasUppercase && hasNumber && isLongEnough) return 'strong';
  if ((hasUppercase || hasNumber) && pwd.length >= 6) return 'medium';
  return 'weak';
}

function getStrengthColor(strength: 'weak' | 'medium' | 'strong') {
  if (strength === 'strong') return COLORS.success;
  if (strength === 'medium') return COLORS.warning;
  return COLORS.error;
}

function PasswordStrength({
  password,
  strength,
}: {
  password: string;
  strength: 'weak' | 'medium' | 'strong';
}) {
  const color = getStrengthColor(strength);
  const label =
    strength === 'strong' ? 'Mạnh' : strength === 'medium' ? 'Trung bình' : 'Yếu';

  return (
    <View style={styles.strengthBox}>
      <View style={styles.strengthHeader}>
        <Text style={[styles.strengthLabel, { color }]}>Độ mạnh: {label}</Text>
        <View style={styles.strengthBars}>
          {[0, 1, 2].map((index) => {
            const active =
              strength === 'strong' || (strength === 'medium' && index < 2) || index === 0;
            return (
              <View
                key={index}
                style={[styles.strengthBar, { backgroundColor: active ? color : COLORS.muted }]}
              />
            );
          })}
        </View>
      </View>
      <RequirementItem text="Tối thiểu 6 ký tự" met={password.length >= 6} />
      <RequirementItem text="Có chữ hoa A-Z" met={/[A-Z]/.test(password)} />
      <RequirementItem text="Có ít nhất một số" met={/[0-9]/.test(password)} />
    </View>
  );
}

function RequirementItem({ text, met }: { text: string; met: boolean }) {
  return (
    <View style={styles.requirementItem}>
      <MaterialCommunityIcons
        name={met ? 'check-circle' : 'circle-outline'}
        size={17}
        color={met ? COLORS.success : COLORS.onSurfaceVariant}
      />
      <Text style={[styles.requirementText, met && styles.requirementTextMet]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emailText: {
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  strengthBox: {
    borderRadius: radius.md,
    backgroundColor: COLORS.surfaceContainerLow,
    padding: spacing.md,
    gap: spacing.sm,
  },
  strengthHeader: {
    gap: spacing.sm,
  },
  strengthLabel: {
    fontSize: 13,
    fontWeight: '900',
  },
  strengthBars: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  strengthBar: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requirementText: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  requirementTextMet: {
    color: COLORS.success,
    fontWeight: '700',
  },
  matchText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: COLORS.success,
  },
});

export default ResetPasswordScreen;
