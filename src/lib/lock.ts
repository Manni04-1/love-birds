import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Everything about the lock lives in the phone's secure storage (Android Keystore),
// so it belongs to this phone only and never reaches the server.
const PIN = 'lock.pin';
const BIO = 'lock.bio';
const AFTER = 'lock.after';
const FAILS = 'lock.fails';

export const lockSupported = Platform.OS === 'android' || Platform.OS === 'ios';
export const PIN_LENGTH = 4;
/** Wrong PINs allowed before you have to wait. */
export const FREE_TRIES = 5;

/** How long the app can be in the background before it locks, in seconds. 0 = right away. */
export type LockAfter = 0 | 60 | 300;
export type LockSettings = { on: boolean; biometrics: boolean; after: LockAfter };

const OFF: LockSettings = { on: false, biometrics: false, after: 0 };

async function read(key: string): Promise<string | null> {
  if (!lockSupported) return null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string | null) {
  if (!lockSupported) return;
  if (value === null) await SecureStore.deleteItemAsync(key).catch(() => {});
  else await SecureStore.setItemAsync(key, value);
}

export async function readLock(): Promise<LockSettings> {
  const pin = await read(PIN);
  if (!pin) return OFF;
  const after = Number(await read(AFTER)) as LockAfter;
  return { on: true, biometrics: (await read(BIO)) === '1', after: after === 60 || after === 300 ? after : 0 };
}

async function hash(pin: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `love-birds:${salt}:${pin}`);
}

/** Turns the lock on with a new PIN, or changes the PIN. */
export async function setPin(pin: string) {
  const salt = Crypto.randomUUID();
  await write(PIN, JSON.stringify({ salt, hash: await hash(pin, salt) }));
  await write(FAILS, null);
}

export async function setBiometrics(on: boolean) {
  await write(BIO, on ? '1' : null);
}

export async function setLockAfter(after: LockAfter) {
  await write(AFTER, String(after));
}

/** Turns the lock off and forgets the PIN (also used when signing out). */
export async function clearLock() {
  await Promise.all([write(PIN, null), write(BIO, null), write(AFTER, null), write(FAILS, null)]);
}

export type PinCheck = { ok: true } | { ok: false; triesLeft: number; waitUntil: number };

/** When you have to wait because of too many wrong PINs, or 0. */
export async function lockedOutUntil(): Promise<number> {
  const fails = JSON.parse((await read(FAILS)) ?? 'null') as { count: number; until: number } | null;
  return fails && fails.until > Date.now() ? fails.until : 0;
}

/**
 * Checks a PIN. After five wrong tries you wait a minute, and the wait doubles
 * with each wrong try after that, up to an hour.
 */
export async function checkPin(pin: string): Promise<PinCheck> {
  const stored = JSON.parse((await read(PIN)) ?? 'null') as { salt: string; hash: string } | null;
  if (!stored) return { ok: true };
  const fails = (JSON.parse((await read(FAILS)) ?? 'null') as { count: number; until: number } | null) ?? { count: 0, until: 0 };
  if (fails.until > Date.now()) return { ok: false, triesLeft: 0, waitUntil: fails.until };
  if ((await hash(pin, stored.salt)) === stored.hash) {
    await write(FAILS, null);
    return { ok: true };
  }
  const count = fails.count + 1;
  const until = count >= FREE_TRIES ? Date.now() + Math.min(60_000 * 2 ** (count - FREE_TRIES), 3_600_000) : 0;
  await write(FAILS, JSON.stringify({ count, until }));
  return { ok: false, triesLeft: Math.max(0, FREE_TRIES - count), waitUntil: until };
}

/** True when the phone has a fingerprint (or face) set up that the app can use. */
export async function biometricsAvailable(): Promise<boolean> {
  if (!lockSupported) return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

/** Shows the phone's fingerprint prompt. True if it was you. */
export async function unlockWithBiometrics(): Promise<boolean> {
  try {
    const result = await whileAway(() =>
      LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Love Birds', cancelLabel: 'Use PIN', disableDeviceFallback: true }),
    );
    if (result.success) await write(FAILS, null);
    return result.success;
  } catch {
    return false;
  }
}

/* Leaving the app on purpose ---------------------------------------------- */

// Choosing a photo or using the fingerprint prompt briefly sends the app to the
// background. These shouldn't lock it.
let away = 0;
let awayEnded = 0;

export async function whileAway<T>(fn: () => Promise<T>): Promise<T> {
  away++;
  try {
    return await fn();
  } finally {
    away--;
    awayEnded = Date.now();
  }
}

/** True while (or just after) the app sent you somewhere itself. */
export function leftOnPurpose(): boolean {
  return away > 0 || Date.now() - awayEnded < 3000;
}
