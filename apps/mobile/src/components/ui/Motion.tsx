import type { ReactNode } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface FadeInUpProps {
  children: ReactNode;
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

interface InteractiveScaleProps extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  haptic?: boolean;
}

export function InteractiveScale({
  children,
  style,
  pressedScale = 0.985,
  haptic = true,
  onPressIn,
  onPressOut,
  ...props
}: InteractiveScaleProps) {
  const isInteractive = !props.disabled && Boolean(props.onPress || props.onLongPress || onPressIn || onPressOut);

  const handlePressIn = (event: GestureResponderEvent) => {
    if (haptic && isInteractive) {
      void Haptics.selectionAsync();
    }
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    onPressOut?.(event);
  };

  return (
    <Pressable
      {...props}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={({ pressed }) => [
        style,
        pressed && isInteractive && {
          opacity: 0.94,
          transform: [{ scale: pressedScale }],
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

export { Animated };
