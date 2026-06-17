import React from 'react';
import { SignUpBasicScreen as SignUpBasicForm } from '../../components/SignUpBasicScreen';
import type { SignUpBasicInfoInput } from '../../utils/validators';

interface SignUpBasicScreenProps {
  navigation: any;
  route: any;
}

/**
 * Sign Up Basic Screen Container
 * Step 2 of signup flow - Email/Password/Name
 */
export default function SignUpBasicScreen({
  navigation,
  route,
}: SignUpBasicScreenProps) {
  const selectedRole = route?.params?.role || 'receiver';

  const handleSuccess = (data: SignUpBasicInfoInput) => {
    // Navigate to role-specific screen based on selectedRole
    if (selectedRole === 'volunteer') {
      navigation.navigate('SignUpVolunteer', {
        basicInfo: data,
      });
    } else {
      // Individual receiver -> recipient details
      navigation.navigate('SignUpRecipient', {
        basicInfo: data,
      });
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
      isLoading={false}
    />
  );
}
