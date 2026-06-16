import React, { useState } from 'react';
import {
  View,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text, Card } from 'react-native-paper';

const COLORS = {
  primary: '#10b981',
  primaryLight: '#f0fdf4',
  primaryContainer: '#4edea3',
  secondary: '#855300',
  background: '#ffffff',
  surface: '#ffffff',
  onSurface: '#1a1a1a',
  onSurfaceVariant: '#6b7280',
  error: '#ba1a1a',
  outline: '#F3F4F6',
  outlineVariant: '#bbcabf',
  warningContainer: '#f59e0b',
};

export type UserRole = 'individual' | 'charity' | 'volunteer';

interface RoleOption {
  id: UserRole;
  emoji: string;
  title: string;
  description: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    id: 'individual',
    emoji: '👤',
    title: 'Individual',
    description: 'Get food support as an individual',
  },
  {
    id: 'charity',
    emoji: '🤲',
    title: 'Charity Organization',
    description: 'Receive food support as an organization',
  },
  {
    id: 'volunteer',
    emoji: '🤝',
    title: 'Volunteer',
    description: 'Help transport and distribute food',
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
  const insets = useSafeAreaInsets();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>('individual');

  const handleSelectRole = (role: UserRole) => {
    if (!isLoading) {
      setSelectedRole(role);
    }
  };

  const handleContinue = () => {
    if (selectedRole) {
      onSelectRole?.(selectedRole);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View
        style={{
          height: 56,
          paddingHorizontal: 20,
          backgroundColor: COLORS.background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.outline,
        }}
      >
        <Pressable
          onPress={onBack}
          disabled={isLoading}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            padding: 8,
            marginLeft: -8,
          })}
        >
          <Text style={{ fontSize: 24, color: COLORS.onSurface }}>←</Text>
        </Pressable>
        <Text
          style={{
            fontSize: 24,
            fontWeight: '600',
            color: COLORS.onSurface,
          }}
        >
          Who are you?
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Main Content */}
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
        }}
      >
        {/* Subtitle & Progress Section */}
        <View
          style={{
            alignItems: 'center',
            marginTop: 12,
            marginBottom: 12,
            paddingHorizontal: 20,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: COLORS.onSurfaceVariant,
              marginBottom: 8,
            }}
          >
            Choose your role to get started
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: COLORS.warningContainer,
              marginBottom: 12,
              fontWeight: '500',
            }}
          >
            Step 1 of 2
          </Text>

          {/* Progress Bar */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View
              style={{
                height: 6,
                width: 48,
                borderRadius: 3,
                backgroundColor: COLORS.warningContainer,
              }}
            />
            <View
              style={{
                height: 6,
                width: 48,
                borderRadius: 3,
                backgroundColor: COLORS.outline,
              }}
            />
          </View>
        </View>

        {/* Role Cards */}
        <View
          style={{
            flex: 1,
            paddingHorizontal: 20,
            paddingBottom: 8,
            gap: 16,
            justifyContent: 'center',
          }}
        >
          {ROLE_OPTIONS.map((role) => {
            const isSelected = selectedRole === role.id;

            return (
              <Pressable
                key={role.id}
                onPress={() => handleSelectRole(role.id)}
                disabled={isLoading}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View
                  style={{
                    backgroundColor: isSelected
                      ? COLORS.primaryLight
                      : COLORS.surface,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected
                      ? COLORS.primary
                      : COLORS.outline,
                    borderRadius: 12,
                    padding: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 16,
                    shadowColor: '#000',
                    shadowOffset: {
                      width: 0,
                      height: isSelected ? 4 : 2,
                    },
                    shadowOpacity: isSelected ? 0.08 : 0.05,
                    shadowRadius: isSelected ? 12 : 8,
                    elevation: isSelected ? 8 : 4,
                  }}
                >
                  {/* Icon Circle */}
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: isSelected
                        ? `${COLORS.primary}20`
                        : '#f3f4f6',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>{role.emoji}</Text>
                  </View>

                  {/* Content */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: isSelected
                          ? COLORS.primary
                          : COLORS.onSurface,
                        marginBottom: 4,
                      }}
                    >
                      {role.title}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: isSelected
                          ? `${COLORS.primary}80`
                          : COLORS.onSurfaceVariant,
                      }}
                    >
                      {role.description}
                    </Text>
                  </View>

                  {/* Radio Button */}
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: isSelected ? 6 : 2,
                      borderColor: isSelected
                        ? COLORS.primary
                        : COLORS.outlineVariant,
                      backgroundColor: isSelected
                        ? COLORS.surface
                        : 'transparent',
                    }}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Continue Button */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          paddingTop: 16,
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderTopColor: COLORS.outline,
        }}
      >
        <Button
          mode="contained"
          onPress={handleContinue}
          disabled={!selectedRole || isLoading}
          loading={isLoading}
          style={{
            backgroundColor: COLORS.primary,
            borderRadius: 16,
            paddingVertical: 8,
          }}
          labelStyle={{
            fontSize: 14,
            fontWeight: '600',
          }}
        >
          {isLoading ? 'Continuing...' : 'Continue'}
        </Button>
      </View>
    </View>
  );
}

export default SelectRoleScreen;
