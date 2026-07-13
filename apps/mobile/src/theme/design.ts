import { MD3LightTheme, type MD3Theme } from 'react-native-paper';

export const palette = {
  background: '#f6f7f2',
  surface: '#ffffff',
  surfaceMuted: '#eef3ea',
  surfaceStrong: '#dfe8d9',
  primary: '#256f46',
  primaryStrong: '#174b31',
  secondary: '#f26a3d',
  secondaryMuted: '#ffe1d5',
  text: '#121c2a',
  textMuted: '#5f6b7a',
  border: '#d7dfd2',
  success: '#12805c',
  warning: '#b86b00',
  error: '#ba1a1a',
  info: '#2563eb',
} as const;

export const mobileColors = {
  primary: palette.primary,
  primaryContainer: '#d8f0dd',
  secondary: palette.secondary,
  secondaryContainer: palette.secondaryMuted,
  background: palette.background,
  surface: palette.surface,
  surfaceContainerLowest: palette.surface,
  surfaceContainerLow: palette.surfaceMuted,
  surfaceVariant: palette.surfaceMuted,
  onSurface: palette.text,
  onSurfaceVariant: palette.textMuted,
  outline: palette.border,
  outlineVariant: palette.border,
  success: palette.success,
  warning: palette.warning,
  error: palette.error,
  danger: palette.error,
  info: palette.info,
  muted: palette.surfaceStrong,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const elevation = {
  card: {
    shadowColor: '#174b31',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 2,
  },
  pressed: {
    shadowColor: '#174b31',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 1,
  },
} as const;

export const paperDefaults = {
  button: {
    borderRadius: radius.md,
    contentPaddingVertical: 4,
  },
  input: {
    dense: true,
    borderRadius: radius.sm,
  },
  card: {
    borderRadius: radius.md,
    elevation: 1,
  },
} as const;

export const typography = {
  title: {
    fontWeight: '700',
    letterSpacing: 0,
    color: palette.text,
  },
  body: {
    letterSpacing: 0,
    color: palette.text,
  },
  muted: {
    letterSpacing: 0,
    color: palette.textMuted,
  },
} as const;

export const appTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: radius.md,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    onPrimary: '#ffffff',
    primaryContainer: '#d8f0dd',
    onPrimaryContainer: palette.primaryStrong,
    secondary: palette.secondary,
    onSecondary: '#ffffff',
    secondaryContainer: palette.secondaryMuted,
    onSecondaryContainer: '#5f1f0d',
    background: palette.background,
    onBackground: palette.text,
    surface: palette.surface,
    surfaceDisabled: '#e5e7df',
    onSurfaceDisabled: '#8a9385',
    onSurface: palette.text,
    surfaceVariant: palette.surfaceMuted,
    onSurfaceVariant: palette.textMuted,
    outline: palette.border,
    outlineVariant: palette.border,
    error: palette.error,
    onError: '#ffffff',
    errorContainer: '#ffdad6',
    onErrorContainer: '#410002',
  },
};
