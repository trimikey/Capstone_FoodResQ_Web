import React, { useState } from 'react';
import {
  View,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TextInput,
  Button,
  Text,
  ActivityIndicator,
  SegmentedButtons,
} from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import ErrorToast from './ErrorToast';
import { AppImage } from './ui/AppImage';
import { FadeInUp, FadeInView } from './ui/Motion';

const COLORS = {
  primary: '#006c49',
  primaryContainer: '#10b981',
  secondary: '#855300',
  background: '#f8f9ff',
  surface: '#ffffff',
  surfaceContainerLowest: '#f9fafb',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  error: '#ba1a1a',
  outline: '#e5e7eb',
  outlineVariant: '#bbcabf',
};

type RecipientType = 'individual' | 'charity';

const signUpRecipientSchema = z.object({
  recipientType: z.enum(['individual', 'charity']),
  idNumber: z.string().optional(),
  organizationName: z.string().optional(),
  taxId: z.string().optional(),
  address: z.string().min(10, 'Address must be at least 10 characters'),
}).superRefine((data, ctx) => {
  if (data.recipientType === 'individual') {
    if (!data.idNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['idNumber'],
        message: 'ID number is required for individuals',
      });
    }
  } else if (data.recipientType === 'charity') {
    if (!data.organizationName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationName'],
        message: 'Organization name is required',
      });
    }
    if (!data.taxId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['taxId'],
        message: 'Tax ID is required',
      });
    }
  }
});

export type SignUpRecipientInput = z.infer<typeof signUpRecipientSchema>;

interface SignUpRecipientScreenProps {
  onSuccess?: (data: SignUpRecipientInput) => void;
  onBack?: () => void;
  isLoading?: boolean;
}

export function SignUpRecipientScreen({
  onSuccess,
  onBack,
  isLoading = false,
}: SignUpRecipientScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [recipientType, setRecipientType] = useState<RecipientType>('individual');
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<SignUpRecipientInput>({
    resolver: zodResolver(signUpRecipientSchema),
    defaultValues: {
      recipientType: 'individual',
      idNumber: '',
      organizationName: '',
      taxId: '',
      address: '',
    },
  });

  const handleRecipientTypeChange = (value: string) => {
    setRecipientType(value as RecipientType);
  };

  const onSubmit = (data: SignUpRecipientInput) => {
    try {
      clearError();
      onSuccess?.(data);
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View
        style={{
          height: 64,
          paddingHorizontal: 20,
          backgroundColor: COLORS.background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
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
          <Text style={{ fontSize: 24, color: COLORS.primary }}>←</Text>
        </Pressable>
        <Text
          style={{
            fontSize: 32,
            fontWeight: '700',
            color: COLORS.primary,
          }}
        >
          FoodResQ
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
        }}
      >
        <View
          style={{
            flex: 1,
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 8,
          }}
        >
          {/* Progress Indicator */}
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                marginBottom: 4,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: COLORS.primaryContainer,
                }}
              />
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: COLORS.primaryContainer,
                }}
              />
            </View>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '500',
                color: COLORS.onSurfaceVariant,
              }}
            >
              Step 2 of 2: Recipient Details
            </Text>
          </View>

          {/* Section Title */}
          <View style={{ marginBottom: 12 }}>
            <Text
              style={{
                fontSize: 24,
                fontWeight: '600',
                color: COLORS.onSurface,
                marginBottom: 4,
              }}
            >
              Identify yourself
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: COLORS.onSurfaceVariant,
              }}
            >
              Tell us how you'll be receiving the surplus food.
            </Text>
          </View>

          {/* Recipient Type Selector */}
          <View style={{ marginBottom: 12 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: COLORS.onSurface,
                marginBottom: 8,
              }}
            >
              Recipient Type
            </Text>
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
              }}
            >
              {/* Individual Button */}
              <Pressable
                onPress={() => handleRecipientTypeChange('individual')}
                disabled={isLoading}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor:
                    recipientType === 'individual'
                      ? COLORS.primaryContainer
                      : COLORS.outlineVariant,
                  backgroundColor:
                    recipientType === 'individual'
                      ? '#f0fdf4'
                      : COLORS.surfaceContainerLowest,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 20,
                    marginBottom: 4,
                  }}
                >
                  👤
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color:
                      recipientType === 'individual'
                        ? COLORS.primaryContainer
                        : COLORS.onSurfaceVariant,
                  }}
                >
                  Individual
                </Text>
              </Pressable>

              {/* Charity Button */}
              <Pressable
                onPress={() => handleRecipientTypeChange('charity')}
                disabled={isLoading}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor:
                    recipientType === 'charity'
                      ? COLORS.primaryContainer
                      : COLORS.outlineVariant,
                  backgroundColor:
                    recipientType === 'charity'
                      ? '#f0fdf4'
                      : COLORS.surfaceContainerLowest,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 20,
                    marginBottom: 4,
                  }}
                >
                  🤝
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color:
                      recipientType === 'charity'
                        ? COLORS.primaryContainer
                        : COLORS.onSurfaceVariant,
                  }}
                >
                  Charity
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Conditional Fields */}
          {recipientType === 'individual' ? (
            <FadeInUp delay={80} style={{ marginBottom: 12 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: COLORS.onSurface,
                  marginBottom: 8,
                }}
              >
                ID Card Number
              </Text>
              <Controller
                control={control}
                name="idNumber"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    mode="outlined"
                    label="Enter your national ID"
                    placeholder="ID-123456789"
                    value={value}
                    onChangeText={onChange}
                    editable={!isLoading}
                    left={
                      <TextInput.Icon
                        icon="card-account-details-outline"
                        color={COLORS.onSurfaceVariant}
                      />
                    }
                    style={{
                      backgroundColor: COLORS.surfaceContainerLowest,
                    }}
                    outlineColor={COLORS.outline}
                    activeOutlineColor={COLORS.primary}
                    error={!!errors.idNumber}
                  />
                )}
              />
              {errors.idNumber && (
                <Text
                  style={{
                    fontSize: 12,
                    color: COLORS.error,
                    marginTop: 4,
                  }}
                >
                  {errors.idNumber.message}
                </Text>
              )}
            </FadeInUp>
          ) : (
            <View style={{ marginBottom: 12 }}>
              {/* Organization Name */}
              <FadeInUp delay={80} style={{ marginBottom: 10 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: COLORS.onSurface,
                    marginBottom: 8,
                  }}
                >
                  Organization Name
                </Text>
                <Controller
                  control={control}
                  name="organizationName"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      mode="outlined"
                      label="Official registered name"
                      placeholder="Charity Organization Name"
                      value={value}
                      onChangeText={onChange}
                      editable={!isLoading}
                      left={
                        <TextInput.Icon
                          icon="office-building"
                          color={COLORS.onSurfaceVariant}
                        />
                      }
                      style={{
                        backgroundColor: COLORS.surfaceContainerLowest,
                      }}
                      outlineColor={COLORS.outline}
                      activeOutlineColor={COLORS.primary}
                      error={!!errors.organizationName}
                    />
                  )}
                />
                {errors.organizationName && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.error,
                      marginTop: 4,
                    }}
                  >
                    {errors.organizationName.message}
                  </Text>
                )}
              </FadeInUp>

              {/* Tax ID */}
              <FadeInUp delay={140}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: COLORS.onSurface,
                    marginBottom: 8,
                  }}
                >
                  Tax ID / Registration No.
                </Text>
                <Controller
                  control={control}
                  name="taxId"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      mode="outlined"
                      label="Tax ID or Registration Number"
                      placeholder="Ex: 12-3456789"
                      value={value}
                      onChangeText={onChange}
                      editable={!isLoading}
                      left={
                        <TextInput.Icon
                          icon="leaf"
                          color={COLORS.onSurfaceVariant}
                        />
                      }
                      style={{
                        backgroundColor: COLORS.surfaceContainerLowest,
                      }}
                      outlineColor={COLORS.outline}
                      activeOutlineColor={COLORS.primary}
                      error={!!errors.taxId}
                    />
                  )}
                />
                {errors.taxId && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.error,
                      marginTop: 4,
                    }}
                  >
                    {errors.taxId.message}
                  </Text>
                )}
              </FadeInUp>
            </View>
          )}

          {/* Pickup Address */}
          <FadeInUp delay={200} style={{ marginBottom: 12 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: COLORS.onSurface,
                marginBottom: 8,
              }}
            >
              Pickup Address
            </Text>
            <Controller
              control={control}
              name="address"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Enter your address"
                  placeholder="Street name, Building, Apartment number"
                  value={value}
                  onChangeText={onChange}
                  editable={!isLoading}
                  multiline
                  numberOfLines={4}
                  left={
                    <TextInput.Icon
                      icon="map-marker"
                      color={COLORS.onSurfaceVariant}
                    />
                  }
                  style={{
                    backgroundColor: COLORS.surfaceContainerLowest,
                  }}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.address}
                />
              )}
            />
            <Text
              style={{
                fontSize: 12,
                color: COLORS.onSurfaceVariant,
                marginTop: 4,
              }}
            >
              Used to suggest the nearest food surplus points.
            </Text>
            {errors.address && (
              <Text
                style={{
                  fontSize: 12,
                  color: COLORS.error,
                  marginTop: 4,
                }}
              >
                {errors.address.message}
              </Text>
            )}
          </FadeInUp>

          {/* Illustration Image */}
          <FadeInView
            style={{
              flex: 1,
              minHeight: 80,
              maxHeight: 160,
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: COLORS.outline,
            }}
          >
            <AppImage
              source={{
                uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDkhWq4CeI6HiI0zCMKdz2Disk_Alof0JQoOpPuu7voFWvfFlMjnQQ7sbNa0nHnbfQd_kto27Hn-1dHCyd9ErflLQolZL_aym-vd-FeKpErhm5WV5kMVVFFIgIBdpNWUMC9rdItp8gSVYVq4g3y7KS91pEb3CdbFnDwC7It_nr9bkM8txZk7kGRDXdFxqir6G1RWUhgiDz92jPNRhenvJ4b-nUq_e_QL0h7N_vGPwGDuUHdw6bNHEt9Wg_RXdJhoUEJ0B3Ew_H7udWd',
              }}
              style={{ width: '100%', height: '100%' }}
            />
          </FadeInView>
        </View>
      </View>

      {/* Footer Actions */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          paddingTop: 16,
          backgroundColor: COLORS.surfaceContainerLowest,
          borderTopWidth: 1,
          borderTopColor: COLORS.outline,
          flexDirection: 'row',
          gap: 16,
        }}
      >
        <Button
          mode="outlined"
          onPress={onBack}
          disabled={isLoading}
          style={{
            flex: 1,
            borderRadius: 16,
          }}
          labelStyle={{
            fontSize: 14,
            fontWeight: '600',
          }}
        >
          Back
        </Button>
        <FadeInUp delay={260} style={{ flex: 2 }}>
          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
            loading={isLoading}
            style={{
              borderRadius: 16,
              backgroundColor: COLORS.primary,
            }}
            labelStyle={{
              fontSize: 14,
              fontWeight: '600',
            }}
          >
            {isLoading ? 'Processing...' : 'Next'}
          </Button>
        </FadeInUp>
      </View>

      {/* Error Toast */}
      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={3000}
      />
    </View>
  );
}

export default SignUpRecipientScreen;
