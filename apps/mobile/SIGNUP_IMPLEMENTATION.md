# Sign Up Flow Implementation - FoodResQ Mobile

## Overview

Implemented 2-step Sign Up flow based on Stitch design. Currently includes Step 2: Recipient Information.

## Components & Files Created

### 1. **SignUpRecipientScreen Component** (`src/components/SignUpRecipientScreen.tsx`)
Step 2 of signup flow for recipient users (individuals or organizations).

**Features:**
- Progress indicator (Step 2 of 2)
- Recipient Type selector (Individual / Charity)
- Conditional form fields:
  - **Individual**: ID Card Number
  - **Charity**: Organization Name + Tax ID
- Universal field: Pickup Address (textarea)
- Illustration image
- Back & Next buttons
- Form validation with Zod
- Loading state handling

**Props:**
```typescript
interface SignUpRecipientScreenProps {
  onSuccess?: (data: SignUpRecipientInput) => void;
  onBack?: () => void;
  isLoading?: boolean;
}
```

### 2. **Screen Container** (`src/screens/auth/SignUpRecipientScreen.tsx`)
Integrates component with navigation.

**Responsibilities:**
- Receive basic info from Step 1 (email, password, name)
- Pass to verification screen
- Navigate between steps

### 3. **Updated Validators** (`src/utils/validators.ts`)
Added new validation schemas:

```typescript
// Step 1: Basic account info
signUpBasicInfoSchema
// -> email, password, confirmPassword, name

// Step 2: Recipient information  
signUpRecipientInfoSchema
// -> recipientType, idNumber (optional), organizationName (optional), 
//    taxId (optional), address

// Combined for full signup
```

## Design Details

### Colors (Material Design 3)
```
Primary:           #006c49 (dark green)
Primary Container: #10b981 (light green)
Secondary:         #855300 (brown)
Background:        #f8f9ff
Surface:           #ffffff
On Surface:        #121c2a
On Surface Variant:#6b7280
Outline:           #e5e7eb
```

### Component Specs
- **Header**: 64px, "FoodResQ" title, back button
- **Progress**: 2 dots (Step 2 of 2)
- **Title**: 24px, "Identify yourself"
- **Type Buttons**: 100px height, 12px radius, icon + label
- **Inputs**: Outlined, with icons
- **Address**: 4-line textarea
- **Image**: Full width, 160px height
- **Footer Buttons**: Back (outline) + Next (filled)

## Feature Breakdown

✅ Recipient type selector (Individual/Charity)  
✅ Conditional form fields (show/hide based on type)  
✅ ID Card Number input (individual only)  
✅ Organization Name input (charity only)  
✅ Tax ID / Registration input (charity only)  
✅ Pickup Address textarea  
✅ Form validation with Zod  
✅ Error message display  
✅ Loading state  
✅ Progress indicator  
✅ Back & Next navigation  

## Integration Guide

### Step 1: Create Basic Info Screen (TODO)
```typescript
// src/components/SignUpBasicScreen.tsx
- Email input
- Password input (with toggle)
- Confirm password input
- Name input
- Form validation
```

### Step 2: Create Sign Up Navigator
```typescript
// src/navigation/SignUpNavigator.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SignUpBasicScreen from '../screens/auth/SignUpBasicScreen';
import SignUpRecipientScreen from '../screens/auth/SignUpRecipientScreen';

const Stack = createNativeStackNavigator();

export function SignUpNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen 
        name="SignUpBasic" 
        component={SignUpBasicScreen} 
      />
      <Stack.Screen 
        name="SignUpRecipient" 
        component={SignUpRecipientScreen}
        options={{
          cardStyle: { backgroundColor: '#f8f9ff' }
        }}
      />
      <Stack.Screen 
        name="SignUpVerification" 
        component={SignUpVerificationScreen}
      />
    </Stack.Navigator>
  );
}
```

### Step 3: Flow Example
```typescript
// src/screens/auth/SignUpBasicScreen.tsx
const handleNext = (basicInfo: SignUpBasicInfoInput) => {
  navigation.navigate('SignUpRecipient', {
    basicInfo, // Pass to next step
  });
};

// src/screens/auth/SignUpRecipientScreen.tsx
const handleSuccess = (recipientData: SignUpRecipientInput) => {
  navigation.navigate('SignUpVerification', {
    basicInfo: route.params.basicInfo,
    recipientData,
  });
};

// src/screens/auth/SignUpVerificationScreen.tsx
const handleVerifyComplete = async () => {
  const fullData = {
    ...basicInfo,
    ...recipientData,
  };
  await authStore.register(fullData);
  navigation.reset({ routes: [{ name: 'Home' }] });
};
```

## Form Field Mapping

### Step 1: SignUpBasicInfoInput
```typescript
{
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
}
```

### Step 2: SignUpRecipientInfoInput
```typescript
{
  recipientType: 'individual' | 'charity';
  idNumber?: string;           // if individual
  organizationName?: string;   // if charity
  taxId?: string;              // if charity
  address: string;             // required
}
```

### Combined for Backend Registration
```typescript
{
  email: string;
  password: string;
  name: string;
  role: 'receiver';            // always 'receiver' for mobile
  recipientType: 'individual' | 'charity';
  idNumber?: string;
  organizationName?: string;
  taxId?: string;
  address: string;
}
```

## Validation Rules

### Email
- Valid email format
- Min 5 characters

### Password
- Min 6 characters
- Max 50 characters
- Must match confirmPassword

### Name
- Min 2 characters
- Max 50 characters

### ID Number (Individual)
- Required if recipientType = 'individual'
- Any format accepted (could be national ID, passport, etc.)

### Organization Name (Charity)
- Required if recipientType = 'charity'
- Min 1 character

### Tax ID (Charity)
- Required if recipientType = 'charity'
- Format: XX-XXXXXXX (example: 12-3456789)

### Address
- Required for all
- Min 10 characters
- Example: "District 1, Ho Chi Minh City, Vietnam, Apartment 101"

## Type Safety

All components are fully typed with TypeScript:

```typescript
// Infer from Zod schemas
export type SignUpRecipientInput = z.infer<typeof signUpRecipientInfoSchema>;

// Use in components
const handleSubmit = (data: SignUpRecipientInput) => {
  // data is fully typed
  console.log(data.recipientType); // 'individual' | 'charity'
  console.log(data.address);        // string
};
```

## TODO: Complete Sign Up Flow

### Phase 1: Basic Info Screen
- [ ] Create `SignUpBasicScreen.tsx` component
- [ ] Add email validation
- [ ] Add password requirements indicator
- [ ] Add password visibility toggle
- [ ] Connect to SignUpRecipientScreen

### Phase 2: Verification Screen
- [ ] Create `SignUpVerificationScreen.tsx`
- [ ] Handle document upload (for both individual & charity)
- [ ] Show verification status
- [ ] Call `POST /auth/register` with full data
- [ ] Store tokens & navigate to home

### Phase 3: Auth Store Integration
- [ ] Update auth store `register()` to handle full signup data
- [ ] Add error handling for duplicate email
- [ ] Add error handling for invalid data
- [ ] Add retry logic for network failures

### Phase 4: Testing
- [ ] Unit tests for validators
- [ ] Component tests for form rendering
- [ ] E2E test: Full signup flow (3 steps)
- [ ] Test on iOS & Android

## File Structure
```
apps/mobile/src/
├── components/
│   ├── SignInScreen.tsx           # ✅ Done
│   └── SignUpRecipientScreen.tsx   # ✅ Done
├── screens/
│   └── auth/
│       ├── SignInScreen.tsx        # ✅ Done
│       ├── SignUpBasicScreen.tsx   # TODO
│       ├── SignUpRecipientScreen.tsx # ✅ Done
│       └── SignUpVerificationScreen.tsx # TODO
├── utils/
│   └── validators.ts              # ✅ Updated
├── stores/
│   └── auth.ts                    # ✅ Has register()
└── navigation/
    └── SignUpNavigator.tsx        # TODO
```

## Design Consistency

Both SignIn and SignUp share:
- ✅ Same color scheme
- ✅ Same typography (Material Design 3)
- ✅ Same spacing (16px gaps, 20px margins)
- ✅ Same button styles
- ✅ Same input field styling
- ✅ Same error handling
- ✅ Same header layout (back button + title)

## Reusable Patterns

```typescript
// Pattern: Conditional rendering based on state
{recipientType === 'individual' ? (
  <IndividualFields />
) : (
  <CharityFields />
)}

// Pattern: Form field with validation
<Controller
  control={control}
  name="fieldName"
  render={({ field: { onChange, value } }) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      error={!!errors.fieldName}
    />
  )}
/>

// Pattern: Loading state
<Button
  disabled={isLoading}
  loading={isLoading}
  onPress={handleSubmit}
>
  {isLoading ? 'Processing...' : 'Next'}
</Button>
```

## API Integration

### Required Backend Endpoint

```typescript
POST /auth/register

Request: {
  email: string;
  password: string;
  name: string;
  role: 'receiver' | 'provider' | 'volunteer';
  recipientType?: 'individual' | 'charity';
  idNumber?: string;
  organizationName?: string;
  taxId?: string;
  address?: string;
}

Response: {
  success: true;
  data: {
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
    };
  };
}
```

## Customization

### Change Colors
Edit COLORS object in `SignUpRecipientScreen.tsx`:
```typescript
const COLORS = {
  primary: '#006c49',      // Change primary
  primaryContainer: '#10b981',
  // ... other colors
};
```

### Change Icon Emojis
Replace emoji in button render:
```typescript
<Text style={{ fontSize: 20 }}>👤</Text>  // Individual
<Text style={{ fontSize: 20 }}>🤝</Text>  // Charity
```

### Add New Fields
1. Update validator schema
2. Add Controller in component
3. Update API request payload

Example: Add phone number field
```typescript
// validators.ts
const schema = z.object({
  phone: z.string().regex(/^[0-9]{10}$/, 'Invalid phone'),
});

// Component
<Controller name="phone" render={...} />

// API
POST /auth/register { phone: string }
```

## References
- React Native Paper: https://callstack.github.io/react-native-paper/
- Zod: https://zod.dev/
- React Hook Form: https://react-hook-form.com/
- Material Design 3: https://m3.material.io/

---

**Last Updated**: 2026-06-16  
**Status**: Step 2 Complete, Step 1 & 3 TODO  
**Next Phase**: Create SignUpBasicScreen component
