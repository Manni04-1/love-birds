import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Alert, Animated, AppState, BackHandler, Modal, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { LoveBirdsMark } from '@/components/mark';
import { Glyph, Row, T } from '@/components/ui';
import {
  biometricsAvailable,
  checkPin,
  clearLock,
  leftOnPurpose,
  lockedOutUntil,
  lockSupported,
  PIN_LENGTH,
  readLock,
  setBiometrics,
  setPin,
  unlockWithBiometrics,
  type LockSettings,
} from '@/lib/lock';
import { useSession } from '@/lib/session';
import { space, useColors } from '@/lib/theme';

const OFF: LockSettings = { on: false, biometrics: false, after: 0 };

const LockContext = createContext<{ settings: LockSettings; reload: () => Promise<void> }>({ settings: OFF, reload: async () => {} });

/** The lock's settings on this phone, and a way to re-read them after changing them. */
export function useAppLock() {
  return useContext(LockContext);
}

/* The number pad --------------------------------------------------------- */

function useCountdown(until: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [until]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return left;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'extra', '0', 'del'];

/**
 * Four dots and a number pad. onDone gets the PIN once all four digits are in,
 * and returns an error to show (the dots shake and clear) or nothing if it's fine.
 */
export function PinPad({
  title,
  note,
  onDone,
  extra,
  waitUntil = 0,
  light,
}: {
  title: string;
  note?: string;
  onDone: (pin: string) => Promise<string | null | void>;
  extra?: ReactNode;
  waitUntil?: number;
  /** White text and keys, for the lock screen's coloured background. */
  light?: boolean;
}) {
  const c = useColors();
  const ink = light ? '#FFFFFF' : c.ink;
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));
  const wait = useCountdown(waitUntil);

  async function press(key: string) {
    if (busy || wait > 0) return;
    if (key === 'del') return setDigits((d) => d.slice(0, -1));
    const next = digits + key;
    setError('');
    setDigits(next);
    if (next.length < PIN_LENGTH) return;
    setBusy(true);
    const problem = await onDone(next);
    setBusy(false);
    setDigits('');
    if (problem) {
      setError(problem);
      Animated.sequence([10, -10, 7, -7, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))).start();
    }
  }

  const message = wait > 0 ? `Too many tries. Try again in ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}` : error || note || ' ';

  return (
    <View style={{ alignItems: 'center', gap: space.lg, width: '100%' }}>
      <T variant="heading" color={ink} style={{ textAlign: 'center' }}>
        {title}
      </T>
      <Animated.View style={{ flexDirection: 'row', gap: space.lg, transform: [{ translateX: shake }] }} accessibilityLabel={`${digits.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View
            key={i}
            style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: ink, backgroundColor: i < digits.length ? ink : 'transparent' }}
          />
        ))}
      </Animated.View>
      <T variant="small" color={light ? 'rgba(255,255,255,0.9)' : error || wait ? c.danger : c.muted} style={{ textAlign: 'center', minHeight: 20, fontWeight: '600' }} accessibilityLiveRegion="polite">
        {message}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 288, justifyContent: 'space-between', rowGap: space.md }}>
        {KEYS.map((key) => {
          if (key === 'extra') return <View key={key} style={styles.key}>{extra}</View>;
          const del = key === 'del';
          return (
            <Pressable
              key={key}
              onPress={() => press(key)}
              disabled={wait > 0}
              accessibilityRole="button"
              accessibilityLabel={del ? 'Delete' : key}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: del ? 'transparent' : light ? 'rgba(255,255,255,0.18)' : c.surface2, opacity: wait > 0 ? 0.4 : pressed ? 0.6 : 1 },
              ]}>
              {del ? <Glyph name="backspace" color={ink} size={26} /> : <T style={{ fontSize: 30, lineHeight: 36 }} color={ink}>{key}</T>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* The lock screen -------------------------------------------------------- */

/** The lock screen's background: the theme's colour, or a deep version of it at night. */
function useLockBackground() {
  const c = useColors();
  return useColorScheme() === 'dark' ? c.accentSoft : c.accent;
}

function LockScreen({ settings, onUnlock }: { settings: LockSettings; onUnlock: () => void }) {
  const background = useLockBackground();
  const { profile, signOut } = useSession();
  const [waitUntil, setWaitUntil] = useState(0);

  const tryBiometrics = useCallback(async () => {
    if (await unlockWithBiometrics()) onUnlock();
  }, [onUnlock]);

  useEffect(() => {
    lockedOutUntil().then(setWaitUntil);
    if (settings.biometrics) tryBiometrics();
  }, [settings.biometrics, tryBiometrics]);

  async function submit(pin: string) {
    const result = await checkPin(pin);
    if (result.ok) {
      onUnlock();
      return null;
    }
    setWaitUntil(result.waitUntil);
    if (result.waitUntil) return null;
    return `Wrong PIN. ${result.triesLeft} ${result.triesLeft === 1 ? 'try' : 'tries'} left before a short wait.`;
  }

  function forgot() {
    Alert.alert(
      'Forgot your PIN?',
      'Sign out to remove the lock. Sign back in with your email and password, and everything is still there.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await clearLock();
            await signOut();
            onUnlock();
          },
        },
      ],
    );
  }

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => BackHandler.exitApp()}>
      <SafeAreaView style={{ flex: 1, backgroundColor: background, alignItems: 'center', justifyContent: 'space-between', padding: space.lg }}>
        <View style={{ alignItems: 'center', gap: space.sm, marginTop: space.xl }}>
          <LoveBirdsMark size={96} />
          <T variant="title" color="#FFFFFF">
            Love Birds
          </T>
          {profile?.name ? (
            <T color="rgba(255,255,255,0.9)">Welcome back, {profile.name}</T>
          ) : null}
        </View>
        <PinPad
          light
          title="Enter your PIN"
          onDone={submit}
          waitUntil={waitUntil}
          extra={
            settings.biometrics ? (
              <Pressable onPress={tryBiometrics} accessibilityRole="button" accessibilityLabel="Use fingerprint" style={({ pressed }) => [styles.key, { opacity: pressed ? 0.6 : 1 }]}>
                <Glyph name="fingerprint" color="#FFFFFF" size={30} />
              </Pressable>
            ) : null
          }
        />
        <Pressable onPress={forgot} accessibilityRole="button" hitSlop={10} style={{ marginBottom: space.md }}>
          <T variant="small" color="#FFFFFF" style={{ fontWeight: '700', textDecorationLine: 'underline' }}>
            Forgot PIN?
          </T>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

/* Turning the lock on, changing the PIN, turning it off ------------------- */

export type PinTask = 'on' | 'change' | 'off';

const STEP_TITLE = { current: 'Enter your current PIN', new: 'Choose a 4-digit PIN', confirm: 'Enter it again' } as const;

export function PinSetup({ task, onClose }: { task: PinTask | null; onClose: () => void }) {
  const c = useColors();
  const { reload } = useAppLock();
  const first = task === 'on' ? 'new' : 'current';
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>(first);
  const [chosen, setChosen] = useState('');
  const [waitUntil, setWaitUntil] = useState(0);
  const [notice, setNotice] = useState('');
  const [lastTask, setLastTask] = useState(task);

  // Start from the first step each time it opens.
  if (task !== lastTask) {
    setLastTask(task);
    setStep(first);
    setChosen('');
    setNotice('');
  }

  async function done(pin: string): Promise<string | null> {
    if (step === 'current') {
      const result = await checkPin(pin);
      if (!result.ok) {
        setWaitUntil(result.waitUntil);
        return result.waitUntil ? null : `Wrong PIN. ${result.triesLeft} ${result.triesLeft === 1 ? 'try' : 'tries'} left.`;
      }
      if (task === 'off') {
        await clearLock();
        await reload();
        onClose();
        return null;
      }
      setStep('new');
      return null;
    }
    if (step === 'new') {
      if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'That one is easy to guess. Try another.';
      setChosen(pin);
      setNotice('');
      setStep('confirm');
      return null;
    }
    if (pin !== chosen) {
      setStep('new');
      setChosen('');
      setNotice('Those didn\'t match. Choose your PIN again.');
      return null;
    }
    await setPin(pin);
    if (task === 'on') await setBiometrics(await biometricsAvailable());
    await reload();
    onClose();
    return null;
  }

  return (
    <Modal visible={!!task} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.page, padding: space.lg, gap: space.xl }}>
        <ThemeBackdrop />
        <Row style={{ justifyContent: 'flex-end' }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={10} style={{ padding: space.sm }}>
            <T variant="strong" accent>
              Cancel
            </T>
          </Pressable>
        </Row>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <PinPad
            key={step}
            title={STEP_TITLE[step]}
            note={notice || (step === 'new' ? 'You\'ll use it to open Love Birds on this phone.' : step === 'confirm' ? 'Just to be sure.' : undefined)}
            onDone={done}
            waitUntil={waitUntil}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/* Keeping the app locked -------------------------------------------------- */

/**
 * Shows the lock screen when the app opens, and when you come back to it after
 * it's been in the background longer than you chose. While it's in the
 * background a plain cover hides your chats from the recent apps view.
 */
export function AppLock({ children }: { children: ReactNode }) {
  const background = useLockBackground();
  const { session } = useSession();
  const userId = session?.user.id;
  const [settings, setSettings] = useState<LockSettings | null>(lockSupported ? null : OFF);
  const [locked, setLocked] = useState(lockSupported);
  const [covered, setCovered] = useState(false);

  const reload = useCallback(async () => {
    setSettings(await readLock());
  }, []);

  // Read the settings when the app opens, and again after signing in or out.
  useEffect(() => {
    if (!lockSupported) return;
    readLock().then((s) => {
      setSettings(s);
      if (!s.on) setLocked(false);
    });
  }, [userId]);

  const on = !!settings?.on;
  const after = settings?.after ?? 0;
  useEffect(() => {
    if (!on) return;
    let leftAt = 0;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (leftOnPurpose()) return;
        leftAt = Date.now();
        setCovered(true);
      } else if (state === 'active') {
        const since = leftAt;
        leftAt = 0;
        // "Right away" still allows a few seconds, for pulling down the notification shade.
        if (since && !leftOnPurpose() && Date.now() - since > Math.max(after * 1000, 5000)) setLocked(true);
        setCovered(false);
      }
    });
    return () => sub.remove();
  }, [on, after]);

  const signedIn = !!session;
  const unlock = useCallback(() => setLocked(false), []);

  return (
    <LockContext.Provider value={{ settings: settings ?? OFF, reload }}>
      {children}
      {signedIn && (settings === null || (on && covered && !locked)) && <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]} />}
      {signedIn && on && locked && settings && <LockScreen settings={settings} onUnlock={unlock} />}
    </LockContext.Provider>
  );
}

const styles = StyleSheet.create({
  key: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
});

