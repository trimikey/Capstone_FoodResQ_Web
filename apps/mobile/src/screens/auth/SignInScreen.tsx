import React, { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import SignInForm from '../../components/SignInScreen';

interface SignInScreenProps {
  navigation: any; // React Navigation type
  route?: any;
}

/**
 * Sign In Screen Container
 * Handles navigation and auth logic
 */
export default function SignInScreen({ navigation }: SignInScreenProps) {
  const { login, isAuthenticated } = useAuth();

  // Sau login thành công có 2 nguồn cùng muốn điều hướng (effect isAuthenticated
  // + callback onSignInSuccess). Gọi router.replace 2 lần liên tiếp giữa lúc màn
  // sign-in đang unmount làm Fabric crash (RetryableMountingLayerException:
  // Unable to find viewState) — nên chỉ cho phép reset đúng MỘT lần.
  const didNavigate = useRef(false);
  const goHome = useCallback(() => {
    if (didNavigate.current) return;
    didNavigate.current = true;
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  }, [navigation]);

  // Redirect to home if already authenticated
  useEffect(() => {
    if (isAuthenticated) goHome();
  }, [isAuthenticated, goHome]);

  const handleSignInSuccess = async () => {
    // Navigate to home screen after successful login
    goHome();
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
