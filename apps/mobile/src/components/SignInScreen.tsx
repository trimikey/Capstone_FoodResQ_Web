import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Button,
  Checkbox,
  Text,
  TextInput,
} from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, LoginInput } from '../utils/validators';
import { Popup } from '@/components/ui/AppPopup';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import { useAuth } from '../hooks/useAuth';
import ErrorToast from './ErrorToast';
import { AppImage } from './ui/AppImage';
import { FadeInUp, FadeInView } from './ui/Motion';
import { signInWithGoogle, AuthCancelledError } from '../services/firebaseAuth';
import { elevation, mobileColors as COLORS, radius, spacing } from '@/theme/design';

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
  const { height } = useWindowDimensions();
  const compactHeight = height < 720;
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const { error, isVisible, showError, clearError } = useErrorHandler();
  const { login, loginWithFirebase } = useAuth();

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      const idToken = await signInWithGoogle();
      await loginWithFirebase(idToken);
      onSignInSuccess?.(undefined);
    } catch (err) {
      if (err instanceof AuthCancelledError) return;
      Popup.show({
        type: 'error',
        text1: 'Đăng nhập Google thất bại',
        text2: getErrorMessage(err),
      });
    } finally {
      setGoogleLoading(false);
    }
  };

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

      await login(data);

      Popup.show({
        type: 'success',
        text1: 'Đăng nhập thành công',
        text2: 'Chào mừng bạn quay lại FoodResQ',
      });

      onSignInSuccess?.(null);
    } catch (error) {
      showError(getErrorMessage(error), 4000);
    } finally {
      setIsLoading(false);
    }
  };

  const submitting = isLoading || googleLoading;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>F</Text>
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.brandTitle}>FoodResQ</Text>
            <Text style={styles.brandSubtitle}>Cứu thực phẩm, kết nối cộng đồng</Text>
          </View>
        </View>

        <FadeInView style={compactHeight ? styles.heroCompact : styles.hero}>
          <AppImage
            source={{
              uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBMmLTbgMqJ7Os3EH_vc1wSOw1e7XLFKtHbs9Hdr5lr8yu8vynQuJvCOgAJ-LUyCYKKGGi7axLiBK4nAVdjpb-pnxOvb9tlBiNuivg4yaZfepnTgmBsQJIzYZLS5eTrlgapHDYyS-8dTAdk6YPKi2ZCfcw7GXg0d7EhLF4fP_EIFeeY54rRI62hQByH3D2U4wpxhFSwbyozgWBcZzf6RNDFvVE5gmthCK2sqkcMfKzxm9fg8PIzugPrtR4megGMKWxVaXKwVujB569-',
            }}
            style={styles.heroImage}
          />
          <View style={styles.heroOverlay} />
          <View style={styles.heroText}>
            <Text style={styles.heroKicker}>Đăng nhập</Text>
            <Text style={styles.heroTitle}>Quay lại để tiếp tục điều phối bữa ăn</Text>
          </View>
        </FadeInView>

        <FadeInUp delay={80} style={styles.formCard}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Chào mừng trở lại</Text>
            <Text style={styles.formSubtitle}>
              Dùng email đã đăng ký hoặc tài khoản Google để vào FoodResQ.
            </Text>
          </View>

          <Field label="Email" error={errors.email?.message}>
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
                  editable={!submitting}
                  left={<TextInput.Icon icon="email-outline" color={COLORS.onSurfaceVariant} />}
                  style={styles.input}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.email}
                  dense
                />
              )}
            />
          </Field>

          <Field label="Mật khẩu" error={errors.password?.message}>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Mật khẩu"
                  placeholder="Nhập mật khẩu"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  textContentType="password"
                  editable={!submitting}
                  left={<TextInput.Icon icon="lock-outline" color={COLORS.onSurfaceVariant} />}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      onPress={() => setShowPassword((current) => !current)}
                      color={COLORS.onSurfaceVariant}
                      forceTextInputFocus={false}
                    />
                  }
                  style={styles.input}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.password}
                  dense
                />
              )}
            />
          </Field>

          <View style={styles.helperRow}>
            <Pressable
              onPress={() => setRememberMe((current) => !current)}
              disabled={submitting}
              style={({ pressed }) => [styles.rememberPressable, pressed && styles.pressed]}
              accessibilityRole="checkbox"
              accessibilityLabel="Ghi nhớ đăng nhập"
              accessibilityState={{ checked: rememberMe, disabled: submitting }}
            >
              <Checkbox
                status={rememberMe ? 'checked' : 'unchecked'}
                disabled={submitting}
                color={COLORS.primary}
              />
              <Text style={styles.helperText}>Ghi nhớ</Text>
            </Pressable>

            <Pressable
              onPress={onNavigateToForgotPassword}
              disabled={submitting}
              hitSlop={8}
              style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Quên mật khẩu"
            >
              <Text style={styles.textButtonLabel}>Quên mật khẩu?</Text>
            </Pressable>
          </View>

          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            disabled={submitting}
            loading={isLoading}
            buttonColor={COLORS.primary}
            style={styles.primaryButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.primaryButtonLabel}
            accessibilityLabel="Đăng nhập vào FoodResQ"
            accessibilityState={{ disabled: submitting }}
          >
            {isLoading ? 'Đang đăng nhập' : 'Đăng nhập'}
          </Button>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>hoặc</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            onPress={handleGoogleSignIn}
            disabled={submitting}
            style={({ pressed }) => [
              styles.googleButton,
              (pressed || googleLoading) && styles.pressed,
              submitting && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Đăng nhập bằng Google"
            accessibilityState={{ disabled: submitting }}
          >
            {googleLoading ? (
              <ActivityIndicator size={20} color={COLORS.primary} />
            ) : (
              <AppImage
                source={{
                  uri: 'https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png',
                }}
                style={styles.googleIcon}
                contentFit="contain"
              />
            )}
            <Text style={styles.googleLabel}>
              {googleLoading ? 'Đang kết nối Google' : 'Tiếp tục với Google'}
            </Text>
          </Pressable>
        </FadeInUp>

        <View style={styles.signUpRow}>
          <Text style={styles.signUpText}>Chưa có tài khoản?</Text>
          <Pressable
            onPress={onNavigateToSignUp}
            disabled={submitting}
            hitSlop={8}
            style={({ pressed }) => [pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Tạo tài khoản mới"
          >
            <Text style={styles.signUpLink}>Đăng ký ngay</Text>
          </Pressable>
        </View>

        <Text style={styles.termsText}>
          Khi đăng nhập, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của FoodResQ.
        </Text>
      </ScrollView>

      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={4000}
      />
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  brandRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoMark: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  brandCopy: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  brandSubtitle: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.onSurfaceVariant,
  },
  hero: {
    height: 154,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.outline,
  },
  heroCompact: {
    height: 116,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.outline,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(18, 28, 42, 0.34)',
  },
  heroText: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  heroKicker: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  heroTitle: {
    marginTop: 4,
    maxWidth: 300,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    color: '#ffffff',
  },
  formCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    ...elevation.card,
  },
  formHeader: {
    gap: 3,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  formSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.onSurfaceVariant,
  },
  field: {
    gap: 7,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.onSurface,
  },
  input: {
    minHeight: 50,
    backgroundColor: COLORS.surface,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: COLORS.error,
  },
  helperRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rememberPressable: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -10,
  },
  helperText: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
  },
  textButton: {
    minHeight: 42,
    justifyContent: 'center',
  },
  textButtonLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
  },
  primaryButton: {
    borderRadius: radius.md,
  },
  buttonContent: {
    minHeight: 52,
  },
  primaryButtonLabel: {
    fontSize: 16,
    fontWeight: '900',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.outline,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
  },
  googleButton: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceContainerLow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  googleLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.onSurface,
  },
  signUpRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  signUpText: {
    fontSize: 15,
    color: COLORS.onSurfaceVariant,
  },
  signUpLink: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.primary,
  },
  termsText: {
    paddingHorizontal: spacing.sm,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    color: COLORS.onSurfaceVariant,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.62,
  },
});

export default SignInScreen;
