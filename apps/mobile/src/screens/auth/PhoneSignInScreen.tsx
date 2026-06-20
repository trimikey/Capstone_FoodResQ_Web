import React, { useState } from 'react';
import Toast from 'react-native-toast-message';
import PhoneSignInForm from '../../components/PhoneSignInScreen';
import { signInWithPhone } from '../../services/firebaseAuth';
import { getErrorMessage } from '../../hooks/useErrorHandler';

interface PhoneSignInScreenProps {
  navigation: any;
  route?: any;
}

/**
 * Phone Sign-In Container — gửi OTP qua Firebase rồi điều hướng sang màn nhập OTP.
 */
export default function PhoneSignInScreen({ navigation }: PhoneSignInScreenProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmitPhone = async (phone: string) => {
    try {
      setIsLoading(true);
      await signInWithPhone(phone);
      Toast.show({ type: 'success', text1: 'Đã gửi mã OTP', text2: `Tới số ${phone}` });
      navigation.navigate('OtpVerification', { phone, type: 'phone_login' });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Gửi OTP thất bại',
        text2: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PhoneSignInForm
      onSubmitPhone={handleSubmitPhone}
      onBack={() => navigation.goBack()}
      isLoading={isLoading}
    />
  );
}
