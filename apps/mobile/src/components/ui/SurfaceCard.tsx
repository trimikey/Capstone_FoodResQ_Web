import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps, type ViewStyle } from 'react-native';
import { mobileColors as COLORS, elevation, radius } from '@/theme/design';

interface Props extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  style?: ViewStyle;
  tone?: 'default' | 'mint' | 'coral';
}

export function SurfaceCard({ children, style, tone = 'default', ...props }: Props) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.card,
        tone === 'mint' && styles.mint,
        tone === 'coral' && styles.coral,
        pressed && styles.pressed,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    overflow: 'hidden',
    ...elevation.card,
  },
  mint: {
    backgroundColor: COLORS.mint,
    borderColor: '#cfe5d4',
  },
  coral: {
    backgroundColor: COLORS.coral,
    borderColor: '#f4d6c9',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
    ...elevation.pressed,
  },
});
