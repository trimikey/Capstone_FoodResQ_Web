import React, { useState, useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  View,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TextInput,
  Button,
  Text,
} from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { otpVerificationSchema, OtpVerificationInput } from '../utils/validators';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import ErrorToast from './ErrorToast';

const COLORS = {
  primary: '#006c49',
  primaryContainer: '#10b981',
  background: '#f8f9ff',
  surface: '#ffffff',
  surfaceContainerLow: '#f3f4f6',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  error: '#ba1a1a',
  outline: '#6c7a71',
  outlineVariant: '#bbcabf',
};

interface OtpVerificationScreenProps {
  email: string;
  type?: 'forgot_password' | 'signup_email';
  onSuccess?: (otp: string) => void;
  onBack?: () => void;
  onResend?: () => void;
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
  const insets = useSafeAreaInsets();
  const [timeLeft, setTimeLeft] = useState(RESEND_COOLDOWN);
  const [canResend, setCanResend] = useState(false);
  const { error, isVisible, showError, clearError } = useErrorHandler();

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
    let timer: ReturnType<typeof setInterval>;
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
    return () => clearInterval(timer);
  }, [timeLeft, canResend]);

  const handleResend = async () => {
    if (canResend) {
      try {
        clearError();
        setTimeLeft(RESEND_COOLDOWN);
        setCanResend(false);
        await onResend?.();
      } catch (error) {
        showError(getErrorMessage(error), 3000);
      }
    }
  };

  const onSubmit = (data: OtpVerificationInput) => {
    try {
      clearError();
      onSuccess?.(data.otp);
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  const otp = watch('otp');

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={{
          height: 64,
          paddingHorizontal: 20,
          backgroundColor: COLORS.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Pressable
          onPress={onBack}
          disabled={isLoading}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            padding: 8,
            marginLeft: -8,
          })}
        >
          <Text style={{ fontSize: 24, color: COLORS.primary }}>←</Text>
        </Pressable>
        <Text
          style={{
            fontSize: 20,
            fontWeight: '700',
            color: COLORS.primary,
          }}
        >
          FoodResQ
        </Text>
      </View>

      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 8,
        }}
      >
        <View style={{ marginBottom: 12 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '700',
              color: COLORS.onSurface,
              marginBottom: 8,
            }}
          >
            Verify Email
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: COLORS.onSurfaceVariant,
              lineHeight: 20,
            }}
          >
            We sent a 6-digit code to{' '}
            <Text style={{ fontWeight: '700', color: COLORS.onSurface }}>
              {email}
            </Text>
            . Please enter it below.
          </Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: COLORS.onSurface,
              marginBottom: 8,
            }}
          >
            Verification Code
          </Text>
          <Controller
            control={control}
            name="otp"
            render={({ field: { onChange, value } }) => (
              <TextInput
                mode="outlined"
                label="000000"
                placeholder="Enter 6-digit code"
                value={value}
                onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                maxLength={6}
                editable={!isLoading}
                style={{
                  backgroundColor: COLORS.surfaceContainerLow,
                  fontSize: 24,
                  letterSpacing: 4,
                  textAlign: 'center',
                }}
                outlineColor={COLORS.outline}
                activeOutlineColor={COLORS.primary}
                error={!!errors.otp}
              />
            )}
          />
          {errors.otp && (
            <Text
              style={{
                fontSize: 12,
                color: COLORS.error,
                marginTop: 4,
              }}
            >
              {errors.otp.message}
            </Text>
          )}
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text
            style={{
              fontSize: 14,
              color: COLORS.onSurfaceVariant,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            Didn't receive the code?
          </Text>
          <Pressable
            onPress={handleResend}
            disabled={!canResend || isLoading}
            style={({ pressed }) => ({
              opacity: canResend ? (pressed ? 0.7 : 1) : 0.5,
            })}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: canResend ? COLORS.primary : COLORS.outlineVariant,
                textAlign: 'center',
              }}
            >
              {canResend ? 'Resend Code' : `Resend in ${timeLeft}s`}
            </Text>
          </Pressable>
        </View>

        <View style={{ flex: 1 }} />
      </View>

      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          paddingTop: 16,
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderTopColor: COLORS.outline,
        }}
      >
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          disabled={isLoading || !otp || otp.length < 6}
          loading={isLoading}
          style={{
            backgroundColor: COLORS.primaryContainer,
            borderRadius: 16,
            paddingVertical: 8,
          }}
          labelStyle={{
            fontSize: 14,
            fontWeight: '600',
          }}
        >
          {isLoading ? 'Verifying...' : 'Verify Code'}
        </Button>
      </View>

      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={3000}
      />
    </KeyboardAvoidingView>
  );
}

export default OtpVerificationScreen;
