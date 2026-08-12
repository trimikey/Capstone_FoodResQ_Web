import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Snackbar, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useErrorHandler, getErrorMessage } from '../hooks/useErrorHandler';
import { captureImage, pickImageFromLibrary, type CapturedImage } from '../services/faceCapture';
import ErrorToast from './ErrorToast';
import { AppImage } from './ui/AppImage';
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

export interface VerificationSubmitData {
  selfie?: CapturedImage;
  charityEvidence?: CapturedImage[];
}

interface SignUpVerificationScreenProps {
  onSuccess?: (data: VerificationSubmitData) => void;
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
  const [charityDocuments, setCharityDocuments] = useState<Record<string, CapturedImage | null>>({
    organization_license: null,
    representative_id: null,
  });
  const [charityStep, setCharityStep] = useState(0);
  const [selfie, setSelfie] = useState<CapturedImage | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const { error, isVisible, showError, clearError } = useErrorHandler();

  const needsReceiverSelfie = !volunteerRole && recipientType === 'individual';
  const isCharityVerification = !volunteerRole && recipientType === 'charity';

  const charityRequiredDocs = [
    {
      id: 'organization_license',
      label: 'Giấy phép / giấy giới thiệu',
      description: 'Chụp rõ giấy phép hoạt động, giấy giới thiệu hoặc quyết định thành lập của tổ chức.',
      icon: 'file-certificate-outline' as const,
    },
    {
      id: 'representative_id',
      label: 'Giấy tờ người đại diện',
      description: 'Chụp rõ CCCD hoặc giấy tờ tùy thân của người đại diện đăng ký tổ chức.',
      icon: 'card-account-details-outline' as const,
    },
  ];

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
      description: needsReceiverSelfie ? 'Tuỳ chọn' : 'Bắt buộc',
      subtitle: 'Ảnh mặt trước và mặt sau',
      icon: 'card-account-details-outline',
      required: !needsReceiverSelfie,
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

  const handlePickSelfie = async (fromCamera: boolean) => {
    try {
      clearError();
      const image = fromCamera ? await captureImage('face', 'proof') : await pickImageFromLibrary('proof');
      if (image) setSelfie(image);
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  const handlePickCharityDocument = async (docId: string, fromCamera: boolean) => {
    try {
      clearError();
      const image = fromCamera ? await captureImage('id_card', 'proof') : await pickImageFromLibrary('proof');
      if (image) {
        setCharityDocuments((prev) => ({ ...prev, [docId]: image }));
      }
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  const handleSubmit = () => {
    try {
      clearError();
      if (needsReceiverSelfie && !selfie) {
        showError('Cần chụp selfie rõ khuôn mặt trước khi gửi đăng ký.', 2500);
        return;
      }
      if (needsReceiverSelfie) {
        onSuccess?.({
          ...(selfie ? { selfie } : {}),
        });
        return;
      }
      if (isCharityVerification) {
        if (!agreedToCertification) {
          showError('Bạn cần xác nhận thông tin giấy tờ là chính xác.', 2000);
          return;
        }
        const evidence = charityRequiredDocs.map((doc) => charityDocuments[doc.id]);
        const missing = charityRequiredDocs.filter((doc) => !charityDocuments[doc.id]).map((doc) => doc.label);
        if (missing.length > 0) {
          showError(`Vui lòng tải lên: ${missing.join(', ')}`, 3000);
          return;
        }
        onSuccess?.({ charityEvidence: evidence.filter(Boolean) as CapturedImage[] });
        return;
      }
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

      onSuccess?.({
        ...(selfie ? { selfie } : {}),
      });
    } catch (error) {
      showError(getErrorMessage(error), 3000);
    }
  };

  const charityDocumentsReady =
    !isCharityVerification ||
    (charityRequiredDocs.every((doc) => !!charityDocuments[doc.id]) && agreedToCertification);
  const submitDisabled =
    isLoading ||
    (needsReceiverSelfie ? !selfie : isCharityVerification ? !charityDocumentsReady : !agreedToCertification);

  return (
    <AuthScaffold
      footer={
        <Button
          mode="contained"
          onPress={handleSubmit}
          disabled={submitDisabled}
          loading={isLoading}
          buttonColor={COLORS.primary}
          style={authStyles.primaryButton}
          contentStyle={authStyles.buttonContent}
          labelStyle={authStyles.buttonLabel}
          accessibilityLabel="Gửi hồ sơ xác minh"
          accessibilityState={{ disabled: submitDisabled }}
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
        icon={needsReceiverSelfie ? 'face-man-profile' : 'file-upload-outline'}
        eyebrow="Xác minh"
        title={needsReceiverSelfie ? 'Quét gương mặt' : 'Tải lên tài liệu cần thiết'}
        description={needsReceiverSelfie
          ? 'Ảnh selfie được gửi kèm hồ sơ để backend nhận diện khuôn mặt trước khi tạo tài khoản.'
          : 'Các tài liệu giúp FoodResQ xác minh hồ sơ trước khi mở đầy đủ tính năng cho tài khoản.'}
      />

      <FadeInUp delay={80}>
        <AuthCard>
          {needsReceiverSelfie ? (
            <View style={styles.selfieBox}>
              {selfie ? (
                <View style={styles.selfiePreviewWrap}>
                  <AppImage source={{ uri: selfie.uri }} style={styles.selfiePreview} contentFit="cover" />
                </View>
              ) : null}
              <View style={styles.selfieText}>
                <MaterialCommunityIcons
                  name={selfie ? 'check-decagram' : 'face-man-profile'}
                  size={26}
                  color={selfie ? COLORS.teal : COLORS.onSurfaceVariant}
                />
                <View style={styles.selfieCopy}>
                  <Text style={styles.selfieTitle}>
                    {selfie ? 'Đã có ảnh selfie' : 'Chụp ảnh khuôn mặt'}
                  </Text>
                  <Text style={styles.selfieSub} numberOfLines={2}>
                    {selfie ? selfie.name : 'Chụp rõ mặt, đủ sáng, không che mắt/mũi/miệng.'}
                  </Text>
                </View>
              </View>
              <View style={styles.selfieActions}>
                <Button mode="contained-tonal" icon="camera" onPress={() => handlePickSelfie(true)} disabled={isLoading}>
                  {selfie ? 'Chụp lại' : 'Chụp'}
                </Button>
                <Button mode="outlined" icon="image" onPress={() => handlePickSelfie(false)} disabled={isLoading}>
                  {selfie ? 'Chọn lại' : 'Thư viện'}
                </Button>
              </View>
            </View>
          ) : null}

          {!needsReceiverSelfie ? (
            <>
              {isCharityVerification ? (
                <CharityDocumentWizard
                  docs={charityRequiredDocs}
                  activeIndex={charityStep}
                  uploads={charityDocuments}
                  disabled={isLoading}
                  onChangeStep={setCharityStep}
                  onCamera={(docId) => handlePickCharityDocument(docId, true)}
                  onLibrary={(docId) => handlePickCharityDocument(docId, false)}
                />
              ) : (
                documents.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    uploaded={!!uploadedDocuments[doc.id]}
                    disabled={isLoading}
                    onPress={() => handleDocumentUpload(doc.id)}
                  />
                ))
              )}

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
            </>
          ) : null}
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

function CharityDocumentWizard({
  docs,
  activeIndex,
  uploads,
  disabled,
  onChangeStep,
  onCamera,
  onLibrary,
}: {
  docs: {
    id: string;
    label: string;
    description: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
  }[];
  activeIndex: number;
  uploads: Record<string, CapturedImage | null>;
  disabled?: boolean;
  onChangeStep: (index: number) => void;
  onCamera: (docId: string) => void;
  onLibrary: (docId: string) => void;
}) {
  const doc = docs[activeIndex];
  const uploaded = uploads[doc.id];

  return (
    <View style={styles.wizard}>
      <View style={styles.wizardTabs}>
        {docs.map((item, index) => {
          const done = !!uploads[item.id];
          const active = index === activeIndex;
          return (
            <Pressable
              key={item.id}
              onPress={() => onChangeStep(index)}
              disabled={disabled}
              style={[styles.wizardTab, active && styles.wizardTabActive, done && styles.wizardTabDone]}
              accessibilityRole="button"
              accessibilityLabel={`Tài liệu ${index + 1}: ${item.label}`}
              accessibilityState={{ selected: active, disabled }}
            >
              <MaterialCommunityIcons
                name={done ? 'check-circle-outline' : item.icon}
                size={18}
                color={done ? COLORS.success : active ? COLORS.primary : COLORS.onSurfaceVariant}
              />
              <Text style={[styles.wizardTabText, active && styles.wizardTabTextActive]}>{index + 1}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.documentSlide}>
        <View style={styles.documentSlideHeader}>
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
              <Text style={[styles.documentBadge, styles.documentBadgeRequired]}>Bắt buộc</Text>
            </View>
            <Text style={styles.documentDescription}>{doc.description}</Text>
          </View>
        </View>

        {uploaded ? (
          <View style={styles.documentPreviewWrap}>
            <AppImage source={{ uri: uploaded.uri }} style={styles.documentPreview} contentFit="cover" />
          </View>
        ) : (
          <View style={styles.documentEmpty}>
            <MaterialCommunityIcons name="image-plus" size={32} color={COLORS.onSurfaceVariant} />
            <Text style={styles.documentEmptyText}>Chưa có ảnh tài liệu</Text>
          </View>
        )}

        <View style={styles.selfieActions}>
          <Button mode="contained-tonal" icon="camera" onPress={() => onCamera(doc.id)} disabled={disabled}>
            {uploaded ? 'Chụp lại' : 'Chụp'}
          </Button>
          <Button mode="outlined" icon="image" onPress={() => onLibrary(doc.id)} disabled={disabled}>
            {uploaded ? 'Chọn lại' : 'Thư viện'}
          </Button>
        </View>

        <View style={styles.wizardNav}>
          <Button
            mode="text"
            onPress={() => onChangeStep(Math.max(0, activeIndex - 1))}
            disabled={disabled || activeIndex === 0}
          >
            Trước
          </Button>
          <Text style={styles.wizardCount}>{activeIndex + 1}/{docs.length}</Text>
          <Button
            mode="text"
            onPress={() => onChangeStep(Math.min(docs.length - 1, activeIndex + 1))}
            disabled={disabled || activeIndex === docs.length - 1}
          >
            Tiếp
          </Button>
        </View>
      </View>
    </View>
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
  selfieBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceContainerLow,
    padding: spacing.md,
    gap: spacing.md,
  },
  selfiePreviewWrap: {
    height: 280,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  selfiePreview: {
    width: '100%',
    height: '100%',
  },
  selfieText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selfieCopy: {
    flex: 1,
    minWidth: 0,
  },
  selfieTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.onSurface,
  },
  selfieSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.onSurfaceVariant,
  },
  selfieActions: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  wizard: {
    gap: spacing.md,
  },
  wizardTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  wizardTab: {
    height: 42,
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceContainerLow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  wizardTabActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
  },
  wizardTabDone: {
    borderColor: COLORS.success,
  },
  wizardTabText: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.onSurfaceVariant,
  },
  wizardTabTextActive: {
    color: COLORS.primary,
  },
  documentSlide: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceContainerLow,
    padding: spacing.md,
    gap: spacing.md,
  },
  documentSlideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  documentPreviewWrap: {
    height: 260,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  documentPreview: {
    width: '100%',
    height: '100%',
  },
  documentEmpty: {
    height: 180,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  documentEmptyText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
  },
  wizardNav: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wizardCount: {
    fontSize: 13,
    fontWeight: '900',
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
