import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { otpVerificationSchema, OtpVerificationInput } from '../utils/validators';
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

interface OtpVerificationScreenProps {
  email: string;
  type?: 'forgot_password' | 'signup_email';
  onSuccess?: (otp: string) => void | Promise<void>;
  onBack?: () => void;
  onResend?: () => void | Promise<void>;
  isLoading?: boolean;
}

const RESEND_COOLDOWN = 60;

export function OtpVerificationScreen({
  email,
  type = 'signup_email',
  onSuccess,
  onBack,
  onResend,
  isLoading = false,
}: OtpVerificationScreenProps) {
  const [timeLeft, setTimeLeft] = useState(RESEND_COOLDOWN);
  const [canResend, setCanResend] = useState(false);
  const { error, isVisible, showError, clearError } = useErrorHandler();
  const isPasswordReset = type === 'forgot_password';

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<OtpVerificationInput>({
    resolver: zodResolver(otpVerificationSchema),
    defaultValues: {
      otp: '',
      email,
    },
  });

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (!canResend && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev - 1 <= 0) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [timeLeft, canResend]);

  const handleResend = async () => {
    if (!canResend) return;
    try {
      clearError();
      setTimeLeft(RESEND_COOLDOWN);
      setCanResend(false);
      await onResend?.();
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  const onSubmit = async (data: OtpVerificationInput) => {
    try {
      clearError();
      await onSuccess?.(data.otp);
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  const otp = watch('otp');
  const canSubmit = (isPasswordReset ? otp.length >= 16 : otp.length === 6) && !isLoading;

  return (
    <AuthScaffold
      scrollMode="keyboard"
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
          accessibilityLabel={isPasswordReset ? 'Xác nhận mã đặt lại mật khẩu' : 'Xác nhận mã OTP'}
          accessibilityState={{ disabled: !canSubmit }}
        >
          {isLoading ? 'Đang xác thực' : isPasswordReset ? 'Tiếp tục' : 'Xác nhận mã'}
        </Button>
      }
    >
      <AuthHeader
        onBack={onBack}
        disabled={isLoading}
        title="FoodResQ"
        subtitle={isPasswordReset ? 'Đặt lại mật khẩu' : 'Xác thực email'}
      />

      <AuthIntro
        icon="shield-key-outline"
        eyebrow={isPasswordReset ? 'Mã email' : 'Mã OTP'}
        title={isPasswordReset ? 'Nhập mã trong email' : 'Xác thực email của bạn'}
        description={
          <>
            Chúng tôi đã gửi {isPasswordReset ? 'mã đặt lại mật khẩu' : 'mã 6 chữ số'} tới{' '}
            <Text style={styles.emailText}>{email}</Text>.
          </>
        }
      />

      <FadeInUp delay={80}>
        <AuthCard>
          <AuthField
            label="Mã xác thực"
            error={errors.otp?.message}
            helper={isPasswordReset ? 'Dán mã đặt lại mật khẩu trong email FoodResQ.' : 'Mã gồm 6 chữ số, thường có hiệu lực trong vài phút.'}
          >
            <Controller
              control={control}
              name="otp"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label={isPasswordReset ? 'Mã trong email' : '000000'}
                  placeholder={isPasswordReset ? 'Dán mã đặt lại mật khẩu' : 'Nhập 6 chữ số'}
                  value={value}
                  onChangeText={(text) =>
                    onChange(
                      isPasswordReset
                        ? text.replace(/\s/g, '').slice(0, 128)
                        : text.replace(/[^0-9]/g, '').slice(0, 6),
                    )
                  }
                  keyboardType={isPasswordReset ? 'default' : 'numeric'}
                  autoCapitalize="none"
                  maxLength={isPasswordReset ? 128 : 6}
                  editable={!isLoading}
                  style={[authStyles.input, styles.otpInput]}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.otp}
                  accessibilityLabel={isPasswordReset ? 'Mã đặt lại mật khẩu trong email' : 'Mã OTP gồm 6 chữ số'}
                />
              )}
            />
          </AuthField>

          <View style={styles.resendBox}>
            <Text style={styles.resendHint}>Chưa nhận được mã?</Text>
            <Pressable
              onPress={handleResend}
              disabled={!canResend || isLoading}
              hitSlop={8}
              style={({ pressed }) => [
                styles.resendButton,
                pressed && authStyles.pressed,
                (!canResend || isLoading) && authStyles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={canResend ? 'Gửi lại mã' : `Gửi lại mã sau ${timeLeft} giây`}
              accessibilityState={{ disabled: !canResend || isLoading }}
            >
              <Text style={styles.resendText}>
                {canResend ? 'Gửi lại mã' : `Gửi lại sau ${timeLeft}s`}
              </Text>
            </Pressable>
          </View>
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
  emailText: {
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  otpInput: {
    fontSize: 24,
    textAlign: 'center',
  },
  resendBox: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: COLORS.surfaceContainerLow,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  resendHint: {
    flex: 1,
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
  },
  resendButton: {
    minHeight: 36,
    justifyContent: 'center',
  },
  resendText: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.primary,
  },
});

export default OtpVerificationScreen;
