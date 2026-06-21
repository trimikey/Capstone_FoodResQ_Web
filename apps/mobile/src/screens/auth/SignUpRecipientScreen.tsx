import React from 'react';
import {
  SignUpRecipientScreen as SignUpRecipientForm,
  SignUpRecipientInput,
} from '../../components/SignUpRecipientScreen';

interface SignUpRecipientScreenProps {
  navigation: any;
  route: any;
}

/**
 * Recipient Details — KHÔNG còn trong luồng đăng ký (đăng ký hoàn tất ở bước Basic).
 * Màn này để dành cho HOÀN THIỆN HỒ SƠ sau đăng ký (ID, địa chỉ...).
 * TODO [Profile]: nối API cập nhật hồ sơ (PATCH /users/me) thay vì điều hướng Home.
 */
export default function SignUpRecipientScreen({
  navigation,
}: SignUpRecipientScreenProps) {
  const handleSuccess = (_recipientData: SignUpRecipientInput) => {
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SignUpRecipientForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      isLoading={false}
    />
  );
}
