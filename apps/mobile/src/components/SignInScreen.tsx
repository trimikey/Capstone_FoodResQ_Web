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
  Divider,
  ActivityIndicator,
} from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, LoginInput } from '../utils/validators';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import ErrorToast from './ErrorToast';

const COLORS = {
  primary: '#10b981',
  secondary: '#ff9800',
  background: '#f8f9ff',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  error: '#ba1a1a',
  outline: '#e5e7eb',
};

interface SignInScreenProps {
  onSignInSuccess?: (user: any) => void;
  onNavigateToSignUp?: () => void;
  onNavigateToForgotPassword?: () => void;
}

export function SignInScreen({
  onSignInSuccess,
  onNavigateToSignUp,
  onNavigateToForgotPassword,
}: SignInScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginInput) => {
    try {
      setIsLoading(true);
      clearError();
      
      // TODO: Call API to login
      // const response = await apiClient.post('/auth/login', data);
      
      // Store tokens if rememberMe is checked
      if (rememberMe) {
        // TODO: Store in AsyncStorage
      }
      
      // Navigate to home screen
      onSignInSuccess?.(null);
    } catch (error) {
      const message = getErrorMessage(error);
      showError(message, 4000);
      console.error('Sign in error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: COLORS.background,
        paddingTop: insets.top,
      }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      {/* Header */}
      <View
        style={{
          height: 56,
          paddingHorizontal: 20,
          backgroundColor: COLORS.surface,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable
          onPress={() => {
            // TODO: Navigate back
          }}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            padding: 8,
            marginLeft: -8,
          })}
        >
          <Text style={{ fontSize: 24 }}>←</Text>
        </Pressable>
        <Text
          style={{
            fontSize: 24,
            fontWeight: '600',
            color: COLORS.onSurface,
          }}
        >
          Sign In
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Main Content */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 32,
        }}
      >
        {/* Subtitle */}
        <Text
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: COLORS.onSurfaceVariant,
            marginBottom: 24,
          }}
        >
          Welcome back to FoodResQ
        </Text>

        {/* Hero Image */}
        <View
          style={{
            width: '100%',
            height: 200,
            marginBottom: 24,
            borderRadius: 24,
            overflow: 'hidden',
            backgroundColor: COLORS.outline,
          }}
        >
          <Image
            source={{
              uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBMmLTbgMqJ7Os3EH_vc1wSOw1e7XLFKtHbs9Hdr5lr8yu8vynQuJvCOgAJ-LUyCYKKGGi7axLiBK4nAVdjpb-pnxOvb9tlBiNuivg4yaZfepnTgmBsQJIzYZLS5eTrlgapHDYyS-8dTAdk6YPKi2ZCfcw7GXg0d7EhLF4fP_EIFeeY54rRI62hQByH3D2U4wpxhFSwbyozgWBcZzf6RNDFvVE5gmthCK2sqkcMfKzxm9fg8PIzugPrtR4megGMKWxVaXKwVujB569-',
            }}
            style={{ width: '100%', height: '100%' }}
            defaultSource={require('../assets/placeholder.png')}
          />
        </View>

        {/* Email Field */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: COLORS.onSurfaceVariant,
              marginBottom: 8,
            }}
          >
            Email Address
          </Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <TextInput
                mode="outlined"
                label="Enter your email"
                placeholder="user@example.com"
                value={value}
                onChangeText={onChange}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isLoading}
                left={
                  <TextInput.Icon icon="email" color={COLORS.onSurfaceVariant} />
                }
                style={{
                  backgroundColor: COLORS.surface,
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

        {/* Password Field */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: COLORS.onSurfaceVariant,
              marginBottom: 8,
            }}
          >
            Password
          </Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <TextInput
                mode="outlined"
                label="Enter your password"
                placeholder="••••••••"
                value={value}
                onChangeText={onChange}
                secureTextEntry={!showPassword}
                editable={!isLoading}
                left={
                  <TextInput.Icon icon="lock" color={COLORS.onSurfaceVariant} />
                }
                right={
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off' : 'eye'}
                    onPress={() => setShowPassword(!showPassword)}
                    color={COLORS.onSurfaceVariant}
                  />
                }
                style={{
                  backgroundColor: COLORS.surface,
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

        {/* Helper Row: Remember Me & Forgot Password */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Checkbox
              status={rememberMe ? 'checked' : 'unchecked'}
              onPress={() => setRememberMe(!rememberMe)}
              disabled={isLoading}
              color={COLORS.primary}
            />
            <Text
              style={{
                fontSize: 14,
                color: COLORS.onSurfaceVariant,
                marginLeft: 8,
              }}
            >
              Remember me
            </Text>
          </View>
          <Pressable
            onPress={onNavigateToForgotPassword}
            disabled={isLoading}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: COLORS.primary,
              }}
            >
              Forgot password?
            </Text>
          </Pressable>
        </View>

        {/* Sign In Button */}
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          disabled={isLoading}
          loading={isLoading}
          style={{
            marginBottom: 24,
            backgroundColor: COLORS.primary,
            paddingVertical: 8,
          }}
          labelStyle={{
            fontSize: 16,
            fontWeight: 'bold',
          }}
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>

        {/* Divider */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginVertical: 24,
          }}
        >
          <View
            style={{
              flex: 1,
              height: 1,
              backgroundColor: COLORS.outline,
            }}
          />
          <Text
            style={{
              paddingHorizontal: 16,
              fontSize: 14,
              color: COLORS.onSurfaceVariant,
            }}
          >
            Or continue with
          </Text>
          <View
            style={{
              flex: 1,
              height: 1,
              backgroundColor: COLORS.outline,
            }}
          />
        </View>

        {/* Social Login Buttons */}
        <View
          style={{
            flexDirection: 'row',
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* Google Button */}
          <Pressable
            onPress={() => {
              // TODO: Implement OAuth Google
            }}
            disabled={isLoading}
            style={({ pressed }) => ({
              flex: 1,
              height: 52,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: COLORS.outline,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Image
              source={{
                uri: 'https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png',
              }}
              style={{ width: 20, height: 20 }}
            />
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: COLORS.onSurface,
              }}
            >
              Google
            </Text>
          </Pressable>

          {/* Facebook Button */}
          <Pressable
            onPress={() => {
              // TODO: Implement OAuth Facebook
            }}
            disabled={isLoading}
            style={({ pressed }) => ({
              flex: 1,
              height: 52,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: COLORS.outline,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {/* Facebook Icon SVG */}
            <View
              style={{
                width: 24,
                height: 24,
                backgroundColor: '#1877F2',
                borderRadius: 2,
              }}
            />
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: COLORS.onSurface,
              }}
            >
              Facebook
            </Text>
          </Pressable>
        </View>

        {/* Sign Up Link */}
        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          <Text
            style={{
              fontSize: 16,
              color: COLORS.onSurfaceVariant,
            }}
          >
            Don't have an account?{' '}
          </Text>
          <Pressable
            onPress={onNavigateToSignUp}
            disabled={isLoading}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: 'bold',
                color: COLORS.primary,
              }}
            >
              Sign up
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Footer */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: COLORS.onSurfaceVariant,
            textAlign: 'center',
            lineHeight: 18,
          }}
        >
          By signing in, you agree to our{' '}
          <Text
            style={{
              textDecorationLine: 'underline',
              color: COLORS.primary,
            }}
          >
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text
            style={{
              textDecorationLine: 'underline',
              color: COLORS.primary,
            }}
          >
            Privacy Policy
          </Text>
        </Text>
      </View>

      {/* Error Toast */}
      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={4000}
      />
    </ScrollView>
  );
}

export default SignInScreen;
