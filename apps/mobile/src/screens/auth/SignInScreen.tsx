import React, { useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import SignInForm from '../../components/SignInScreen';

interface SignInScreenProps {
  navigation: any; // React Navigation type
}

/**
 * Sign In Screen Container
 * Handles navigation and auth logic
 */
export default function SignInScreen({ navigation }: SignInScreenProps) {
  const { login, isAuthenticated } = useAuth();

  // Redirect to home if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    }
  }, [isAuthenticated, navigation]);

  const handleSignInSuccess = async () => {
    // Navigate to home screen after successful login
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  };

  const handleNavigateToSignUp = () => {
    navigation.navigate('SignUp');
  };

  const handleNavigateToForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };

  return (
    <SignInForm
      onSignInSuccess={handleSignInSuccess}
      onNavigateToSignUp={handleNavigateToSignUp}
      onNavigateToForgotPassword={handleNavigateToForgotPassword}
    />
  );
}
