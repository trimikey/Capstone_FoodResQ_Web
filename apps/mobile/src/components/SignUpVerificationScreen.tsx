import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Text,
  Checkbox,
  ActivityIndicator,
  Snackbar,
} from 'react-native-paper';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import ErrorToast from './ErrorToast';

const COLORS = {
  primary: '#006c49',
  primaryContainer: '#10b981',
  primaryFixed: '#6ffbbe',
  secondary: '#855300',
  background: '#f8f9ff',
  surface: '#ffffff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#eff4ff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  error: '#ba1a1a',
  outline: '#F3F4F6',
  outlineVariant: '#bbcabf',
  inverseOnSurface: '#eaf1ff',
  inverseSurface: '#27313f',
};

interface DocumentUploadState {
  [key: string]: boolean;
}

interface SignUpVerificationScreenProps {
  onSuccess?: () => void;
  onBack?: () => void;
  isLoading?: boolean;
  recipientType?: 'individual' | 'charity';
  volunteerRole?: boolean;
}

export function SignUpVerificationScreen({
  onSuccess,
  onBack,
  isLoading = false,
  recipientType = 'individual',
  volunteerRole = false,
}: SignUpVerificationScreenProps) {
  const insets = useSafeAreaInsets();
  const [agreedToCertification, setAgreedToCertification] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<DocumentUploadState>({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const documents = [
    ...(volunteerRole
      ? []
      : [
          {
            id: 'business_license',
            label: 'Business License (Provider)',
            description: 'Required for Businesses',
            subtitle: 'PDF, JPG or PNG (max 5MB)',
            icon: '📄',
            required: false,
          },
        ]),
    {
      id: 'id_card',
      label: 'ID Card Front/Back',
      description: 'Receiver/Volunteer',
      subtitle: 'Upload both sides',
      icon: '🪪',
      required: true,
    },
    ...(recipientType === 'individual'
      ? [
          {
            id: 'income_proof',
            label: 'Income Proof (Individual Receiver)',
            description: 'Required for individuals',
            subtitle: 'Pay stub or bank statement',
            icon: '📊',
            required: false,
          },
        ]
      : []),
    ...(volunteerRole
      ? [
          {
            id: 'food_safety',
            label: 'Food Safety Certificate',
            description: 'Volunteer Chef',
            subtitle: 'Valid certification document',
            icon: '✓',
            required: false,
          },
        ]
      : []),
  ];

  const handleDocumentUpload = (docId: string) => {
    setUploadedDocuments((prev) => ({
      ...prev,
      [docId]: !prev[docId],
    }));
    setToastMessage(`Document uploaded: ${docId}`);
    setShowToast(true);
  };

  const handleSubmit = () => {
    if (!agreedToCertification) {
      setToastMessage('Please agree to the certification');
      setShowToast(true);
      return;
    }
    onSuccess?.();
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
            fontSize: 24,
            fontWeight: '700',
            color: COLORS.primary,
          }}
        >
          FoodResQ
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: COLORS.onSurfaceVariant,
          }}
        >
          Step 3 of 3
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.background }}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {/* Progress Indicator */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 16,
          }}
        >
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: COLORS.primaryContainer,
            }}
          />
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: COLORS.primaryContainer,
            }}
          />
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: COLORS.primary,
            }}
          />
        </View>

        {/* Title */}
        <View style={{ alignItems: 'center', marginBottom: 24, paddingHorizontal: 20 }}>
          <Text
            style={{
              fontSize: 24,
              fontWeight: '600',
              color: COLORS.onSurface,
              marginBottom: 8,
            }}
          >
            Verify Your Identity
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: COLORS.onSurfaceVariant,
              textAlign: 'center',
            }}
          >
            Upload the required documents to finalize your registration and start saving food.
          </Text>
        </View>

        {/* Documents */}
        <View style={{ paddingHorizontal: 20, gap: 20, marginBottom: 100 }}>
          {documents.map((doc) => (
            <View key={doc.id} style={{ gap: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: COLORS.onSurface,
                  }}
                >
                  {doc.label}
                </Text>
                {!doc.required && (
                  <Text
                    style={{
                      fontSize: 11,
                      color: COLORS.primary,
                      fontWeight: '700',
                    }}
                  >
                    {doc.description}
                  </Text>
                )}
              </View>

              <Pressable
                onPress={() => handleDocumentUpload(doc.id)}
                disabled={isLoading}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: uploadedDocuments[doc.id]
                      ? COLORS.primary
                      : COLORS.outline,
                    borderRadius: 12,
                    paddingVertical: 32,
                    paddingHorizontal: 16,
                    backgroundColor: uploadedDocuments[doc.id]
                      ? `${COLORS.primaryContainer}10`
                      : COLORS.surfaceContainerLowest,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 32,
                      marginBottom: 8,
                    }}
                  >
                    {uploadedDocuments[doc.id] ? '✓' : doc.icon}
                  </Text>
                  {uploadedDocuments[doc.id] ? (
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: COLORS.onSurface,
                      }}
                    >
                      {doc.id}.pdf selected
                    </Text>
                  ) : (
                    <>
                      <Text
                        style={{
                          fontSize: 13,
                          color: COLORS.onSurfaceVariant,
                          textAlign: 'center',
                          marginBottom: 4,
                        }}
                      >
                        Click to upload or drag and drop
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: COLORS.outlineVariant,
                        }}
                      >
                        {doc.subtitle}
                      </Text>
                    </>
                  )}
                </View>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Certification Checkbox */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: COLORS.outline,
            marginBottom: 20,
            marginTop: 20,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <Checkbox
              status={agreedToCertification ? 'checked' : 'unchecked'}
              onPress={() => setAgreedToCertification(!agreedToCertification)}
              disabled={isLoading}
              color={COLORS.primary}
            />
            <Text
              style={{
                fontSize: 14,
                color: COLORS.onSurfaceVariant,
                flex: 1,
                lineHeight: 20,
              }}
            >
              I certify the documents are accurate and valid. I understand that falsifying information will lead to immediate account suspension.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          paddingTop: 16,
          backgroundColor: COLORS.surfaceContainerLowest,
          borderTopWidth: 1,
          borderTopColor: COLORS.outline,
        }}
      >
        <Button
          mode="contained"
          onPress={() => {
            try {
              clearError();
              
              // Check certification
              if (!agreedToCertification) {
                showError('Please agree to the certification', 2000);
                return;
              }
              
              // Check required documents
              const missingRequired = documents
                .filter(doc => doc.required)
                .filter(doc => !uploadedDocuments[doc.id])
                .map(doc => doc.label);
              
              if (missingRequired.length > 0) {
                showError(`Please upload: ${missingRequired.join(', ')}`, 3000);
                return;
              }
              
              handleSubmit?.();
            } catch (error) {
              showError(getErrorMessage(error), 3000);
            }
          }}
          disabled={isLoading || !agreedToCertification}
          loading={isLoading}
          style={{
            backgroundColor: COLORS.primary,
            borderRadius: 12,
            paddingVertical: 8,
          }}
          labelStyle={{
            fontSize: 14,
            fontWeight: '600',
          }}
        >
          {isLoading ? 'Submitting...' : 'Submit Documents'}
        </Button>
      </View>

      {/* Toast Notification - For Document Errors */}
      <Snackbar
        visible={showToast}
        onDismiss={() => setShowToast(false)}
        duration={2000}
        style={{
          backgroundColor: COLORS.inverseSurface,
        }}
      >
        <Text style={{ color: COLORS.inverseOnSurface, fontSize: 13 }}>
          {toastMessage}
        </Text>
      </Snackbar>

      {/* Error Toast - For API/System Errors */}
      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={3000}
      />
    </View>
  );
}

export default SignUpVerificationScreen;
