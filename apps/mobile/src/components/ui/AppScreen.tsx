import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { mobileColors as COLORS, spacing } from '@/theme/design';
import { AppBackground } from './AppBackground';

interface Props {
  children: ReactNode;
  edges?: Edge[];
  contentStyle?: ViewStyle;
}

export function AppScreen({ children, edges = ['top'], contentStyle }: Props) {
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      <AppBackground>
        <View style={[styles.content, contentStyle]}>{children}</View>
      </AppBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingTop: spacing.sm,
  },
});
