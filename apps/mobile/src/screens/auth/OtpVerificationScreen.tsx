import React, { useState } from 'react';
import OtpVerificationScreenComponent from '../../components/OtpVerificationScreen';

interface OtpVerificationScreenProps {
  navigation: any;
  route: any;
}

export default function OtpVerificationScreen({
  navigation,
  route,
}: OtpVerificationScreenProps) {
  const { email, type = 'signup_email' } = route.params || {};
  const [isLoading, setIsLoading] = useState(false);

  const handleSuccess = (otp: string) => {
    if (type === 'forgot_password') {
      navigation.navigate('ResetPassword', {
        email,
        otp,
      });
    } else {
      navigation.navigate('SignUpBasic', {
        email,
        verifiedOtp: otp,
      });
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleResend = async () => {
    try {
      setIsLoading(true);
      // TODO: POST /auth/resend-otp
      console.log('OTP resent to:', email);
    } catch (error) {
      console.error('Resend OTP error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OtpVerificationScreenComponent
      email={email || ''}
      type={type}
      onSuccess={handleSuccess}
      onBack={handleBack}
      onResend={handleResend}
      isLoading={isLoading}
    />
  );
}
