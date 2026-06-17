# Select Your Role - FoodResQ Mobile Implementation

## Overview

Implemented "Select Your Role" screen as the first step of the onboarding flow based on Stitch design. This is **Step 1 of 4** in the complete signup journey.

## Components & Files Created

### 1. **SelectRoleScreen Component** (`src/components/SelectRoleScreen.tsx`)
Role selection UI with Material Design 3 cards.

**Features:**
- Header with back button + "Who are you?" title
- Progress indicator (Step 1 of 2)
- 2 role options (Individual, Volunteer)
- Card-based selection with:
  - Emoji icon
  - Title & description
  - Radio button indicator
  - Selected state with green highlight
- Continue button (disabled until role selected)
- Loading state support

**Props:**
```typescript
interface SelectRoleScreenProps {
  onSelectRole?: (role: UserRole) => void;
  onBack?: () => void;
  isLoading?: boolean;
}

type UserRole = 'individual' | 'volunteer';
```

### 2. **Screen Container** (`src/screens/auth/SelectRoleScreen.tsx`)
Integrates component with navigation.

**Responsibilities:**
- Handle role selection
- Navigate to appropriate signup flow based on role
- Handle back navigation

### 3. **Onboarding Store** (`src/stores/onboarding.ts`)
Zustand store for tracking onboarding progress across all steps.

**State:**
- `selectedRole`: 'individual' | 'volunteer'
- `basicInfo`: Email, password, name
- `recipientInfo`: Address, ID, organization, etc.
- `currentStep`: Current onboarding step (1-4)

**Methods:**
- `setSelectedRole(role)`
- `setBasicInfo(info)`
- `setRecipientInfo(info)`
- `setCurrentStep(step)`
- `reset()` - Clear all onboarding data
- `getFullSignUpData()` - Get accumulated data for API call

---

## 📊 **Complete Onboarding Flow**

```
┌─────────────────────────────────┐
│ Step 1: Select Role (✅ DONE)   │
├─────────────────────────────────┤
│ • Choose: Individual / Volunteer │
│ • Role determines next steps     │
└──────────┬──────────────────────┘
           │ Role selection
           ▼
┌─────────────────────────────────┐
│ Step 2: Basic Info (TODO)       │
├─────────────────────────────────┤
│ • Email                         │
│ • Password                      │
│ • Name                          │
└──────────┬──────────────────────┘
           │ Next
           ▼
     ┌─────────────┴──────────────┐
     │                            │
     ▼ (if Individual)      ▼ (if Volunteer)
┌────────────────────┐  ┌──────────────────┐
│ Step 3A: Individual│  │ Step 3B: Volunteer│
│ Recipient Info     │  │ Details          │
├────────────────────┤  ├──────────────────┤
│ • Recipient Type   │  │ • Skills         │
│ • ID/Tax ID        │  │ • Experience     │
│ • Address          │  │ • Availability   │
└────────┬───────────┘  └────────┬─────────┘
         │                       │
         └───────────┬───────────┘
                     │ Next
                     ▼
        ┌─────────────────────────┐
        │ Step 4: Verification    │
        ├─────────────────────────┤
        │ • Document Upload       │
        │ • Email Verification    │
        │ • KYC Check            │
        └────────────┬────────────┘
                     │ Complete
                     ▼
                   HOME
```

---

## 🎨 **Design Details**

### Role Options (Mobile Focused)

| Role | Emoji | Title | Description |
|------|-------|-------|-------------|
| Individual | 👤 | Individual | Get food support as an individual |
| Volunteer | 🤝 | Volunteer | Help transport and distribute food |

### Colors
```
Primary Green:   #10b981
Primary Light:   #f0fdf4
On Surface:      #1a1a1a
On Surface Var:  #6b7280
Outline:         #F3F4F6
Warning:         #f59e0b
```

### Component Specs
- **Header**: 56px, centered title, back button
- **Progress**: 2 bars, Step 1 of 2
- **Cards**: 12px radius, 1px/2px border, 16px padding
- **Icon Circle**: 56×56px, emoji inside
- **Radio Button**: 20px diameter, filled when selected
- **Continue Button**: 52px height, 16px radius, bottom sticky

---

## 📝 **Integration Flow**

### Scenario 1: User selects "Individual"
```
SelectRoleScreen
  → onSelectRole('individual')
    → navigation.navigate('SignUpBasic', { role: 'receiver' })
      → SignUpBasicScreen (email, password, name)
        → onSuccess()
          → navigation.navigate('SignUpRecipient', { basicInfo })
            → SignUpRecipientScreen (ID, address)
              → onSuccess()
                → navigation.navigate('SignUpVerification', { basicInfo, recipientData })
```

### Scenario 2: User selects "Volunteer"
```
SelectRoleScreen
  → onSelectRole('volunteer')
    → navigation.navigate('SignUpBasic', { role: 'volunteer' })
      → SignUpBasicScreen (email, password, name)
        → onSuccess()
          → navigation.navigate('SignUpVolunteer', { basicInfo })
            → SignUpVolunteerScreen (skills, experience)
              → onSuccess()
                → navigation.navigate('SignUpVerification', { basicInfo, volunteerData })
```

---

## 🔄 **State Management Pattern**

### Using Onboarding Store
```typescript
import { useOnboardingStore } from '../stores/onboarding';

// In SelectRoleScreen
const setSelectedRole = useOnboardingStore((s) => s.setSelectedRole);
const handleSelect = (role) => {
  setSelectedRole(role);
  navigation.navigate('SignUpBasic');
};

// In SignUpBasicScreen
const setBasicInfo = useOnboardingStore((s) => s.setBasicInfo);
const handleNext = (data) => {
  setBasicInfo(data);
  navigation.navigate('SignUpRecipient');
};

// In final verification
const fullData = useOnboardingStore((s) => s.getFullSignUpData());
// Send to backend: POST /auth/register { fullData }
```

---

## 📦 **File Structure**

```
apps/mobile/src/
├── components/
│   ├── SignInScreen.tsx              # ✅ Done
│   ├── SignUpRecipientScreen.tsx     # ✅ Done
│   └── SelectRoleScreen.tsx          # ✅ Done
├── screens/
│   └── auth/
│       ├── SignInScreen.tsx          # ✅ Done
│       ├── SelectRoleScreen.tsx      # ✅ Done
│       ├── SignUpBasicScreen.tsx     # TODO
│       ├── SignUpRecipientScreen.tsx # ✅ Done (for Individual)
│       ├── SignUpVolunteerScreen.tsx # TODO (for Volunteer)
│       └── SignUpVerificationScreen.tsx # TODO
├── stores/
│   ├── auth.ts                       # ✅ Authentication
│   └── onboarding.ts                 # ✅ Signup flow tracking
├── utils/
│   └── validators.ts                 # ✅ Zod schemas
└── navigation/
    └── AuthNavigator.tsx             # TODO - Organize auth screens
```

---

## 🧪 **Testing Scenarios**

### Test 1: Select Individual Role
```
1. Open SelectRoleScreen
2. Tap Individual card
   → Card should highlight green
   → Radio button should fill
3. Tap Continue
   → Navigate to SignUpBasic with role='receiver'
```

### Test 2: Switch Role Selection
```
1. Select Individual
2. Tap Volunteer
   → Individual highlights should reset
   → Volunteer card should become active
3. Verify state changed correctly
```

### Test 3: Back Navigation
```
1. Select a role
2. Tap back button
   → Should navigate back to previous screen
   → State may or may not persist (based on implementation)
```

---

## 🚀 **Next Steps - TODO**

### Priority 1: Complete Signup Flow
1. **Create SignUpBasicScreen** (Step 2)
   - Email, password, name inputs
   - Common for both Individual & Volunteer
   - Reuse Paper TextInputs + RHF

2. **Create SignUpVolunteerScreen** (Step 3B - if volunteer)
   - Skills/specializations checkboxes
   - Experience level selector
   - Availability selector

3. **Create SignUpVerificationScreen** (Step 4)
   - Document upload (ID for individual, registration for charity)
   - Email verification
   - Phone verification (optional)
   - Submit full data to backend

### Priority 2: Navigation Structure
- [ ] Create `AuthNavigator.tsx` to organize signup screens
- [ ] Setup stack navigator for role selection
- [ ] Handle conditional navigation based on selected role

### Priority 3: Backend Integration
- [ ] Update `POST /auth/register` to handle:
  - `role: 'receiver' | 'volunteer'`
  - Recipient-specific fields (if receiver)
  - Volunteer-specific fields (if volunteer)

### Priority 4: Error Handling
- [ ] Add error toast for duplicate email
- [ ] Handle network errors during registration
- [ ] Implement retry logic
- [ ] Add form validation feedback

---

## 💡 **Design Consistency**

Shared across all auth screens:
- ✅ Paper UI components
- ✅ Material Design 3 colors
- ✅ 16px base spacing
- ✅ 12px rounded corners (medium)
- ✅ Similar header layouts
- ✅ Consistent button styles
- ✅ Error handling patterns
- ✅ Loading states

---

## 📱 **Mobile-First Considerations**

- **Responsive**: Works at any viewport size ≥320px
- **Touch Targets**: 56×56px minimum for interactive elements
- **Safe Area**: Respects notch/home bar on iOS
- **Scrolling**: ScrollView with proper content insets
- **Keyboard**: TextInputs automatically handle keyboard
- **Dark Mode**: Ready for Material Design 3 dark theme (TODO)

---

## 🔗 **Component Reusability**

Select Your Role component can be reused for:
- Multiple role selection (e.g., "Select what you want to do today")
- Preferences selection
- Any radio-list UI pattern

**Extract pattern into `RoleCardList.tsx`:**
```typescript
interface RoleCardListProps {
  options: Array<{
    id: string;
    emoji: string;
    title: string;
    description: string;
  }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}
```

---

## 📊 **API Contract**

### Final Registration Request (after all 4 steps)
```typescript
POST /auth/register

// For Individual (role=receiver)
{
  email: string;
  password: string;
  name: string;
  role: 'receiver';
  recipientType: 'individual';
  idNumber: string;
  address: string;
}

// For Volunteer (role=volunteer)
{
  email: string;
  password: string;
  name: string;
  role: 'volunteer';
  skills: string[];        // ['shipper', 'chef', 'waiter']
  experience: 'beginner' | 'intermediate' | 'experienced';
  availability: {
    daysPerWeek: number;
    hoursPerDay: number;
  };
}
```

---

## 🎯 **Success Criteria**

- [x] Select Your Role screen displays correctly
- [x] Individual & Volunteer options are selectable
- [x] Selected state shows with green highlight
- [x] Continue button is disabled until role selected
- [x] Back navigation works
- [x] Role selection data persists in store
- [ ] Navigate to SignUpBasic after role selection
- [ ] Full signup flow works end-to-end (after all screens implemented)

---

## 📚 **Documentation Files**

- **SIGNIN_IMPLEMENTATION.md** - Sign In screen guide
- **SIGNUP_IMPLEMENTATION.md** - Recipient signup guide
- **ROLE_SELECTION_IMPLEMENTATION.md** - This file

---

**Last Updated**: 2026-06-16  
**Status**: Step 1 Complete, Steps 2-4 TODO  
**Next**: Create SignUpBasicScreen (Step 2 - common for all roles)
