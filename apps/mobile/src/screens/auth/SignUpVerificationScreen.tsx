import React from 'react';
import {
  SignUpVerificationScreen as SignUpVerificationForm,
} from '../../components/SignUpVerificationScreen';
import { useAuth } from '../../hooks/useAuth';

interface SignUpVerificationScreenProps {
  navigation: any;
  route: any;
}

/**
 * Sign Up Verification Screen Container
 * Step 4 of signup flow - Document Upload & Verification
 */
export default function SignUpVerificationScreen({
  navigation,
  route,
}: SignUpVerificationScreenProps) {
  const { register } = useAuth();
  const basicInfo = route?.params?.basicInfo || {};
  const volunteerData = route?.params?.volunteerData || {};
  const recipientData = route?.params?.recipientData || {};
  const type = route?.params?.type || 'receiver';

  const handleSuccess = async () => {
    try {
      // Combine all data
      const fullData = {
        ...basicInfo,
        role: type === 'volunteer' ? 'volunteer' : 'receiver',
        ...(type === 'volunteer' ? volunteerData : recipientData),
      };

      // Call register
      await register(fullData as any);

      // Navigate to home on success
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (error) {
      // Handle registration error
      console.error('Registration error:', error);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SignUpVerificationForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      isLoading={false}
      recipientType={recipientData.recipientType || 'individual'}
      volunteerRole={type === 'volunteer'}
    />
  );
}
