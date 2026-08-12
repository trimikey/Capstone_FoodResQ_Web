import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Text, TextInput } from 'react-native-paper';
import apiClient from '../api/client';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUpBasicInfoSchema, SignUpBasicInfoInput } from '../utils/validators';
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

interface SignUpBasicScreenProps {
  onSuccess?: (data: SignUpBasicInfoInput) => void | Promise<void>;
  onBack?: () => void;
  onNavigateToSignIn?: () => void;
  isLoading?: boolean;
}

export function SignUpBasicScreen({
  onSuccess,
  onBack,
  onNavigateToSignIn,
  isLoading = false,
}: SignUpBasicScreenProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<SignUpBasicInfoInput>({
    resolver: zodResolver(signUpBasicInfoSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const handleEmailBlur = async (value: string) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return;
    setIsCheckingEmail(true);
    try {
      const { data } = await apiClient.post('/auth/check-email', { email: value });
      if (data?.data?.exists || data?.exists) {
        setError('email', { type: 'manual', message: 'Email này đã được đăng ký. Vui lòng dùng email khác.' });
      }
    } catch {
      // silent — backend sẽ báo lỗi lại lúc submit nếu cần
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handlePhoneBlur = async (value: string) => {
    if (!/^0[35789][0-9]{8}$/.test(value)) return;
    setIsCheckingPhone(true);
    try {
      const { data } = await apiClient.post('/auth/check-phone', { phone: value });
      if (data?.data?.exists || data?.exists) {
        setError('phone', { type: 'manual', message: 'Số điện thoại này đã được đăng ký. Vui lòng dùng số khác.' });
      }
    } catch {
      // silent
    } finally {
      setIsCheckingPhone(false);
    }
  };

  const onSubmit = async (data: SignUpBasicInfoInput) => {
    try {
      clearError();
      if (!agreedToTerms) {
        showError('Bạn cần đồng ý điều khoản trước khi đăng ký.', 2000);
        return;
      }
      await onSuccess?.(data);
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
          disabled={isLoading || !agreedToTerms}
          loading={isLoading}
          buttonColor={COLORS.primary}
          style={authStyles.primaryButton}
          contentStyle={authStyles.buttonContent}
          labelStyle={authStyles.buttonLabel}
          accessibilityLabel="Tiếp tục đăng ký"
          accessibilityState={{ disabled: isLoading || !agreedToTerms }}
        >
          {isLoading ? 'Đang xử lý' : 'Tiếp tục'}
        </Button>
      }
    >
      <AuthHeader
        onBack={onBack}
        disabled={isLoading}
        title="FoodResQ"
        subtitle="Tạo tài khoản"
      />

      <ProgressDots total={2} active={0} label="Bước 1: Thông tin đăng nhập" />

      <AuthIntro
        icon="account-plus-outline"
        eyebrow="Đăng ký"
        title="Tạo tài khoản FoodResQ"
        description="Thông tin này dùng để đăng nhập và nhận thông báo trong các luồng nhận, chia sẻ hoặc hỗ trợ thực phẩm."
      />

      <FadeInUp delay={80}>
        <AuthCard>
          <AuthField label="Họ và tên" error={errors.name?.message}>
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Họ và tên"
                  placeholder="Nhập tên của bạn"
                  value={value}
                  onChangeText={onChange}
                  autoComplete="name"
                  textContentType="name"
                  editable={!isLoading}
                  left={<TextInput.Icon icon="account-outline" color={COLORS.onSurfaceVariant} />}
                  style={authStyles.input}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.name}
                  dense
                />
              )}
            />
          </AuthField>

          <AuthField label="Số điện thoại" error={errors.phone?.message}>
            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Số điện thoại"
                  placeholder="0912345678"
                  value={value}
                  onChangeText={(v) => {
                    onChange(v);
                    if (errors.phone?.type === 'manual') clearErrors('phone');
                  }}
                  onBlur={() => { onBlur(); handlePhoneBlur(value); }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  editable={!isLoading}
                  left={<TextInput.Icon icon="phone-outline" color={COLORS.onSurfaceVariant} />}
                  right={isCheckingPhone
                    ? <TextInput.Icon icon={({ size, color }) => <ActivityIndicator size={size - 6} color={color} />} />
                    : undefined}
                  style={authStyles.input}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.phone}
                  dense
                />
              )}
            />
          </AuthField>

          <AuthField label="Email" error={errors.email?.message}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Địa chỉ email"
                  placeholder="user@example.com"
                  value={value}
                  onChangeText={(v) => {
                    onChange(v);
                    if (errors.email?.type === 'manual') clearErrors('email');
                  }}
                  onBlur={() => { onBlur(); handleEmailBlur(value); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!isLoading}
                  left={<TextInput.Icon icon="email-outline" color={COLORS.onSurfaceVariant} />}
                  right={isCheckingEmail
                    ? <TextInput.Icon icon={({ size, color }) => <ActivityIndicator size={size - 6} color={color} />} />
                    : undefined}
                  style={authStyles.input}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.email}
                  dense
                />
              )}
            />
          </AuthField>

          <AuthField label="Mật khẩu" error={errors.password?.message}>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Mật khẩu"
                  placeholder="Tối thiểu 6 ký tự"
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

          <AuthField label="Xác nhận mật khẩu" error={errors.confirmPassword?.message}>
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Nhập lại mật khẩu"
                  placeholder="Nhập lại mật khẩu"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!isLoading}
                  left={<TextInput.Icon icon="lock-check-outline" color={COLORS.onSurfaceVariant} />}
                  style={authStyles.input}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.confirmPassword}
                  dense
                />
              )}
            />
          </AuthField>

          <Pressable
            onPress={() => setAgreedToTerms((current) => !current)}
            disabled={isLoading}
            style={({ pressed }) => [styles.termsBox, pressed && authStyles.pressed]}
            accessibilityRole="checkbox"
            accessibilityLabel="Đồng ý điều khoản sử dụng và chính sách bảo mật"
            accessibilityState={{ checked: agreedToTerms, disabled: isLoading }}
          >
            <Checkbox
              status={agreedToTerms ? 'checked' : 'unchecked'}
              disabled={isLoading}
              color={COLORS.primary}
            />
            <Text style={styles.termsText}>
              Tôi đồng ý với <Text style={styles.termsLink}>Điều khoản sử dụng</Text> và{' '}
              <Text style={styles.termsLink}>Chính sách bảo mật</Text> của FoodResQ.
            </Text>
          </Pressable>
        </AuthCard>
      </FadeInUp>

      <View style={styles.signInRow}>
        <Text style={styles.signInText}>Đã có tài khoản?</Text>
        <Pressable
          onPress={onNavigateToSignIn}
          disabled={isLoading}
          hitSlop={8}
          style={({ pressed }) => [pressed && authStyles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Đăng nhập"
        >
          <Text style={authStyles.textButtonLabel}>Đăng nhập</Text>
        </Pressable>
      </View>

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
  termsBox: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: COLORS.surfaceContainerLow,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
  },
  termsText: {
    flex: 1,
    paddingTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.onSurfaceVariant,
  },
  termsLink: {
    color: COLORS.primary,
    fontWeight: '900',
  },
  signInRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  signInText: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
  },
});

export default SignUpBasicScreen;
