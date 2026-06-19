import React, { useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  SignUpRecipientScreen as SignUpRecipientForm,
  SignUpRecipientInput,
} from '../../components/SignUpRecipientScreen';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage } from '../../hooks/useErrorHandler';

interface SignUpRecipientScreenProps {
  navigation: any;
  route: any;
}

/**
 * Sign Up Recipient Screen Container — BƯỚC CUỐI của đăng ký receiver.
 * Đăng ký hoàn tất ngay tại đây (register -> Home). Xác minh tài liệu tách
 * khỏi luồng đăng ký, làm sau ở Profile (tài khoản tạo ở trạng thái
 * pending_verification).
 */
export default function SignUpRecipientScreen({
  navigation,
  route,
}: SignUpRecipientScreenProps) {
  const { register } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const basicInfo = route?.params?.basicInfo || {};

  const handleSuccess = async (recipientData: SignUpRecipientInput) => {
    try {
      setIsSubmitting(true);
      // Store register chỉ lấy email/password/name->fullName/role
      await register({ ...basicInfo, role: 'receiver', ...recipientData } as any);

      Toast.show({
        type: 'success',
        text1: 'Đăng ký thành công',
        text2: 'Chào mừng bạn đến với FoodResQ',
      });
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Đăng ký thất bại',
        text2: getErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SignUpRecipientForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      isLoading={isSubmitting}
    />
  );
}
