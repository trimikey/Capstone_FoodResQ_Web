import React from 'react';
import {
  ForgotPasswordScreen as ForgotPasswordForm,
} from '../../components/ForgotPasswordScreen';

interface ForgotPasswordScreenProps {
  navigation: any;
}

/**
 * Forgot Password Screen Container
 * User enters email to receive password reset link
 */
export default function ForgotPasswordScreen({
  navigation,
}: ForgotPasswordScreenProps) {
  const handleSuccess = (email: string) => {
    // Navigate to reset password screen (user will click email link)
    // Or navigate back to sign in
    navigation.navigate('SignIn');
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleNavigateToSignIn = () => {
    navigation.navigate('SignIn');
  };

  const handleSuccess = (email: string) => {
    // After email submitted, navigate to OTP verification
    navigation.navigate('OtpVerification', {
      email,
      type: 'forgot_password',
    });
  };

  return (
    <ForgotPasswordForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      onNavigateToSignIn={handleNavigateToSignIn}
      isLoading={false}
    />
  );
}
