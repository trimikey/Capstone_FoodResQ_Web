'use client';

import ChefTaskPanel from '../_components/ChefTaskPanel';
import { useKitchenChefTask } from '../_components/KitchenChefContext';

export default function KitchenTaskPage() {
  const task = useKitchenChefTask();

  if (!task) return null;
  return <ChefTaskPanel task={task} />;
}
