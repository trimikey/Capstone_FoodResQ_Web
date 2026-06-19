import React, { useState } from 'react';
import {
  View,
  Pressable,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TextInput,
  Button,
  Text,
  ActivityIndicator,
} from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, ForgotPasswordInput } from '../utils/validators';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import ErrorToast from './ErrorToast';
import { AppImage } from './ui/AppImage';
import { FadeInUp, FadeInView } from './ui/Motion';

const COLORS = {
  primary: '#006c49',
  primaryContainer: '#10b981',
  primaryFixed: '#6ffbbe',
  background: '#f8f9ff',
  surface: '#ffffff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f3f4f6',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  error: '#ba1a1a',
  outline: '#6c7a71',
  outlineVariant: '#bbcabf',
};

interface ForgotPasswordScreenProps {
  onSuccess?: (email: string) => void;
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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const {
    control,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = (data: ForgotPasswordInput) => {
    clearError();
    // Container gọi API /auth/forgot-password rồi điều hướng sang OTP
    onSuccess?.(data.email);
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
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
        {/* Illustration */}
        <FadeInView
          style={{
            width: '100%',
            flex: 1,
            minHeight: 80,
            maxHeight: 160,
            borderRadius: 24,
            overflow: 'hidden',
            marginBottom: 12,
            backgroundColor: COLORS.outlineVariant,
          }}
        >
          <AppImage
            source={{
              uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB6RHsKkHGtF5RhfwRNAUVbrO0KA1UxpS6QE43PZTOi5TpiXlkzCtZl2uTd8EOcxqVfyvqyqZiIJnjdTm0g-xlqzY3YXFH41fuQM9nQGhY0hoVXW1y_p_D_3MXNx3__gdl1PzgxRSYWISxA_6ww28ObBOJH8wMAqu7x8ry6mRs3x7rfYfzvemWwOr1uC44sWlnzubjz8TI-CGRjHEf2p9JZcMM241aHmA5hy51_unlEw78mu8m92XW0haNJ8SJoOKQcDrD9ZiGsQKD4',
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
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
            }}
          />
        </FadeInView>

        {/* Title & Subtitle */}
        <FadeInUp delay={80} style={{ marginBottom: 12 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '700',
              color: COLORS.onSurface,
              marginBottom: 8,
            }}
          >
            Quên mật khẩu
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: COLORS.onSurfaceVariant,
              lineHeight: 20,
            }}
          >
            Đừng lo lắng, hãy nhập địa chỉ email của bạn bên dưới. Chúng tôi sẽ gửi hướng dẫn khôi phục mật khẩu ngay lập tức.
          </Text>
        </FadeInUp>

        {/* Form */}
        <View style={{ flex: 1 }}>
          <FadeInUp delay={140} style={{ marginBottom: 12 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: COLORS.onSurface,
                marginBottom: 8,
              }}
            >
              Email của bạn
            </Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="example@foodresq.vn"
                  placeholder="Nhập email của bạn"
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
          </FadeInUp>
        </View>

        {/* Action Buttons */}
        <FadeInUp delay={200} style={{ gap: 12 }}>
          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
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
            {isLoading ? 'Đang xử lý...' : 'Gửi liên kết'}
          </Button>

          <Pressable
            onPress={onNavigateToSignIn}
            disabled={isLoading}
            style={({ pressed }) => ({
              opacity: pressed ? 0.8 : 1,
              paddingVertical: 12,
              alignItems: 'center',
            })}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: COLORS.primary,
              }}
            >
              Quay lại đăng nhập
            </Text>
          </Pressable>
        </FadeInUp>
      </View>

      {/* Error Toast */}
      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={3000}
      />

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSuccessModal(false)}
      >
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
            {/* Handle Bar */}
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

            {/* Success Icon */}
            <View
              style={{
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
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

            {/* Success Message */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: '600',
                  color: COLORS.onSurface,
                  textAlign: 'center',
                }}
              >
                Đã gửi yêu cầu!
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: COLORS.onSurfaceVariant,
                  textAlign: 'center',
                  lineHeight: 20,
                }}
              >
                Chúng tôi đã gửi một liên kết đặt lại mật khẩu đến{' '}
                <Text style={{ fontWeight: '700', color: COLORS.onSurface }}>
                  {submittedEmail}
                </Text>
                . Vui lòng kiểm tra hộp thư đến.
              </Text>
            </View>

            {/* Close Button */}
            <Button
              mode="outlined"
              onPress={() => {
                setShowSuccessModal(false);
                onSuccess?.(submittedEmail);
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
              Đã hiểu
            </Button>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default ForgotPasswordScreen;
