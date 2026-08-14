import { AppState } from 'react-native';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForActiveApp(timeoutMs = 1200): Promise<void> {
  if (AppState.currentState === 'active') return;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      subscription.remove();
      resolve();
    }, timeoutMs);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      clearTimeout(timeout);
      subscription.remove();
      resolve();
    });
  });
}

export async function waitForNativePickerReady(): Promise<void> {
  await waitForActiveApp();
  await delay(300);
}
