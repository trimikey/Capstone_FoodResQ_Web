import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, ForgotPasswordInput } from '../utils/validators';
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
import { mobileColors as COLORS, spacing } from '@/theme/design';

interface ForgotPasswordScreenProps {
  onSuccess?: (email: string) => void | Promise<void>;
  onBack?: () => void;
  onNavigateToSignIn?: () => void;
  isLoading?: boolean;
}

export function ForgotPasswordScreen({
  onSuccess,
  onBack,
  onNavigateToSignIn,
  isLoading = false,
}: ForgotPasswordScreenProps) {
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    try {
      clearError();
      await onSuccess?.(data.email);
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  return (
    <AuthScaffold scrollMode="keyboard">
      <AuthHeader
        onBack={onBack}
        disabled={isLoading}
        title="FoodResQ"
        subtitle="Khôi phục tài khoản"
      />

      <AuthIntro
        icon="lock-question"
        eyebrow="Quên mật khẩu"
        title="Nhận mã xác thực qua email"
        description="Nhập email đã đăng ký. FoodResQ sẽ gửi mã OTP để bạn đặt lại mật khẩu an toàn."
      />

      <FadeInUp delay={80}>
        <AuthCard>
          <AuthField label="Email của bạn" error={errors.email?.message}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Địa chỉ email"
                  placeholder="user@example.com"
                  value={value}
                  onChangeText={onChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!isLoading}
                  left={<TextInput.Icon icon="email-outline" color={COLORS.onSurfaceVariant} />}
                  style={authStyles.input}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.email}
                  dense
                />
              )}
            />
          </AuthField>

          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
            loading={isLoading}
            buttonColor={COLORS.primary}
            style={authStyles.primaryButton}
            contentStyle={authStyles.buttonContent}
            labelStyle={authStyles.buttonLabel}
            accessibilityLabel="Gửi mã OTP đặt lại mật khẩu"
            accessibilityState={{ disabled: isLoading }}
          >
            {isLoading ? 'Đang gửi mã' : 'Gửi mã OTP'}
          </Button>
        </AuthCard>
      </FadeInUp>

      <View style={styles.signInRow}>
        <Text style={styles.signInText}>Đã nhớ mật khẩu?</Text>
        <Pressable
          onPress={onNavigateToSignIn}
          disabled={isLoading}
          hitSlop={8}
          style={({ pressed }) => [pressed && authStyles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Quay lại đăng nhập"
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

export default ForgotPasswordScreen;
