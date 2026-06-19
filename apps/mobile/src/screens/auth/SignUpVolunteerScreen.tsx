import React, { useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  SignUpVolunteerScreen as SignUpVolunteerForm,
  VolunteerInfoInput,
} from '../../components/SignUpVolunteerScreen';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage } from '../../hooks/useErrorHandler';

interface SignUpVolunteerScreenProps {
  navigation: any;
  route: any;
}

/**
 * Sign Up Volunteer Screen Container — BƯỚC CUỐI của đăng ký volunteer.
 * Đăng ký hoàn tất ngay tại đây (register -> Home). Xác minh (ATTP/GPLX...)
 * tách khỏi đăng ký, làm sau ở Profile.
 */
export default function SignUpVolunteerScreen({
  navigation,
  route,
}: SignUpVolunteerScreenProps) {
  const { register } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const basicInfo = route?.params?.basicInfo || {};

  const handleSuccess = async (volunteerData: VolunteerInfoInput) => {
    try {
      setIsSubmitting(true);
      await register({ ...basicInfo, role: 'volunteer', ...volunteerData } as any);

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
    <SignUpVolunteerForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      isLoading={isSubmitting}
    />
  );
}
