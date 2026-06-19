import React from 'react';
import {
  SignUpVolunteerScreen as SignUpVolunteerForm,
  VolunteerInfoInput,
} from '../../components/SignUpVolunteerScreen';

interface SignUpVolunteerScreenProps {
  navigation: any;
  route: any;
}

/**
 * Volunteer Details — KHÔNG còn trong luồng đăng ký (đăng ký hoàn tất ở bước Basic).
 * Màn này để dành cho HOÀN THIỆN HỒ SƠ sau đăng ký (specialization, phương tiện...).
 * TODO [Profile]: nối API cập nhật hồ sơ thay vì điều hướng Home.
 */
export default function SignUpVolunteerScreen({
  navigation,
}: SignUpVolunteerScreenProps) {
  const handleSuccess = (_volunteerData: VolunteerInfoInput) => {
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SignUpVolunteerForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      isLoading={false}
    />
  );
}
