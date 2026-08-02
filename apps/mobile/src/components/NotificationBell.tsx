import { useEffect, useMemo, useState } from 'react';
import { Animated, View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useUnreadCount } from '../hooks/useNotifications';
import { mobileColors as COLORS, radius } from '@/theme/design';

export function NotificationBell() {
  const pathname = usePathname();
  const { data: unread = 0, refetch: refetchUnread } = useUnreadCount();
  const [shake] = useState(() => new Animated.Value(0));
  const displayUnread = useMemo(() => unread, [unread]);

  useEffect(() => {
    if (displayUnread <= 0) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 70, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 70, useNativeDriver: true }),
    ]).start();
  }, [displayUnread, shake]);

  const bellRotate = shake.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-16deg', '0deg', '16deg'],
  });

  const openNotifications = () => {
    void refetchUnread();
    router.push({
      pathname: '/notifications',
      params: pathname && pathname !== '/notifications' ? { returnTo: pathname } : undefined,
    });
  };

  return (
    <Pressable onPress={openNotifications} hitSlop={8} style={styles.bellBtn}>
      <Animated.View style={{ transform: [{ rotate: bellRotate }] }}>
        <MaterialCommunityIcons
          name={displayUnread > 0 ? 'bell-ring-outline' : 'bell-outline'}
          size={26}
          color={displayUnread > 0 ? COLORS.rose : COLORS.onSurface}
        />
      </Animated.View>
      {displayUnread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{displayUnread > 9 ? '9+' : displayUnread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bellBtn: { padding: 4 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: COLORS.error,
    borderWidth: 2,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: COLORS.onPrimary, fontSize: 10, fontWeight: '900' },
});
