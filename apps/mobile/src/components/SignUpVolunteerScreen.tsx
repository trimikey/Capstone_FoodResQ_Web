import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  View,
  Pressable,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TextInput,
  Button,
  Text,
  Checkbox,
} from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import ErrorToast from './ErrorToast';

const COLORS = {
  primary: '#006c49',
  primaryContainer: '#10b981',
  secondary: '#855300',
  secondaryContainer: '#ffddb8',
  background: '#f8f9ff',
  surface: '#ffffff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#eff4ff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  error: '#ba1a1a',
  outline: '#F3F4F6',
  outlineVariant: '#bbcabf',
};

const volunteerInfoSchema = z
  .object({
    idCard: z.string().min(5, 'ID card number is required'),
    specializations: z.array(z.enum(['shipper', 'chef', 'waiter']))
      .min(1, 'Please select at least one specialization'),
    vehicleType: z.string().optional(),
    plateNumber: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.specializations.includes('shipper')) {
      if (!data.vehicleType?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['vehicleType'],
          message: 'Vehicle type is required for shippers',
        });
      }
      if (!data.plateNumber?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['plateNumber'],
          message: 'Plate number is required for shippers',
        });
      }
    }
  });

export type VolunteerInfoInput = z.infer<typeof volunteerInfoSchema>;

type Specialization = 'shipper' | 'chef' | 'waiter';

interface SpecializationOption {
  id: Specialization;
  emoji: string;
  title: string;
  description: string;
  icon: string;
}

const SPECIALIZATIONS: SpecializationOption[] = [
  {
    id: 'shipper',
    emoji: '🚗',
    title: 'Shipper',
    description: 'Transport food from donors to recipients',
    icon: 'truck',
  },
  {
    id: 'chef',
    emoji: '👨‍🍳',
    title: 'Chef',
    description: 'Prepare meals and check food quality',
    icon: 'chef-hat',
  },
  {
    id: 'waiter',
    emoji: '🍽️',
    title: 'Waiter',
    description: 'Assist in serving and distribution events',
    icon: 'silverware-fork-knife',
  },
];

const VEHICLE_TYPES = [
  { label: 'Bicycle', value: 'bike' },
  { label: 'Motorcycle', value: 'moto' },
  { label: 'Car / Van', value: 'car' },
  { label: 'Refrigerated Truck', value: 'truck' },
];

interface SignUpVolunteerScreenProps {
  onSuccess?: (data: VolunteerInfoInput) => void;
  onBack?: () => void;
  isLoading?: boolean;
}

export function SignUpVolunteerScreen({
  onSuccess,
  onBack,
  isLoading = false,
}: SignUpVolunteerScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [selectedSpecs, setSelectedSpecs] = useState<Specialization[]>([]);
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<VolunteerInfoInput>({
    resolver: zodResolver(volunteerInfoSchema),
    defaultValues: {
      idCard: '',
      specializations: [],
      vehicleType: '',
      plateNumber: '',
    },
  });

  const isShipperSelected = selectedSpecs.includes('shipper');

  const handleSpecializationChange = (spec: Specialization) => {
    setSelectedSpecs((prev) => {
      const newSpecs = prev.includes(spec)
        ? prev.filter((s) => s !== spec)
        : [...prev, spec];
      return newSpecs;
    });
  };

  const onSubmit = (data: VolunteerInfoInput) => {
    try {
      clearError();
      onSuccess?.({
        ...data,
        specializations: selectedSpecs,
      });
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{
        flex: 1,
        backgroundColor: COLORS.background,
        paddingTop: insets.top,
      }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
            fontSize: 24,
            fontWeight: '700',
            color: COLORS.primary,
          }}
        >
          FoodResQ
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ flex: 1 }}>
        {/* Progress & Title */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, marginBottom: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: COLORS.primaryContainer,
              }}
            />
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: COLORS.primary,
              }}
            />
          </View>
          <Text
            style={{
              fontSize: 12,
              color: COLORS.onSurfaceVariant,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            Step 2 of 2
          </Text>
          <Text
            style={{
              fontSize: 24,
              fontWeight: '600',
              color: COLORS.onSurface,
              textAlign: 'center',
            }}
          >
            Volunteer Details
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
          {/* ID Card */}
          <View>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: COLORS.onSurfaceVariant,
                marginBottom: 8,
              }}
            >
              ID Card Number
            </Text>
            <Controller
              control={control}
              name="idCard"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Enter 16-digit ID"
                  placeholder="0123456789012345"
                  value={value}
                  onChangeText={onChange}
                  editable={!isLoading}
                  left={
                    <TextInput.Icon icon="card-account-details-outline" color={COLORS.outlineVariant} />
                  }
                  style={{
                    backgroundColor: COLORS.surfaceContainerLowest,
                  }}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  error={!!errors.idCard}
                />
              )}
            />
            {errors.idCard && (
              <Text
                style={{
                  fontSize: 12,
                  color: COLORS.error,
                  marginTop: 4,
                }}
              >
                {errors.idCard.message}
              </Text>
            )}
          </View>

          {/* Specializations */}
          <View>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: COLORS.onSurfaceVariant,
                marginBottom: 12,
              }}
            >
              I want to volunteer as a:
            </Text>
            <View style={{ gap: 12 }}>
              {SPECIALIZATIONS.map((spec) => {
                const isSelected = selectedSpecs.includes(spec.id);
                return (
                  <Pressable
                    key={spec.id}
                    onPress={() => handleSpecializationChange(spec.id)}
                    disabled={isLoading}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 16,
                        backgroundColor: isSelected
                          ? COLORS.primaryContainer
                          : COLORS.surfaceContainerLowest,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isSelected
                          ? COLORS.primary
                          : COLORS.outline,
                        gap: 16,
                      }}
                    >
                      <Checkbox
                        status={isSelected ? 'checked' : 'unchecked'}
                        onPress={() => handleSpecializationChange(spec.id)}
                        disabled={isLoading}
                        color={COLORS.primary}
                      />
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
                          {spec.title}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            color: isSelected
                              ? `${COLORS.primary}80`
                              : COLORS.onSurfaceVariant,
                          }}
                        >
                          {spec.description}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 24 }}>{spec.emoji}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Shipper Conditional Fields */}
          {isShipperSelected && (
            <View
              style={{
                borderLeftWidth: 4,
                borderLeftColor: COLORS.primaryContainer,
                paddingLeft: 16,
                gap: 12,
              }}
            >
              {/* Vehicle Type */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: COLORS.onSurfaceVariant,
                    marginBottom: 8,
                  }}
                >
                  Vehicle Type
                </Text>
                <Controller
                  control={control}
                  name="vehicleType"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      mode="outlined"
                      label="Select your vehicle"
                      value={value}
                      onChangeText={onChange}
                      editable={!isLoading}
                      style={{
                        backgroundColor: COLORS.surfaceContainerLowest,
                      }}
                      outlineColor={COLORS.outline}
                      activeOutlineColor={COLORS.primary}
                    />
                  )}
                />
              </View>

              {/* Plate Number */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: COLORS.onSurfaceVariant,
                    marginBottom: 8,
                  }}
                >
                  Vehicle Plate Number
                </Text>
                <Controller
                  control={control}
                  name="plateNumber"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      mode="outlined"
                      label="e.g. ABC 1234"
                      placeholder="ABC 1234"
                      value={value}
                      onChangeText={onChange}
                      editable={!isLoading}
                      style={{
                        backgroundColor: COLORS.surfaceContainerLowest,
                      }}
                      outlineColor={COLORS.outline}
                      activeOutlineColor={COLORS.primary}
                    />
                  )}
                />
              </View>
            </View>
          )}

          {/* Illustration */}
          <View
            style={{
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: COLORS.outline,
              marginTop: 8,
            }}
          >
            <Image
              source={{
                uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD_muV8rDbs2VUt2ylvmXhRVV47V7WrYFNnH-iXfpCcdux4tHCVMojfDyiAsKcUF1ghH5gG6f74T8VNkN8YzIrLN8oIxaKyyfWoAmY7gXThlltdTz30KePzp2nEmPH2Zr0RkcYG-_Jhs_E86ZaM7-OQWNj2u46PO3qzQha18KjIjA7W8M39kSE149eut5Tn6Q-JViBuOnepbHfabkpVlUkyDLQxC7tH1mqLfK0ft6UVvmU6j7ISnRLAZTp2JMA9uXkHGMO4N0G8M8kI',
              }}
              style={{ width: '100%', height: 140 }}
            />
          </View>

          <Text
            style={{
              fontSize: 12,
              color: COLORS.onSurfaceVariant,
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            "Every meal saved is a step toward a greener planet."
          </Text>
        </View>
      </View>

      {/* Footer Buttons */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          paddingTop: 16,
          backgroundColor: COLORS.surfaceContainerLowest,
          flexDirection: 'row',
          gap: 12,
        }}
      >
        <Button
          mode="outlined"
          onPress={onBack}
          disabled={isLoading}
          style={{
            flex: 1,
            borderRadius: 12,
          }}
          labelStyle={{
            fontSize: 14,
            fontWeight: '600',
          }}
        >
          Back
        </Button>
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          disabled={isLoading || selectedSpecs.length === 0}
          loading={isLoading}
          style={{
            flex: 2,
            backgroundColor: COLORS.primary,
            borderRadius: 12,
            paddingVertical: 8,
          }}
          labelStyle={{
            fontSize: 14,
            fontWeight: '600',
          }}
        >
          Next
        </Button>
      </View>

      {/* Error Toast */}
      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={3000}
      />
    </KeyboardAvoidingView>
  );
}

export default SignUpVolunteerScreen;
