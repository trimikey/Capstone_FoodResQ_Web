import type { ReactNode } from 'react';
import { StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { InteractiveScale } from '@/components/ui/Motion';
import { mobileColors as COLORS, elevation, radius } from '@/theme/design';

interface Props extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'mint' | 'coral';
}

export function SurfaceCard({ children, style, tone = 'default', ...props }: Props) {
  return (
    <InteractiveScale
      {...props}
      pressedScale={0.988}
      style={[
        styles.card,
        tone === 'mint' && styles.mint,
        tone === 'coral' && styles.coral,
        style,
      ]}
    >
      {children}
    </InteractiveScale>
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
});
