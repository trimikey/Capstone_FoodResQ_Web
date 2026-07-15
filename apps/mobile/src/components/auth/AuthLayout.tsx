import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { elevation, mobileColors as COLORS, radius, spacing } from '@/theme/design';

export function AuthScaffold({
  children,
  footer,
  scrollMode = 'always',
  contentLayout = scrollMode === 'keyboard' ? 'balanced' : 'default',
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollMode?: 'always' | 'keyboard';
  contentLayout?: 'default' | 'balanced';
}) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollEnabled = scrollMode === 'always' || keyboardVisible;
  const useBalancedLayout = contentLayout === 'balanced' && !keyboardVisible;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScrollView
        style={styles.scroll}
        scrollEnabled={scrollEnabled}
        contentContainerStyle={[
          styles.scrollContent,
          useBalancedLayout && styles.scrollContentBalanced,
          { paddingBottom: footer ? spacing.xl : Math.max(insets.bottom, spacing.lg) + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function AuthHeader({
  title = 'FoodResQ',
  subtitle,
  onBack,
  disabled,
  right,
}: {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  disabled?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        disabled={!onBack || disabled}
        hitSlop={10}
        style={({ pressed }) => [
          styles.backButton,
          (pressed || disabled || !onBack) && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
        accessibilityState={{ disabled: !onBack || disabled }}
      >
        <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.onSurface} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

export function AuthIntro({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  eyebrow?: string;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <View style={styles.intro}>
      <View style={styles.introIcon}>
        <MaterialCommunityIcons name={icon} size={22} color={COLORS.primary} />
      </View>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.introTitle}>{title}</Text>
      <Text style={styles.introDescription}>{description}</Text>
    </View>
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function AuthField({
  label,
  helper,
  error,
  children,
}: {
  label: string;
  helper?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {helper && !error ? <Text style={styles.helperText}>{helper}</Text> : null}
    </View>
  );
}

export function ProgressDots({
  total,
  active,
  label,
}: {
  total: number;
  active: number;
  label?: string;
}) {
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressDots}>
        {Array.from({ length: total }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.progressDot,
              index <= active ? styles.progressDotActive : styles.progressDotIdle,
            ]}
          />
        ))}
      </View>
      {label ? <Text style={styles.progressLabel}>{label}</Text> : null}
    </View>
  );
}

export const authStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    minHeight: 50,
    backgroundColor: COLORS.surface,
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  primaryButton: {
    borderRadius: radius.md,
  },
  secondaryButton: {
    borderRadius: radius.md,
    borderColor: COLORS.outline,
  },
  buttonContent: {
    minHeight: 52,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '900',
  },
  textButtonLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.62,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  scrollContentBalanced: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: spacing.lg,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.onSurfaceVariant,
  },
  headerRight: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
  intro: {
    paddingVertical: spacing.sm,
  },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
    textTransform: 'uppercase',
  },
  introTitle: {
    marginTop: 4,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  introDescription: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.onSurfaceVariant,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    ...elevation.card,
  },
  field: {
    gap: 7,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.onSurface,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: COLORS.error,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.onSurfaceVariant,
  },
  progressWrap: {
    alignItems: 'center',
    gap: 7,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 7,
  },
  progressDot: {
    height: 7,
    borderRadius: radius.pill,
  },
  progressDotActive: {
    width: 34,
    backgroundColor: COLORS.primary,
  },
  progressDotIdle: {
    width: 18,
    backgroundColor: COLORS.muted,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
  },
  pressed: {
    opacity: 0.72,
  },
});
