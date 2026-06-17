import { create } from 'zustand';
import type { UserRole } from '../components/SelectRoleScreen';

export interface OnboardingState {
  // Selected role
  selectedRole: UserRole | null;

  // Onboarding data (accumulated across steps)
  basicInfo: {
    email?: string;
    password?: string;
    name?: string;
  };

  recipientInfo?: {
    recipientType?: 'individual' | 'charity';
    idNumber?: string;
    organizationName?: string;
    taxId?: string;
    address?: string;
  };

  // Current step
  currentStep: number; // 1 = role, 2 = basic info, 3 = recipient info, 4 = verification

  // Actions
  setSelectedRole: (role: UserRole) => void;
  setBasicInfo: (info: OnboardingState['basicInfo']) => void;
  setRecipientInfo: (info: OnboardingState['recipientInfo']) => void;
  setCurrentStep: (step: number) => void;
  reset: () => void;
  getFullSignUpData: () => any;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  selectedRole: null,
  basicInfo: {},
  currentStep: 1,

  setSelectedRole: (role: UserRole) => {
    set({ selectedRole: role });
  },

  setBasicInfo: (info: OnboardingState['basicInfo']) => {
    set((state) => ({
      basicInfo: {
        ...state.basicInfo,
        ...info,
      },
    }));
  },

  setRecipientInfo: (info: OnboardingState['recipientInfo']) => {
    set({ recipientInfo: info });
  },

  setCurrentStep: (step: number) => {
    set({ currentStep: step });
  },

  reset: () => {
    set({
      selectedRole: null,
      basicInfo: {},
      recipientInfo: undefined,
      currentStep: 1,
    });
  },

  getFullSignUpData: () => {
    const state = get();
    return {
      ...state.basicInfo,
      role: state.selectedRole === 'volunteer' ? 'volunteer' : 'receiver',
      recipientType: state.recipientInfo?.recipientType,
      idNumber: state.recipientInfo?.idNumber,
      organizationName: state.recipientInfo?.organizationName,
      taxId: state.recipientInfo?.taxId,
      address: state.recipientInfo?.address,
    };
  },
}));
