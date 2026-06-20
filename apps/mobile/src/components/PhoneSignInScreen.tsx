import React from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextInput, Button, Text } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { phoneSignInSchema, PhoneSignInInput } from '../utils/validators';
import { FadeInUp } from './ui/Motion';

const COLORS = {
  primary: '#006c49',
  primaryContainer: '#10b981',
  background: '#f8f9ff',
  surface: '#ffffff',
  surfaceContainerLow: '#f3f4f6',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  error: '#ba1a1a',
  outline: '#6c7a71',
  outlineVariant: '#bbcabf',
};

interface PhoneSignInScreenProps {
  onSubmitPhone?: (phone: string) => void;
  onBack?: () => void;
  isLoading?: boolean;
}

export function PhoneSignInScreen({
  onSubmitPhone,
  onBack,
  isLoading = false,
}: PhoneSignInScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PhoneSignInInput>({
    resolver: zodResolver(phoneSignInSchema),
    defaultValues: { phone: '' },
  });

  const onSubmit = (data: PhoneSignInInput) => onSubmitPhone?.(data.phone);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View
        style={{
          height: 64,
          paddingHorizontal: 20,
          backgroundColor: COLORS.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Pressable
          onPress={onBack}
          disabled={isLoading}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 8, marginLeft: -8 })}
        >
          <Text style={{ fontSize: 24, color: COLORS.primary }}>←</Text>
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.primary }}>
          FoodResQ
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 24 }}>
        <FadeInUp delay={60} style={{ marginBottom: 16 }}>
          <Text
            style={{ fontSize: 28, fontWeight: '700', color: COLORS.onSurface, marginBottom: 8 }}
          >
            Đăng nhập bằng SĐT
          </Text>
          <Text style={{ fontSize: 14, color: COLORS.onSurfaceVariant, lineHeight: 20 }}>
            Nhập số điện thoại của bạn, chúng tôi sẽ gửi mã OTP để xác minh.
          </Text>
        </FadeInUp>

        <FadeInUp delay={120}>
          <Text
            style={{ fontSize: 14, fontWeight: '600', color: COLORS.onSurface, marginBottom: 8 }}
          >
            Số điện thoại
          </Text>
          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, value } }) => (
              <TextInput
                mode="outlined"
                label="0912345678"
                placeholder="Nhập số điện thoại"
                value={value}
                onChangeText={onChange}
                keyboardType="phone-pad"
                editable={!isLoading}
                left={<TextInput.Icon icon="phone" color={COLORS.outlineVariant} />}
                style={{ backgroundColor: COLORS.surfaceContainerLow }}
                outlineColor={COLORS.outline}
                activeOutlineColor={COLORS.primary}
                error={!!errors.phone}
              />
            )}
          />
          {errors.phone && (
            <Text style={{ fontSize: 12, color: COLORS.error, marginTop: 4 }}>
              {errors.phone.message}
            </Text>
          )}
        </FadeInUp>
      </View>

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
          onPress={handleSubmit(onSubmit)}
          disabled={isLoading}
          loading={isLoading}
          style={{ backgroundColor: COLORS.primaryContainer, borderRadius: 16, paddingVertical: 8 }}
          labelStyle={{ fontSize: 14, fontWeight: '600' }}
        >
          {isLoading ? 'Đang gửi mã...' : 'Gửi mã OTP'}
        </Button>
      </View>
    </View>
  );
}

export default PhoneSignInScreen;
