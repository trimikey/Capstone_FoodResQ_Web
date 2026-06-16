import React from 'react';
import {
  SelectRoleScreen as SelectRoleForm,
  UserRole,
} from '../../components/SelectRoleScreen';

interface SelectRoleScreenProps {
  navigation: any;
}

/**
 * Select Role Screen Container
 * First step of onboarding flow
 */
export default function SelectRoleScreen({ navigation }: SelectRoleScreenProps) {
  const handleSelectRole = (role: UserRole) => {
    // Navigate to appropriate signup flow based on role
    if (role === 'individual') {
      // Individual user -> Sign Up with recipient details
      navigation.navigate('SignUpBasic', {
        role: 'receiver',
        recipientType: 'individual',
      });
    } else if (role === 'charity') {
      // Charity organization -> Sign Up with charity details
      navigation.navigate('SignUpBasic', {
        role: 'receiver',
        recipientType: 'charity',
      });
    } else if (role === 'volunteer') {
      // Volunteer -> Different signup flow
      navigation.navigate('SignUpBasic', {
        role: 'volunteer',
      });
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SelectRoleForm
      onSelectRole={handleSelectRole}
      onBack={handleBack}
      isLoading={false}
    />
  );
}
