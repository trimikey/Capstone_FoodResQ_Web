import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps, type ViewStyle } from 'react-native';
import { mobileColors as COLORS, elevation, radius } from '@/theme/design';

interface Props extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  style?: ViewStyle;
}

export function SurfaceCard({ children, style, ...props }: Props) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.card,
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
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.outline,
    overflow: 'hidden',
    ...elevation.card,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.995 }],
    ...elevation.pressed,
  },
});
