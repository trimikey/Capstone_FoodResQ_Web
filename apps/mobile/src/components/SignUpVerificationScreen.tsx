import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Snackbar, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import ErrorToast from './ErrorToast';
import { FadeInUp } from './ui/Motion';
import {
  AuthCard,
  AuthHeader,
  AuthIntro,
  AuthScaffold,
  ProgressDots,
  authStyles,
} from './auth/AuthLayout';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

interface DocumentUploadState {
  [key: string]: boolean;
}

interface VerificationDocument {
  id: string;
  label: string;
  description: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  required: boolean;
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
  const [agreedToCertification, setAgreedToCertification] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<DocumentUploadState>({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const documents: VerificationDocument[] = [
    ...(volunteerRole
      ? []
      : [
          {
            id: 'business_license',
            label: 'Giấy phép / hồ sơ cơ sở',
            description: 'Tuỳ chọn cho provider hoặc tổ chức',
            subtitle: 'PDF, JPG hoặc PNG, tối đa 5MB',
            icon: 'file-document-outline' as const,
            required: false,
          },
        ]),
    {
      id: 'id_card',
      label: 'Giấy tờ tùy thân',
      description: 'Bắt buộc',
      subtitle: 'Ảnh mặt trước và mặt sau',
      icon: 'card-account-details-outline',
      required: true,
    },
    ...(recipientType === 'individual'
      ? [
          {
            id: 'income_proof',
            label: 'Giấy tờ chứng minh hoàn cảnh',
            description: 'Tuỳ chọn',
            subtitle: 'Sao kê, giấy xác nhận hoặc tài liệu liên quan',
            icon: 'chart-box-outline' as const,
            required: false,
          },
        ]
      : []),
    ...(volunteerRole
      ? [
          {
            id: 'food_safety',
            label: 'Chứng nhận an toàn thực phẩm',
            description: 'Tuỳ chọn cho vai trò bếp',
            subtitle: 'Tài liệu chứng nhận còn hiệu lực',
            icon: 'shield-check-outline' as const,
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
    setToastMessage(uploadedDocuments[docId] ? 'Đã bỏ chọn tài liệu' : 'Đã chọn tài liệu');
    setShowToast(true);
  };

  const handleSubmit = () => {
    try {
      clearError();
      if (!agreedToCertification) {
        showError('Bạn cần xác nhận thông tin là chính xác.', 2000);
        return;
      }

      const missingRequired = documents
        .filter((doc) => doc.required)
        .filter((doc) => !uploadedDocuments[doc.id])
        .map((doc) => doc.label);

      if (missingRequired.length > 0) {
        showError(`Vui lòng tải lên: ${missingRequired.join(', ')}`, 3000);
        return;
      }

      onSuccess?.();
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  return (
    <AuthScaffold
      footer={
        <Button
          mode="contained"
          onPress={handleSubmit}
          disabled={isLoading || !agreedToCertification}
          loading={isLoading}
          buttonColor={COLORS.primary}
          style={authStyles.primaryButton}
          contentStyle={authStyles.buttonContent}
          labelStyle={authStyles.buttonLabel}
          accessibilityLabel="Gửi hồ sơ xác minh"
          accessibilityState={{ disabled: isLoading || !agreedToCertification }}
        >
          {isLoading ? 'Đang gửi' : 'Gửi hồ sơ'}
        </Button>
      }
    >
      <AuthHeader
        onBack={onBack}
        disabled={isLoading}
        title="FoodResQ"
        subtitle="Xác minh hồ sơ"
        right={<Text style={styles.stepText}>3/3</Text>}
      />

      <ProgressDots total={3} active={2} label="Bước 3: Tài liệu xác minh" />

      <AuthIntro
        icon="file-upload-outline"
        eyebrow="Xác minh"
        title="Tải lên tài liệu cần thiết"
        description="Các tài liệu giúp FoodResQ xác minh hồ sơ trước khi mở đầy đủ tính năng cho tài khoản."
      />

      <FadeInUp delay={80}>
        <AuthCard>
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              uploaded={!!uploadedDocuments[doc.id]}
              disabled={isLoading}
              onPress={() => handleDocumentUpload(doc.id)}
            />
          ))}

          <Pressable
            onPress={() => setAgreedToCertification((current) => !current)}
            disabled={isLoading}
            style={({ pressed }) => [styles.certBox, pressed && authStyles.pressed]}
            accessibilityRole="checkbox"
            accessibilityLabel="Xác nhận tài liệu chính xác"
            accessibilityState={{ checked: agreedToCertification, disabled: isLoading }}
          >
            <Checkbox
              status={agreedToCertification ? 'checked' : 'unchecked'}
              disabled={isLoading}
              color={COLORS.primary}
            />
            <Text style={styles.certText}>
              Tôi xác nhận các tài liệu là chính xác và hiểu rằng thông tin sai có thể khiến tài khoản bị tạm ngưng.
            </Text>
          </Pressable>
        </AuthCard>
      </FadeInUp>

      <Snackbar
        visible={showToast}
        onDismiss={() => setShowToast(false)}
        duration={1800}
        style={styles.snackbar}
      >
        <Text style={styles.snackbarText}>{toastMessage}</Text>
      </Snackbar>

      <ErrorToast
        visible={isVisible}
        message={error?.message || ''}
        onDismiss={clearError}
        duration={3000}
      />
    </AuthScaffold>
  );
}

function DocumentCard({
  doc,
  uploaded,
  disabled,
  onPress,
}: {
  doc: VerificationDocument;
  uploaded: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.documentCard,
        uploaded && styles.documentCardUploaded,
        pressed && authStyles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${uploaded ? 'Bỏ chọn' : 'Chọn'} ${doc.label}`}
      accessibilityState={{ selected: uploaded, disabled }}
    >
      <View style={[styles.documentIcon, uploaded && styles.documentIconUploaded]}>
        <MaterialCommunityIcons
          name={uploaded ? 'check-circle-outline' : doc.icon}
          size={25}
          color={uploaded ? COLORS.success : COLORS.primary}
        />
      </View>
      <View style={styles.documentCopy}>
        <View style={styles.documentTitleRow}>
          <Text style={styles.documentTitle}>{doc.label}</Text>
          <Text style={[styles.documentBadge, doc.required && styles.documentBadgeRequired]}>
            {doc.required ? 'Bắt buộc' : 'Tuỳ chọn'}
          </Text>
        </View>
        <Text style={styles.documentDescription}>{doc.description}</Text>
        <Text style={styles.documentSubtitle}>
          {uploaded ? `${doc.id}.pdf đã chọn` : doc.subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
  },
  documentCard: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceContainerLow,
    padding: spacing.md,
  },
  documentCardUploaded: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.primaryContainer,
  },
  documentIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentIconUploaded: {
    backgroundColor: COLORS.surface,
  },
  documentCopy: {
    flex: 1,
    minWidth: 0,
  },
  documentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  documentTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  documentBadge: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.primary,
  },
  documentBadgeRequired: {
    color: COLORS.error,
  },
  documentDescription: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.onSurfaceVariant,
  },
  documentSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
  },
  certBox: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: COLORS.surfaceContainerLow,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
  },
  certText: {
    flex: 1,
    paddingTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.onSurfaceVariant,
  },
  snackbar: {
    backgroundColor: COLORS.onSurface,
  },
  snackbarText: {
    color: COLORS.surface,
    fontSize: 13,
  },
});

export default SignUpVerificationScreen;
