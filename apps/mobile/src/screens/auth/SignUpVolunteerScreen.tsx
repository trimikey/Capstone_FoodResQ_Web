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
 * Sign Up Volunteer Screen Container
 * Step 3B of signup flow - Specializations & Skills
 */
export default function SignUpVolunteerScreen({
  navigation,
  route,
}: SignUpVolunteerScreenProps) {
  const basicInfo = route?.params?.basicInfo || {};

  const handleSuccess = (volunteerData: VolunteerInfoInput) => {
    navigation.navigate('SignUpVerification', {
      basicInfo,
      volunteerData,
      type: 'volunteer',
    });
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
