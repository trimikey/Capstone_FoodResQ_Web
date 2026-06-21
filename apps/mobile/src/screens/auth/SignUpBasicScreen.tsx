import React, { useState } from 'react';
import Toast from 'react-native-toast-message';
import { SignUpBasicScreen as SignUpBasicForm } from '../../components/SignUpBasicScreen';
import type { SignUpBasicInfoInput } from '../../utils/validators';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage } from '../../hooks/useErrorHandler';

interface SignUpBasicScreenProps {
  navigation: any;
  route: any;
}

/**
 * Sign Up Basic Screen Container — BƯỚC CUỐI của đăng ký.
 * Đăng ký tối thiểu: tên/email/mật khẩu + role (role chọn ở SelectRole).
 * ID/địa chỉ/đặc thù role (Recipient/Volunteer) ĐÃ BỎ khỏi luồng đăng ký,
 * hoàn thiện sau ở Hồ sơ (tài khoản tạo ở trạng thái pending_verification).
 */
export default function SignUpBasicScreen({
  navigation,
  route,
}: SignUpBasicScreenProps) {
  const { register } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedRole = route?.params?.role || 'receiver';

  const handleSuccess = async (data: SignUpBasicInfoInput) => {
    try {
      setIsSubmitting(true);
      await register({ ...data, role: selectedRole } as any);

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

  const handleNavigateToSignIn = () => {
    navigation.navigate('SignIn');
  };

  return (
    <SignUpBasicForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      onNavigateToSignIn={handleNavigateToSignIn}
      isLoading={isSubmitting}
    />
  );
}
