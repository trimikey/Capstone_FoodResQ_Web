import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Pressable,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TextInput,
  Button,
  Text,
  Checkbox,
  ActivityIndicator,
} from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUpBasicInfoSchema, SignUpBasicInfoInput } from '../utils/validators';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import ErrorToast from './ErrorToast';

const COLORS = {
  primary: '#006c49',
  primaryContainer: '#10b981',
  secondary: '#855300',
  secondaryContainer: '#ffddb8',
  background: '#f8f9ff',
  surface: '#ffffff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#eff4ff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  error: '#ba1a1a',
  outline: '#F3F4F6',
  outlineVariant: '#bbcabf',
};

interface SignUpBasicScreenProps {
  onSuccess?: (data: SignUpBasicInfoInput) => void;
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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpBasicInfoInput>({
    resolver: zodResolver(signUpBasicInfoSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = (data: SignUpBasicInfoInput) => {
    try {
      clearError();
      
      if (!agreedToTerms) {
        showError('You must agree to Terms & Conditions', 2000);
        return;
      }
      
      onSuccess?.(data);
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View
        style={{
          height: 64,
          paddingHorizontal: 20,
          backgroundColor: COLORS.background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
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
            fontSize: 24,
            fontWeight: '700',
            color: COLORS.primary,
          }}
        >
          FoodResQ
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.background }}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {/* Hero Image */}
        <View
          style={{
            width: '100%',
            height: 200,
            marginBottom: 24,
          }}
        >
          <Image
            source={{
              uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDOcc2WP0BUcN0sLxOgDhGpAcoMhOF6iprt8IndevCN03HnrKsqttOj58XRHmwWCMbGdIMlMMb5pUb7r__kYrOG4bgbGrxEE5hq1dbE79QmsP_uCw4n580Le938C0vnziR-A1VJPxh2keWX4mhtjFwrstxaQ48hcLvF-x4xOPn9AlVXV_eWG5OZsLMjaOFf3GLitHvoRUsmcmACZ62YRa5GZZR6cdVB6pB1GBpOlL5i_Kfr9sl2kSQO-v3Kgm419bANa6xwFderrh_J',
            }}
            style={{ width: '100%', height: '100%' }}
          />
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 16,
              left: 16,
            }}
          >
            <Text
              style={{
                fontSize: 28,
                fontWeight: '700',
                color: '#ffffff',
              }}
            >
              Đăng ký tài khoản
            </Text>
          </View>
        </View>

        {/* Form */}
        <View style={{ paddingHorizontal: 20, gap: 16, marginBottom: 100 }}>
          {/* Full Name */}
          <View>
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
                  editable={!isLoading}
                  left={
                    <TextInput.Icon icon="account" color={COLORS.outlineVariant} />
                  }
                  style={{
                    backgroundColor: COLORS.surfaceContainerLow,
                  }}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.name}
                />
              )}
            />
            {errors.name && (
              <Text
                style={{
                  fontSize: 12,
                  color: COLORS.error,
                  marginTop: 4,
                }}
              >
                {errors.name.message}
              </Text>
            )}
          </View>

          {/* Email */}
          <View>
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
                  editable={!isLoading}
                  left={
                    <TextInput.Icon icon="email" color={COLORS.outlineVariant} />
                  }
                  style={{
                    backgroundColor: COLORS.surfaceContainerLow,
                  }}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.email}
                />
              )}
            />
            {errors.email && (
              <Text
                style={{
                  fontSize: 12,
                  color: COLORS.error,
                  marginTop: 4,
                }}
              >
                {errors.email.message}
              </Text>
            )}
          </View>

          {/* Password */}
          <View>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Mật khẩu"
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
          </View>

          {/* Confirm Password */}
          <View>
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Xác nhận mật khẩu"
                  placeholder="••••••••"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                  left={
                    <TextInput.Icon
                      icon="lock-reset"
                      color={COLORS.outlineVariant}
                    />
                  }
                  style={{
                    backgroundColor: COLORS.surfaceContainerLow,
                  }}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
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
          </View>

          {/* Terms Checkbox */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 8,
              marginTop: 8,
            }}
          >
            <Checkbox
              status={agreedToTerms ? 'checked' : 'unchecked'}
              onPress={() => setAgreedToTerms(!agreedToTerms)}
              disabled={isLoading}
              color={COLORS.primary}
            />
            <Text
              style={{
                fontSize: 13,
                color: COLORS.onSurfaceVariant,
                flex: 1,
                lineHeight: 18,
              }}
            >
              Tôi đồng ý với các{' '}
              <Text style={{ color: COLORS.primary, fontWeight: '700' }}>
                Điều khoản sử dụng
              </Text>{' '}
              và{' '}
              <Text style={{ color: COLORS.primary, fontWeight: '700' }}>
                Chính sách bảo mật
              </Text>{' '}
              của FoodResQ.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          paddingTop: 16,
          backgroundColor: COLORS.surfaceContainerLowest,
        }}
      >
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          disabled={isLoading || !agreedToTerms}
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
          {isLoading ? 'Đang xử lý...' : 'Đăng ký'}
        </Button>
      </View>

      {/* Sign In Link */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          alignItems: 'center',
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          <Text style={{ fontSize: 14, color: COLORS.onSurfaceVariant }}>
            Đã có tài khoản?{' '}
          </Text>
          <Pressable
            onPress={onNavigateToSignIn}
            disabled={isLoading}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: COLORS.primary,
              }}
            >
              Đăng nhập
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Error Toast */}
      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={3000}
      />
    </View>
  );
}

export default SignUpBasicScreen;
