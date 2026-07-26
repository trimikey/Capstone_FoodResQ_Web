import { router } from 'expo-router';
import { IconButton } from 'react-native-paper';
import { mobileColors as COLORS, radius } from '@/theme/design';

interface Props {
  onPress?: () => void;
  color?: string;
  backgroundColor?: string;
}

export function BackButton({
  onPress = () => router.back(),
  color = COLORS.primary,
  backgroundColor = COLORS.surfaceContainerLow,
}: Props) {
  return (
    <IconButton
      icon="arrow-left"
      mode="contained"
      size={22}
      onPress={onPress}
      iconColor={color}
      containerColor={backgroundColor}
      style={{ margin: 0, borderRadius: radius.pill }}
      accessibilityLabel="Quay lại"
    />
  );
}
