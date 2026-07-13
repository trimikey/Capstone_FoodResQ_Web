import * as Haptics from 'expo-haptics';

export async function impactLight() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics is best-effort and should never block a business action.
  }
}

export async function selectionFeedback() {
  try {
    await Haptics.selectionAsync();
  } catch {
    // Best-effort on unsupported devices.
  }
}

export async function notifySuccess() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Best-effort on unsupported devices.
  }
}

export async function notifyWarning() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Best-effort on unsupported devices.
  }
}

export async function notifyError() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // Best-effort on unsupported devices.
  }
}
