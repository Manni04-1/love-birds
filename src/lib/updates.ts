import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';

// How often to look for a new version when the app comes back to the front.
const CHECK_EVERY_MS = 10 * 60 * 1000;

/** True in the installed app. False in Expo Go and while developing. */
export const updatesEnabled = Updates.isEnabled && !__DEV__;

/** "1.0.0", plus the date of the update the app is running, if any. */
export function versionLabel(): string {
  const version = Constants.expoConfig?.version ?? '';
  if (!updatesEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return version;
  const day = Updates.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${version}, updated ${day}`;
}

/** Downloads a newer version if there is one. Resolves true when one is ready to restart into. */
export async function downloadUpdate(): Promise<boolean> {
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return false;
  const result = await Updates.fetchUpdateAsync();
  return result.isNew;
}

export function restartIntoUpdate() {
  Updates.reloadAsync().catch(() => {});
}

/**
 * Keeps the app up to date. The app looks for a new version every time it opens.
 * This also looks when the app comes back to the front, and offers to restart
 * once a new version has downloaded.
 */
export function useAppUpdates() {
  const { isUpdatePending } = Updates.useUpdates();
  const lastCheck = useRef(0);
  const offered = useRef(false);

  useEffect(() => {
    if (!updatesEnabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = Date.now();
      downloadUpdate().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isUpdatePending || offered.current) return;
    offered.current = true;
    Alert.alert('A new version of Love Birds is ready', 'Restart the app to get the latest changes.', [
      { text: 'Later', style: 'cancel' },
      { text: 'Restart', onPress: restartIntoUpdate },
    ]);
  }, [isUpdatePending]);
}
