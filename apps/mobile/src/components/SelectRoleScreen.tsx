import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FadeInUp } from './ui/Motion';
import {
  AuthHeader,
  AuthIntro,
  AuthScaffold,
  ProgressDots,
  authStyles,
} from './auth/AuthLayout';
import { elevation, mobileColors as COLORS, radius, spacing } from '@/theme/design';

export type UserRole = 'individual' | 'charity' | 'volunteer' | 'provider';

interface RoleOption {
  id: UserRole;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    id: 'individual',
    icon: 'account-heart-outline',
    title: 'Cá nhân nhận hỗ trợ',
    description: 'Tìm và đặt phần thực phẩm phù hợp cho bản thân.',
  },
  {
    id: 'charity',
    icon: 'hand-heart-outline',
    title: 'Tổ chức từ thiện',
    description: 'Nhận thực phẩm cho cộng đồng hoặc điểm phân phát.',
  },
  {
    id: 'volunteer',
    icon: 'account-hard-hat-outline',
    title: 'Tình nguyện viên',
    description: 'Hỗ trợ vận chuyển, bếp hoặc phục vụ tại chiến dịch.',
  },
  {
    id: 'provider',
    icon: 'storefront-outline',
    title: 'Nhà cung cấp',
    description: 'Đăng tin chia sẻ thực phẩm dư từ cơ sở kinh doanh.',
  },
];

interface SelectRoleScreenProps {
  onSelectRole?: (role: UserRole) => void;
  onBack?: () => void;
  isLoading?: boolean;
}

export function SelectRoleScreen({
  onSelectRole,
  onBack,
  isLoading = false,
}: SelectRoleScreenProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>('individual');

  const handleContinue = () => {
    if (selectedRole) onSelectRole?.(selectedRole);
  };

  return (
    <AuthScaffold
      footer={
        <Button
          mode="contained"
          onPress={handleContinue}
          disabled={!selectedRole || isLoading}
          loading={isLoading}
          buttonColor={COLORS.primary}
          style={authStyles.primaryButton}
          contentStyle={authStyles.buttonContent}
          labelStyle={authStyles.buttonLabel}
          accessibilityLabel="Tiếp tục với vai trò đã chọn"
          accessibilityState={{ disabled: !selectedRole || isLoading }}
        >
          {isLoading ? 'Đang tiếp tục' : 'Tiếp tục'}
        </Button>
      }
    >
      <AuthHeader
        onBack={onBack}
        disabled={isLoading}
        title="FoodResQ"
        subtitle="Thiết lập tài khoản"
        right={<Text style={styles.stepText}>1/2</Text>}
      />

      <ProgressDots total={2} active={0} label="Bước 1: Chọn vai trò" />

      <AuthIntro
        icon="account-switch-outline"
        eyebrow="Vai trò"
        title="Bạn muốn dùng FoodResQ theo cách nào?"
        description="Chọn đúng vai trò để app mở đúng luồng đăng ký và tính năng sau khi đăng nhập."
      />

      <View style={styles.roleList}>
        {ROLE_OPTIONS.map((role, index) => {
          const isSelected = selectedRole === role.id;
          return (
            <FadeInUp key={role.id} delay={70 + index * 50}>
              <Pressable
                onPress={() => setSelectedRole(role.id)}
                disabled={isLoading}
                style={({ pressed }) => [
                  styles.roleCard,
                  isSelected && styles.roleCardSelected,
                  pressed && authStyles.pressed,
                ]}
                accessibilityRole="radio"
                accessibilityLabel={`${role.title}. ${role.description}`}
                accessibilityState={{ selected: isSelected, disabled: isLoading }}
              >
                <View style={[styles.roleIcon, isSelected && styles.roleIconSelected]}>
                  <MaterialCommunityIcons
                    name={role.icon}
                    size={25}
                    color={isSelected ? COLORS.primary : COLORS.onSurfaceVariant}
                  />
                </View>
                <View style={styles.roleCopy}>
                  <Text style={[styles.roleTitle, isSelected && styles.roleTitleSelected]}>
                    {role.title}
                  </Text>
                  <Text style={styles.roleDescription}>{role.description}</Text>
                </View>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            </FadeInUp>
          );
        })}
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  stepText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
  },
  roleList: {
    gap: spacing.sm,
  },
  roleCard: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  roleCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
    ...elevation.pressed,
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleIconSelected: {
    backgroundColor: COLORS.surface,
  },
  roleCopy: {
    flex: 1,
    minWidth: 0,
  },
  roleTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  roleTitleSelected: {
    color: COLORS.primary,
  },
  roleDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.onSurfaceVariant,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
});

export default SelectRoleScreen;
