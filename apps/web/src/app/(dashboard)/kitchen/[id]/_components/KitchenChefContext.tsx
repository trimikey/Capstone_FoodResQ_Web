'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { MyTask } from '@/hooks/useCampaigns';

const KitchenChefContext = createContext<MyTask | undefined>(undefined);

export function KitchenChefProvider({ task, children }: { task?: MyTask; children: ReactNode }) {
  return <KitchenChefContext.Provider value={task}>{children}</KitchenChefContext.Provider>;
}

export function useKitchenChefTask() {
  return useContext(KitchenChefContext);
}
