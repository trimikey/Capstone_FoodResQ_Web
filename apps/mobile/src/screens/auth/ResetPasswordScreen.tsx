import React, { useState } from 'react';
import ResetPasswordScreenComponent from '../../components/ResetPasswordScreen';

interface ResetPasswordScreenProps {
  navigation: any;
  route: any;
}

export default function ResetPasswordScreen({
  navigation,
  route,
}: ResetPasswordScreenProps) {
  const { email, otp } = route.params || {};
  const [isLoading, setIsLoading] = useState(false);

  const handleSuccess = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'SignIn' }],
    });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <ResetPasswordScreenComponent
      email={email || ''}
      otp={otp || ''}
      onSuccess={handleSuccess}
      onBack={handleBack}
      isLoading={isLoading}
    />
  );
}
