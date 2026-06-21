import { ReactNode } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';

/**
 * Hiệu ứng xuất hiện dùng chung (Reanimated v4).
 * Bọc một khối nội dung để nó trượt-mờ lên khi màn hình mount.
 * Docs: https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations
 */
interface FadeInUpProps {
  children: ReactNode;
  /** Độ trễ (ms) — dùng để stagger nhiều khối liên tiếp */
  delay?: number;
  duration?: number;
  style?: ViewStyle;
}

export function FadeInUp({
  children,
  delay = 0,
  duration = 400,
  style,
}: FadeInUpProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(duration).delay(delay)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** Mờ dần đơn giản (cho hero image, banner...) */
export function FadeInView({
  children,
  delay = 0,
  duration = 400,
  style,
}: FadeInUpProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(duration).delay(delay)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

export { Animated };
