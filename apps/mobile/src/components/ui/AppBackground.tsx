import type { ReactNode } from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { mobileColors as COLORS } from '@/theme/design';

const foodBackground = require('../../../assets/auth_food_bg.jpg');

interface Props {
  children: ReactNode;
}

export function AppBackground({ children }: Props) {
  return (
    <ImageBackground
      source={foodBackground}
      resizeMode="cover"
      style={styles.root}
      imageStyle={styles.image}
    >
      <View pointerEvents="none" style={styles.overlay} />
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  image: {
    opacity: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(245,244,238,0.58)',
  },
});
