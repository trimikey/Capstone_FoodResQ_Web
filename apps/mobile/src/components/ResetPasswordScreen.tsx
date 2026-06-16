import React, { useState } from 'react';
import {
  View,
  Pressable,
  Image,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TextInput,
  Button,
  Text,
} from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, ResetPasswordInput } from '../utils/validators';
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
  success: '#10b981',
};

interface ResetPasswordScreenProps {
  email: string;
  otp: string;
  onSuccess?: () => void;
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
  const insets = useSafeAreaInsets();
  const [showPassword, setShowPassword] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
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

  const getPasswordStrength = (pwd: string): 'weak' | 'medium' | 'strong' => {
    if (!pwd) return 'weak';
    const hasUppercase = /[A-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const isLongEnough = pwd.length >= 8;
    if (hasUppercase && hasNumber && isLongEnough) return 'strong';
    if ((hasUppercase || hasNumber) && pwd.length >= 6) return 'medium';
    return 'weak';
  };

  const getStrengthColor = (strength: string) => {
    switch (strength) {
      case 'strong':
        return COLORS.success;
      case 'medium':
        return '#f59e0b';
      default:
        return COLORS.error;
    }
  };

  const strength = getPasswordStrength(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const onSubmit = async (data: ResetPasswordInput) => {
    try {
      clearError();
      setShowSuccessModal(true);
      setTimeout(() => onSuccess?.(), 3000);
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
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
          paddingTop: 12,
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
            Reset Password
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: COLORS.onSurfaceVariant,
              lineHeight: 20,
            }}
          >
            Create a new password for your account. Make sure it's strong and unique.
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
            New Password
          </Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <TextInput
                mode="outlined"
                label="Enter new password"
                placeholder="••••••••"
                value={value}
                onChangeText={onChange}
                secureTextEntry={!showPassword}
                editable={!isLoading}
                left={
                  <TextInput.Icon icon="lock" color={COLORS.outlineVariant} />
                }
                right={
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off' : 'eye'}
                    onPress={() => setShowPassword(!showPassword)}
                    color={COLORS.outlineVariant}
                  />
                }
                style={{
                  backgroundColor: COLORS.surfaceContainerLow,
                }}
                outlineColor={COLORS.outline}
                activeOutlineColor={COLORS.primary}
                error={!!errors.password}
              />
            )}
          />
          {errors.password && (
            <Text
              style={{
                fontSize: 12,
                color: COLORS.error,
                marginTop: 4,
              }}
            >
              {errors.password.message}
            </Text>
          )}

          {password && (
            <View style={{ marginTop: 12 }}>
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: getStrengthColor(strength),
                  marginBottom: 8,
                }}
              />
              <Text
                style={{
                  fontSize: 12,
                  color: getStrengthColor(strength),
                  fontWeight: '600',
                }}
              >
                {strength === 'strong'
                  ? '✓ Strong password'
                  : strength === 'medium'
                  ? '○ Medium strength'
                  : '✗ Weak password'}
              </Text>
              <RequirementItem text="At least 6 characters" met={password.length >= 6} />
              <RequirementItem text="Uppercase letter (A-Z)" met={/[A-Z]/.test(password)} />
              <RequirementItem text="Number (0-9)" met={/[0-9]/.test(password)} />
            </View>
          )}
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
            Confirm Password
          </Text>
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, value } }) => (
              <TextInput
                mode="outlined"
                label="Confirm password"
                placeholder="••••••••"
                value={value}
                onChangeText={onChange}
                secureTextEntry={!showPassword}
                editable={!isLoading}
                left={
                  <TextInput.Icon icon="lock-reset" color={COLORS.outlineVariant} />
                }
                style={{
                  backgroundColor: COLORS.surfaceContainerLow,
                }}
                outlineColor={value && passwordsMatch ? COLORS.success : COLORS.outline}
                activeOutlineColor={value && passwordsMatch ? COLORS.success : COLORS.primary}
                error={!!errors.confirmPassword}
              />
            )}
          />
          {errors.confirmPassword && (
            <Text
              style={{
                fontSize: 12,
                color: COLORS.error,
                marginTop: 4,
              }}
            >
              {errors.confirmPassword.message}
            </Text>
          )}
          {confirmPassword && passwordsMatch && (
            <Text
              style={{
                fontSize: 12,
                color: COLORS.success,
                marginTop: 4,
                fontWeight: '600',
              }}
            >
              ✓ Passwords match
            </Text>
          )}
        </View>
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
          disabled={isLoading || !passwordsMatch}
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
          {isLoading ? 'Resetting...' : 'Reset Password'}
        </Button>
      </View>

      <Modal visible={showSuccessModal} transparent animationType="slide" onRequestClose={() => setShowSuccessModal(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Math.max(24, insets.bottom),
              gap: 16,
            }}
          >
            <View
              style={{
                width: 48,
                height: 4,
                borderRadius: 2,
                backgroundColor: COLORS.outlineVariant,
                alignSelf: 'center',
                marginBottom: 8,
              }}
            />
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: `${COLORS.primaryContainer}20`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 32 }}>✓</Text>
              </View>
            </View>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: '600',
                  color: COLORS.onSurface,
                  textAlign: 'center',
                }}
              >
                Password Reset!
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: COLORS.onSurfaceVariant,
                  textAlign: 'center',
                  lineHeight: 20,
                }}
              >
                Your password has been successfully reset. You can now sign in with your new password.
              </Text>
            </View>
            <Button
              mode="outlined"
              onPress={() => {
                setShowSuccessModal(false);
                onSuccess?.();
              }}
              style={{
                borderRadius: 16,
                marginTop: 8,
              }}
              labelStyle={{
                fontSize: 14,
                fontWeight: '600',
              }}
            >
              Back to Sign In
            </Button>
          </View>
        </View>
      </Modal>

      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={3000}
      />
    </View>
  );
}

function RequirementItem({ text, met }: { text: string; met: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <Text
        style={{
          fontSize: 16,
          color: met ? COLORS.success : COLORS.error,
        }}
      >
        {met ? '✓' : '✗'}
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: met ? COLORS.success : COLORS.onSurfaceVariant,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

export default ResetPasswordScreen;
