import type { ReactNode } from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { mobileColors as COLORS } from '@/theme/design';

const foodBackground = require('../../../assets/auth_food_bg.jpg');
const foodPattern = require('../../../assets/food_pattern.png');

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
      <ImageBackground
        pointerEvents="none"
        source={foodPattern}
        resizeMode="repeat"
        style={styles.pattern}
        imageStyle={styles.patternImage}
      />
      <View pointerEvents="none" style={styles.topPlate} />
      <View pointerEvents="none" style={styles.sideCut} />
      <View pointerEvents="none" style={styles.orangeMark} />
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
    backgroundColor: 'rgba(245,244,238,0.62)',
  },
  pattern: {
    ...StyleSheet.absoluteFill,
    opacity: 0.12,
  },
  patternImage: {
    opacity: 0.85,
  },
  topPlate: {
    position: 'absolute',
    top: -72,
    right: -40,
    width: 220,
    height: 160,
    borderBottomLeftRadius: 120,
    backgroundColor: 'rgba(31,111,74,0.14)',
    transform: [{ rotate: '-8deg' }],
  },
  sideCut: {
    position: 'absolute',
    left: -72,
    top: 112,
    width: 132,
    height: 330,
    borderTopRightRadius: 86,
    borderBottomRightRadius: 86,
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(31,111,74,0.12)',
  },
  orangeMark: {
    position: 'absolute',
    top: 50,
    left: 24,
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: COLORS.secondary,
  },
});
