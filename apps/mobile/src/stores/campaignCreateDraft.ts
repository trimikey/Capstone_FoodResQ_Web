import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AssignmentRole } from '@/hooks/useCampaigns';
import type { AddressValue } from '@/components/AddressPicker';

export interface CampaignMenuDraft {
  name: string;
  type: string;
  plannedServings?: number;
}

export interface CampaignScheduleDraft {
  time: string;
  label: string;
}

export interface CampaignSupplyDraft {
  name: string;
  quantity?: number;
  unit?: string;
}

export interface CampaignShiftDraft {
  label: string;
  role?: AssignmentRole;
  startTime: string;
  endTime: string;
  slotsNeeded: number;
}

export interface CampaignCreateDraft {
  title: string;
  description: string;
  imageUrl: string | null;
  address: AddressValue | null;
  addressMode: 'profile' | 'custom';
  scheduledDate: Date;
  endDate: Date | null;
  startTime: Date;
  endTime: Date;
  chefSlots: string;
  waiterSlots: string;
  shipperSlots: string;
  expectedServings: string;
  menuItems: CampaignMenuDraft[];
  shifts: CampaignShiftDraft[];
  scheduleItems: CampaignScheduleDraft[];
  supplyItems: CampaignSupplyDraft[];
}

export type CampaignCreateDraftPatch = Partial<CampaignCreateDraft>;

export function createInitialCampaignDraft(): CampaignCreateDraft {
  const now = new Date();
  // Chừa đủ thời gian tuyển và khoảng đệm mặc định 24 giờ trước vận hành.
  const scheduledDate = new Date(now.getTime() + 7 * 24 * 3600_000);
  const startTime = new Date(scheduledDate);
  startTime.setHours(6, 0, 0, 0);
  const endTime = new Date(scheduledDate);
  endTime.setHours(12, 0, 0, 0);

  return {
    title: '',
    description: '',
    imageUrl: null,
    address: null,
    addressMode: 'custom',
    scheduledDate,
    endDate: null,
    startTime,
    endTime,
    chefSlots: '0',
    waiterSlots: '0',
    shipperSlots: '0',
    expectedServings: '100',
    menuItems: [],
    shifts: [],
    scheduleItems: [],
    supplyItems: [],
  };
}

interface CampaignCreateDraftState {
  currentStep: number;
  draft: CampaignCreateDraft;
  setStep: (step: number) => void;
  patchDraft: (patch: CampaignCreateDraftPatch) => void;
  reset: () => void;
}

export const useCampaignCreateDraftStore = create<CampaignCreateDraftState>()(
  persist(
    (set) => ({
      currentStep: 0,
      draft: createInitialCampaignDraft(),
      setStep: (step) => set({ currentStep: step }),
      patchDraft: (patch) =>
        set((state) => ({
          draft: {
            ...state.draft,
            ...patch,
          },
        })),
      reset: () => set({ currentStep: 0, draft: createInitialCampaignDraft() }),
    }),
    {
      name: 'campaign-create-draft',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const d = state.draft;
        d.scheduledDate = new Date(d.scheduledDate);
        d.startTime = new Date(d.startTime);
        d.endTime = new Date(d.endTime);
        if (d.endDate) d.endDate = new Date(d.endDate);
      },
    },
  ),
);
