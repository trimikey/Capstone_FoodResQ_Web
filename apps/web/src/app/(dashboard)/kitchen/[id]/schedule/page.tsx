'use client';

import ChefSchedulePanel from '../_components/ChefSchedulePanel';
import { useKitchenChefTask } from '../_components/KitchenChefContext';

export default function KitchenSchedulePage() {
  const task = useKitchenChefTask();

  if (!task) return null;
  return <ChefSchedulePanel task={task} />;
}
