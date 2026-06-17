# Error Handling System - FoodResQ Mobile

## Components Created

### 1. **useErrorHandler Hook** 
Path: `src/hooks/useErrorHandler.ts`

```tsx
const { error, isVisible, showError, clearError } = useErrorHandler();

// Show error message (auto-hide after 3000ms)
showError("Invalid credentials", 3000);

// Or pass structured error object
showError({
  message: "Network error",
  code: "ERR_NETWORK",
  timestamp: Date.now()
}, 5000);

// Clear error manually
clearError();
```

### 2. **ErrorToast Component**
Path: `src/components/ErrorToast.tsx`

Usage:
```tsx
<ErrorToast
  visible={isVisible}
  message={error?.message || ''}
  onDismiss={clearError}
  duration={3000}
  actionLabel="Retry"  // Optional
  onAction={handleRetry}  // Optional
/>
```

Features:
- ✅ Bottom toast notification (Material Design)
- ✅ Auto-dismiss after duration
- ✅ Manual dismiss button
- ✅ Optional action button (Retry, etc)
- ✅ Red error styling

## Updated Screens

| Screen | Error Handling | Status |
|--------|---|---|
| SignInScreen | ✅ useErrorHandler + ErrorToast | DONE |
| ForgotPasswordScreen | ✅ useErrorHandler + ErrorToast | DONE |
| OtpVerificationScreen | ✅ useErrorHandler + ErrorToast | DONE |
| ResetPasswordScreen | ✅ useErrorHandler + ErrorToast | DONE |
| SignUpBasicScreen | Zod validation errors only | ⚠️ TODO |
| SignUpRecipientScreen | Zod validation errors only | ⚠️ TODO |
| SignUpVolunteerScreen | Zod validation errors only | ⚠️ TODO |
| SignUpVerificationScreen | Basic console.error | ⚠️ TODO |

## Helper Functions

### `getErrorMessage(error: unknown): string`
Extracts error message from various error types:
- Plain strings
- Error objects
- Axios/fetch responses
- Custom error objects with `message` property

### `handleApiError(error: unknown): ErrorMessage`
Processes API errors and returns structured error with code and timestamp.

## Implementation Pattern

Every API call should follow:

```tsx
const { error, isVisible, showError, clearError } = useErrorHandler();

const handleSubmit = async (data) => {
  try {
    clearError();  // Clear previous errors
    setIsLoading(true);
    
    // Make API call
    const response = await apiClient.post('/endpoint', data);
    
    // Handle success
    onSuccess?.(response.data);
    
  } catch (error) {
    // Show error toast
    const message = getErrorMessage(error);
    showError(message, 3000);  // 3 second duration
    
    console.error('Operation error:', error);
  } finally {
    setIsLoading(false);
  }
};

// Render ErrorToast at bottom of screen
<ErrorToast
  visible={isVisible}
  message={error?.message || ''}
  onDismiss={clearError}
  duration={3000}
/>
```

## Error Types Handled

1. **Network Errors**
   - "Network request failed"
   - "Connection timeout"
   - "No internet connection"

2. **Validation Errors** (Zod)
   - Inline field errors + Toast for API validation

3. **API Errors**
   - Server error messages
   - Invalid credentials
   - User not found
   - Email already exists
   - OTP expired
   - Token invalid

4. **User-Friendly Messages**
   - Specific message for each error type
   - Actionable feedback (Retry, Try again, etc)

## Next Steps

- [ ] Update SignUpBasicScreen with error toast
- [ ] Update SignUpRecipientScreen with error toast
- [ ] Update SignUpVolunteerScreen with error toast
- [ ] Update SignUpVerificationScreen with error toast
- [ ] Wire up actual API calls with error handling
- [ ] Add error logging/monitoring (Sentry, Firebase Crashlytics)
- [ ] Add offline mode detection & messaging
