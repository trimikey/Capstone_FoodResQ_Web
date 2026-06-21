# Sign In Screen Implementation - FoodResQ Mobile

## Overview

Đã implement Sign In screen cho FoodResQ mobile app dựa trên design từ Stitch project (https://stitch.withgoogle.com/projects/17156536877343961972).

## Components & Files Created

### 1. **SignInScreen Component** (`src/components/SignInScreen.tsx`)
Main UI component using React Native Paper.

**Features:**
- Email & password input fields with icons
- Password visibility toggle
- Remember me checkbox
- Forgot password link
- Sign In button (green #10b981)
- Social login buttons (Google, Facebook - placeholders)
- Sign Up link
- Terms & Privacy links
- Loading state handling
- Form validation with Zod

**Props:**
```typescript
interface SignInScreenProps {
  onSignInSuccess?: (user: any) => void;
  onNavigateToSignUp?: () => void;
  onNavigateToForgotPassword?: () => void;
}
```

### 2. **Auth Store** (`src/stores/auth.ts`)
Zustand store for authentication state management.

**State:**
- `user`: Current user object
- `accessToken`: JWT access token
- `refreshToken`: JWT refresh token
- `isLoading`: Loading state
- `error`: Error message
- `isInitialized`: App initialization state

**Methods:**
- `initialize()`: Restore auth on app start
- `login(input)`: Email/password login
- `register(input)`: Register new account
- `logout()`: Logout and clear tokens
- `restoreToken()`: Restore token from AsyncStorage
- `clearError()`: Clear error message

### 3. **API Client** (`src/api/client.ts`)
Axios instance with interceptors for token management.

**Features:**
- Automatic token refresh on 401
- Request interceptor to add Authorization header
- Response interceptor to handle 401 and refresh token
- Error handling and automatic logout on refresh failure
- Defined API endpoints

**Usage:**
```typescript
import apiClient from '../api/client';

// Make API calls
const response = await apiClient.get('/listings');
```

### 4. **Form Validators** (`src/utils/validators.ts`)
Zod schemas for form validation.

**Schemas:**
- `loginSchema`: Email & password validation
- `registerSchema`: Email, password, confirm password, name
- `forgotPasswordSchema`: Email only
- `resetPasswordSchema`: Password & confirm password

### 5. **Auth Hook** (`src/hooks/useAuth.ts`)
Custom hook to use auth store in components.

**Usage:**
```typescript
const { user, isAuthenticated, login, logout, isLoading } = useAuth();
```

### 6. **Screen Container** (`src/screens/auth/SignInScreen.tsx`)
Container component integrating form and navigation.

**Responsibilities:**
- Handle navigation after login
- Redirect if already authenticated
- Connect form to auth store

## Integration Guide

### Step 1: Install Dependencies
```bash
cd apps/mobile
pnpm add react-native-paper react-native-vector-icons
pnpm add @react-navigation/native @react-navigation/bottom-tabs
pnpm add zustand axios
pnpm add react-hook-form @hookform/resolvers zod
pnpm add @react-native-async-storage/async-storage
```

### Step 2: Setup Theme (Optional)
Create `src/theme.ts`:
```typescript
import { MD3LightTheme } from 'react-native-paper';

export const theme = MD3LightTheme.copy({
  colors: {
    primary: '#10b981',
    secondary: '#ff9800',
    background: '#f8f9ff',
    surface: '#ffffff',
  },
});
```

### Step 3: Wrap App with PaperProvider
In your root layout/navigation:
```typescript
import { PaperProvider } from 'react-native-paper';
import { theme } from './src/theme';

export default function RootLayout() {
  return (
    <PaperProvider theme={theme}>
      {/* Your app */}
    </PaperProvider>
  );
}
```

### Step 4: Setup Navigation
```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SignInScreen from './src/screens/auth/SignInScreen';
import HomeScreen from './src/screens/app/HomeScreen';

const Stack = createNativeStackNavigator();

export default function Navigation() {
  const { isAuthenticated, isInitialized } = useAuth();

  if (!isInitialized) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="Home" component={HomeScreen} />
        ) : (
          <Stack.Screen name="SignIn" component={SignInScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

### Step 5: Initialize Auth on App Start
In your main App component:
```typescript
import { useAuth } from './src/hooks/useAuth';

export default function App() {
  const { initialize } = useAuth();

  React.useEffect(() => {
    initialize();
  }, [initialize]);

  return <Navigation />;
}
```

## Color Scheme

### Material Design 3 Colors (from Stitch)
```
Primary Green:       #10b981
Secondary Orange:    #ff9800
Background:          #f8f9ff
Surface:             #ffffff
On Surface:          #121c2a
On Surface Variant:  #6b7280
Error:               #ba1a1a
Outline:             #e5e7eb
```

## Design Details

### Component Specifications
- **Header**: 56px height, centered title, back button
- **Email Input**: Outlined, mail icon, email validation
- **Password Input**: Outlined, lock icon, visibility toggle
- **Helper Text**: 14px, error color for validation errors
- **Buttons**: 52px height, 12px border radius
- **Spacing**: 24px gaps, 20px horizontal margin
- **Typography**: Plus Jakarta Sans, Material Design 3 sizes

### Responsive Design
- Mobile-first approach
- Full width at ≤780px viewport
- Safe area insets for notch/home bar
- ScrollView for long content

## Features Implemented

✅ Email & password input fields  
✅ Form validation (Zod + react-hook-form)  
✅ Password visibility toggle  
✅ Remember me checkbox  
✅ Sign In button with loading state  
✅ Social login buttons (UI only, need backend OAuth)  
✅ Forgot password link  
✅ Sign up link  
✅ Error message display  
✅ Terms & Privacy links  
✅ Token management (AsyncStorage)  
✅ Auto token refresh  
✅ Auth state management (Zustand)  

## TODO: Next Steps

- [ ] Implement OAuth Google endpoint in backend
- [ ] Implement OAuth Facebook endpoint in backend
- [ ] Create Forgot Password screen
- [ ] Create Sign Up screen
- [ ] Create verification screens (KYC)
- [ ] Add push notifications setup
- [ ] Add E2E tests
- [ ] Implement error toast messages
- [ ] Add loading skeleton screens

## Testing

### Unit Tests
```bash
pnpm test  # Run Jest tests
```

### Manual Testing
```bash
pnpm dev    # Start Expo dev server
# Press 'i' for iOS simulator or 'a' for Android emulator
```

## Customization Guide

### Change Colors
Edit `src/components/SignInScreen.tsx` COLORS object:
```typescript
const COLORS = {
  primary: '#10b981',      // Change primary color
  secondary: '#ff9800',
  // ... other colors
};
```

### Add Custom Logo/Branding
Replace Image URI in hero section:
```typescript
<Image
  source={{
    uri: 'YOUR_IMAGE_URL',
  }}
  style={{ width: '100%', height: '100%' }}
/>
```

### Modify Validation Rules
Edit `src/utils/validators.ts`:
```typescript
export const loginSchema = z.object({
  email: z.string().email().min(5),  // Customize rules
  password: z.string().min(8),  // Change min length
});
```

## Architecture Benefits

1. **Reusable Components**: SignInScreen can be used in multiple places
2. **Centralized State**: Zustand store for all auth logic
3. **Type Safety**: Full TypeScript support throughout
4. **Form Validation**: Zod schemas ensure data integrity
5. **Token Management**: Automatic refresh with error handling
6. **Paper UI**: Material Design 3 components for consistency

## API Integration Points

### Required Backend Endpoints

1. **POST /auth/login**
   ```json
   Request: { email: string, password: string }
   Response: {
     success: true,
     data: {
       accessToken: string,
       refreshToken: string,
       user: { id, email, name, role }
     }
   }
   ```

2. **POST /auth/refresh**
   ```json
   Request: { refreshToken: string }
   Response: {
     success: true,
     data: { accessToken: string }
   }
   ```

3. **GET /auth/me**
   ```json
   Response: {
     success: true,
     data: { id, email, name, role }
   }
   ```

## File Structure
```
apps/mobile/
├── src/
│   ├── api/
│   │   └── client.ts              # Axios instance + interceptors
│   ├── stores/
│   │   └── auth.ts                # Zustand auth store
│   ├── hooks/
│   │   └── useAuth.ts             # Auth hook
│   ├── screens/
│   │   └── auth/
│   │       └── SignInScreen.tsx   # Screen container
│   ├── components/
│   │   └── SignInScreen.tsx       # UI component (from Stitch design)
│   └── utils/
│       └── validators.ts          # Zod schemas
└── SIGNIN_IMPLEMENTATION.md       # This file
```

## References
- [React Native Paper Docs](https://callstack.github.io/react-native-paper/)
- [React Hook Form](https://react-hook-form.com/)
- [Zod Validation](https://zod.dev/)
- [Zustand Store](https://github.com/pmndrs/zustand)
- [Axios](https://axios-http.com/)

---

**Last Updated**: 2026-06-16  
**Status**: MVP Implementation Complete  
**Next Phase**: OAuth integration + additional screens
