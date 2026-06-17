import React, { useEffect } from 'react';
import {
  SignUpRecipientScreen as SignUpRecipientForm,
  SignUpRecipientInput,
} from '../../components/SignUpRecipientScreen';

interface SignUpRecipientScreenProps {
  navigation: any;
  route: any;
}

/**
 * Sign Up Recipient Screen Container
 * Step 2 of signup flow for recipient users
 */
export default function SignUpRecipientScreen({
  navigation,
  route,
}: SignUpRecipientScreenProps) {
  // Retrieve email & password from previous step (Step 1: Basic Info)
  const basicInfo = route?.params?.basicInfo || {};

  const handleSuccess = (recipientData: SignUpRecipientInput) => {
    // Navigate to verification screen or complete signup
    navigation.navigate('SignUpVerification', {
      basicInfo,
      recipientData,
    });
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
