import { router } from 'expo-router';
import { useUpdates } from 'expo-updates';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Switch, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { BackupControls } from '@/components/backup';
import { PinSetup, useAppLock, type PinTask } from '@/components/app-lock';
import { Hero, heroInk } from '@/components/hero';
import { bubbleInk, LoveBubble } from '@/components/love-bubble';
import { Avatar, Button, Chip, DateField, ErrorText, Field, Glyph, IconButton, Row, T } from '@/components/ui';
import { today } from '@/lib/dates';
import { sharedHeat } from '@/lib/games';
import { biometricsAvailable, lockSupported, setBiometrics, setLockAfter, type LockAfter } from '@/lib/lock';
import { enableNotifications, eveningReminderOn, setEveningReminder, type NotificationStatus } from '@/lib/notifications';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import type { BubbleStyle } from '@/lib/types';
import { ANIMALS } from '@/content/animals';
import { FONTS, fontFor, radius, space, THEMES, useColors, useFontName, useThemeName, type FontName, type ThemeName } from '@/lib/theme';
import { downloadUpdate, restartIntoUpdate, updatesEnabled, versionLabel } from '@/lib/updates';
import type { WidgetName } from '@/widgets/data';
import { pinWidget } from '@/widgets/sync';

const WIDGET_CHOICES: { name: WidgetName; label: string; size: string; badge: string; blurb: (partner: string) => string }[] = [
  { name: 'Together', label: 'Love Birds', size: '4 × 2', badge: '💕', blurb: (p) => `Your days together, how ${p} feels and what's next` },
  { name: 'Countdown', label: 'Countdown', size: '2 × 2', badge: '📅', blurb: () => 'Days to go until your next plan' },
  { name: 'ThinkingOfYou', label: 'Thinking of you', size: '2 × 1', badge: '💭', blurb: (p) => `One tap tells ${p} you're thinking of them` },
];

function Group({ label, children }: { label: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: space.sm }}>
      <T variant="eyebrow" muted style={{ marginLeft: 4 }}>
        {label}
      </T>
      <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.md }}>{children}</View>
    </View>
  );
}

const LOOKS: { look: BubbleStyle; label: string; sample: string }[] = [
  { look: 'hearts', label: 'Fuchsia with hearts', sample: 'Miss you 💕' },
  { look: 'roses', label: 'Vines and roses', sample: 'Miss you too' },
];

function BubbleChoice({ look, label, sample, selected, onPress }: { look: BubbleStyle; label: string; sample: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{ flex: 1, alignItems: 'center', gap: space.sm, paddingVertical: space.md, borderRadius: radius.md, borderWidth: 2, borderColor: selected ? c.accent : c.line, backgroundColor: c.page }}>
      <LoveBubble look={look} mine={look === 'hearts'}>
        <T color={bubbleInk(look, dark).text} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
          {sample}
        </T>
      </LoveBubble>
      <T variant="small" style={{ textAlign: 'center' }}>
        {selected ? '✓ ' : ''}
        {label}
      </T>
    </Pressable>
  );
}

function ThemeChoice({ name, label, emoji, blurb, selected, onPress }: { name: ThemeName; label: string; emoji: string; blurb: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  const ink = heroInk(name, dark);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}. ${blurb}`}
      style={({ pressed }) => ({ width: '48%', flexGrow: 1, gap: 6, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ borderRadius: radius.xl + 3, borderWidth: 3, borderColor: selected ? c.accent : 'transparent' }}>
        <Hero height={96} theme={name}>
          <View style={{ flex: 1, padding: space.sm, justifyContent: 'flex-end' }}>
            <T variant="strong" color={ink.ink} style={{ textShadowColor: ink.shadow, textShadowRadius: 8 }}>
              {emoji} {label}
            </T>
          </View>
          {selected && (
            <View style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph name="check" color={c.onAccent} size={14} />
            </View>
          )}
        </Hero>
      </View>
      <T variant="fine" numberOfLines={2} style={{ paddingHorizontal: 4 }}>
        {blurb}
      </T>
    </Pressable>
  );
}

function FontChoice({ name, label, blurb, selected, onPress }: { name: FontName; label: string; blurb: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} font. ${blurb}`}
      style={{ flex: 1, minWidth: 96, padding: space.md, gap: 4, borderRadius: radius.md, borderWidth: 2, borderColor: selected ? c.accent : c.line, backgroundColor: selected ? c.accentSoft : c.surface }}>
      <Text style={[{ color: c.ink, fontSize: 24, fontWeight: '700' }, fontFor(700, true, name)]}>Aa</Text>
      <Text style={[{ color: c.ink, fontSize: 15, fontWeight: '700' }, fontFor(700, name === 'playful', name)]}>{label}</Text>
      <Text style={[{ color: c.muted, fontSize: 12.5 }, fontFor(400, false, name)]}>{blurb}</Text>
    </Pressable>
  );
}

const LOCK_AFTER: { after: LockAfter; label: string }[] = [
  { after: 0, label: 'Right away' },
  { after: 60, label: 'After 1 minute' },
  { after: 300, label: 'After 5 minutes' },
];

const HEATS: { heat: number; label: string; note: string }[] = [
  { heat: 0, label: 'Off', note: 'Light and deep questions only' },
  { heat: 1, label: 'Flirty', note: 'Playful and a little cheeky' },
  { heat: 2, label: 'Flirty and erotic', note: 'Desire and intimacy, for adults only' },
];

const SHARED_TEXT = ['Nothing extra is on for you both yet.', 'On for you both: Flirty.', 'On for you both: Flirty and Erotic.'];

const STATUS_TEXT: Record<NotificationStatus, string> = {
  on: 'On. You\'ll hear the love chime for messages, plans, memories and answers, and get a reminder an hour before each plan.',
  'reminders-only': 'Plan reminders work, but messages from your partner can\'t reach this phone yet.',
  off: 'Off. Turn them on so you know when your partner writes.',
  blocked: 'Turned off in your phone\'s settings. Open them, tap Notifications and switch them on.',
};

export default function Settings() {
  const c = useColors();
  const ctx = useCouple();
  const [name, setName] = useState(ctx?.profile.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const { isUpdatePending } = useUpdates();
  const [checking, setChecking] = useState(false);
  const [updateNote, setUpdateNote] = useState('');
  const [notif, setNotif] = useState<NotificationStatus | null>(null);
  const [notifNote, setNotifNote] = useState('');
  const [evening, setEvening] = useState(true);
  const [themeError, setThemeError] = useState('');
  const { settings: lock, reload: reloadLock } = useAppLock();
  const [pinTask, setPinTask] = useState<PinTask | null>(null);
  const [canBio, setCanBio] = useState(false);
  const theme = useThemeName();
  const font = useFontName();
  const [nickname, setNickname] = useState(ctx?.profile.partner_nickname ?? '');
  const [privateOn, setPrivateOn] = useState(!!ctx?.profile.private_notifications);
  const [widgetNote, setWidgetNote] = useState('');
  const userId = ctx?.userId;
  const refreshCouple = ctx?.refresh;

  // Shows your partner's latest settings, such as which question decks are on for you both.
  useEffect(() => {
    refreshCouple?.();
  }, [refreshCouple]);

  useEffect(() => {
    if (!userId) return;
    enableNotifications(userId, false)
      .then(setNotif)
      .catch(() => setNotif('reminders-only'));
  }, [userId]);

  useEffect(() => {
    eveningReminderOn().then(setEvening);
    biometricsAvailable().then(setCanBio);
  }, []);

  if (!ctx) return null;
  const { profile, partner, couple, refresh, signOut } = ctx;

  async function chooseTheme(name: ThemeName) {
    setThemeError('');
    const { error: err } = await supabase.from('profiles').update({ theme: name }).eq('id', profile.id);
    if (err) return setThemeError(friendlyError(err));
    await refresh();
  }

  async function saveProfile(changes: Record<string, string | boolean | null>, note?: string) {
    setError('');
    const { error: err } = await supabase.from('profiles').update(changes).eq('id', profile.id);
    if (err) return setError(friendlyError(err));
    if (note) setSaved(note);
    await refresh();
  }

  async function toggleEvening(on: boolean) {
    setEvening(on);
    await setEveningReminder(couple.id, on);
  }

  async function saveName() {
    setError('');
    if (!name.trim()) return setError('Your name can\'t be empty.');
    setSaving(true);
    const { error: err } = await supabase.from('profiles').update({ name: name.trim() }).eq('id', profile.id);
    setSaving(false);
    if (err) return setError(friendlyError(err));
    setSaved('Name saved');
    await refresh();
  }

  async function saveSince(value: string | null) {
    if (!value) return;
    setError('');
    const { error: err } = await supabase.from('couples').update({ together_since: value }).eq('id', couple.id);
    if (err) return setError(friendlyError(err));
    setSaved('Date saved');
    await refresh();
  }

  async function chooseBubble(look: BubbleStyle) {
    setError('');
    const { error: err } = await supabase.from('profiles').update({ bubble: look }).eq('id', profile.id);
    if (err) return setError(friendlyError(err));
    await refresh();
  }

  async function saveHeat(heat: number) {
    setError('');
    const { error: err } = await supabase.from('profiles').update({ heat }).eq('id', profile.id);
    if (err) return setError(friendlyError(err));
    await refresh();
  }

  function chooseHeat(heat: number) {
    if (heat < 2 || (profile.heat ?? 0) >= 2) return saveHeat(heat);
    Alert.alert('For adults only', 'Erotic questions are about desire and intimacy. Are you 18 or older?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes, switch on', onPress: () => saveHeat(heat) },
    ]);
  }

  async function turnOnNotifications() {
    setNotifNote('');
    if (notif === 'blocked') return Linking.openSettings();
    setNotif(await enableNotifications(profile.id, true));
  }

  async function addWidget(name: WidgetName) {
    setWidgetNote('');
    const asked = await pinWidget(name);
    setWidgetNote(
      asked
        ? 'Your phone will ask where to put it.'
        : 'Your home screen can\'t add it from here. Touch and hold an empty spot on your home screen, tap Widgets, then find Love Birds.',
    );
  }

  async function sendTest() {
    setNotifNote('');
    const { data, error: err } = await supabase.rpc('send_test_notification');
    if (err) return setNotifNote(friendlyError(err));
    setNotifNote(data ? 'Sent. It should arrive in a few seconds.' : 'This phone isn\'t registered yet. Close the app and open it again.');
  }

  async function checkForUpdate() {
    setUpdateNote('');
    setChecking(true);
    try {
      const ready = await downloadUpdate();
      if (!ready) setUpdateNote('You have the latest version.');
    } catch {
      setUpdateNote('Couldn\'t check right now. Try again in a minute.');
    }
    setChecking(false);
  }

  function confirmUnlink() {
    Alert.alert(
      `Unlink from ${partner.name}?`,
      `You'll leave your shared space. ${partner.name} keeps the calendar, chat and memories you shared. You can link again with a new code.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await supabase.rpc('unlink_couple');
            if (err) return setError(friendlyError(err));
            await refresh();
          },
        },
      ],
    );
  }

  function confirmDelete() {
    Alert.alert('Delete your account?', 'This removes your account, your messages and your answers. It can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete my account',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.rpc('delete_my_account');
          if (err) return setError(friendlyError(err));
          await signOut();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <IconButton label="Back" onPress={() => router.back()}>
          <Glyph name="back" color={c.ink} />
        </IconButton>
        <T variant="strong" style={{ fontSize: 18 }}>
          Settings
        </T>
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <Group label="You two">
          <Field label="Your name" value={name} onChangeText={(t) => { setName(t); setSaved(''); }} maxLength={60} />
          {name.trim() !== profile.name && <Button title="Save name" onPress={saveName} loading={saving} />}
          <Row style={{ justifyContent: 'space-between' }}>
            <T muted>Partner</T>
            <T variant="strong">{partner.real_name ?? partner.name}</T>
          </Row>
          <Field
            label={`What you call ${partner.real_name ?? partner.name} (optional)`}
            placeholder="Babe, Mpenzi, Sweetie…"
            value={nickname}
            onChangeText={(t) => {
              setNickname(t);
              setSaved('');
            }}
            maxLength={30}
          />
          {nickname.trim() !== (profile.partner_nickname ?? '') && (
            <Button
              title={nickname.trim() ? 'Save pet name' : 'Use their name again'}
              onPress={() => saveProfile({ partner_nickname: nickname.trim() || null }, nickname.trim() ? `${partner.real_name ?? partner.name} now shows as ${nickname.trim()}` : 'Pet name removed')}
            />
          )}
          <T variant="fine">Only changes what you see, and the name on notifications from them.</T>
          <Row style={{ alignItems: 'flex-start' }}>
            <DateField label="Together since" value={couple.together_since} onChange={saveSince} maximumDate={today()} />
          </Row>
          <Row style={{ alignItems: 'flex-start' }}>
            <DateField label="Your birthday" value={profile.birthday ?? null} onChange={(v) => v && saveProfile({ birthday: v }, 'Birthday saved')} maximumDate={today()} placeholder="Add it" />
          </Row>
          <T variant="fine">Birthdays and anniversaries show on the calendar.</T>
          {saved ? <T variant="small" accent>{saved}</T> : null}
          <ErrorText>{error}</ErrorText>
        </Group>

        <Group label="Theme">
          <T variant="small" muted>
            Changes the colours and the moving picture on Home. Just for you: {partner.name} picks their own. Each theme has a light and a dark look that follows your phone.
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {THEMES.map((t) => (
              <ThemeChoice key={t.name} {...t} selected={theme === t.name} onPress={() => chooseTheme(t.name)} />
            ))}
          </View>
          <ErrorText>{themeError}</ErrorText>
        </Group>

        <Group label="Your animal">
          <Row>
            <Avatar name={profile.name} size={56} />
            <T variant="small" muted style={{ flex: 1 }}>
              Pick an animal to stand for you in your circle, all around the app. {partner.name} picks their own.
            </T>
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {ANIMALS.map((a) => {
              const on = profile.animal === a.key;
              return (
                <Pressable
                  key={a.key}
                  onPress={() => saveProfile({ animal: on ? null : a.key })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={a.label}
                  style={{ width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? c.accent : 'transparent', backgroundColor: on ? c.accentSoft : c.surface }}>
                  <T style={{ fontSize: 28, lineHeight: 34 }}>{a.emoji}</T>
                </Pressable>
              );
            })}
          </View>
          {profile.animal ? <Button title="Use my initial instead" variant="ghost" onPress={() => saveProfile({ animal: null })} /> : null}
        </Group>

        <Group label="Font">
          <T variant="small" muted>
            Just for you, like your theme.
          </T>
          <Row gap={space.sm} style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
            {FONTS.map((f) => (
              <FontChoice key={f.name} {...f} selected={font === f.name} onPress={() => saveProfile({ font: f.name })} />
            ))}
          </Row>
        </Group>

        <Group label="Your chat bubble">
          <T variant="small" muted>
            Your messages show in this style on both phones. {partner.name} picks their own.
          </T>
          <Row gap={space.sm} style={{ alignItems: 'stretch' }}>
            {LOOKS.map((l) => (
              <BubbleChoice key={l.look} {...l} selected={profile.bubble === l.look} onPress={() => chooseBubble(l.look)} />
            ))}
          </Row>
        </Group>

        <Group label="After dark">
          <T variant="small" muted>
            Flirty and erotic questions for your games. A deck appears only when you&apos;ve both switched it on, and the app only shows what&apos;s on for
            you both.
          </T>
          {HEATS.map((h) => {
            const selected = (profile.heat ?? 0) === h.heat;
            return (
              <Pressable
                key={h.heat}
                onPress={() => chooseHeat(h.heat)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? c.accent : c.line, alignItems: 'center', justifyContent: 'center' }}>
                  {selected && <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.accent }} />}
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="strong">{h.label}</T>
                  <T variant="small" muted>
                    {h.note}
                  </T>
                </View>
              </Pressable>
            );
          })}
          <T variant="small" accent style={{ fontWeight: '700' }}>
            {SHARED_TEXT[sharedHeat(profile, partner)]}
          </T>
        </Group>

        <Group label="Notifications">
          <T variant="small">{notif ? STATUS_TEXT[notif] : 'Checking…'}</T>
          {notif === 'on' && <Button title="Send me a test" variant="outline" onPress={sendTest} />}
          {(notif === 'off' || notif === 'blocked') && (
            <Button title={notif === 'blocked' ? 'Open phone settings' : 'Turn on notifications'} onPress={turnOnNotifications} />
          )}
          {notifNote ? <T variant="small" muted>{notifNote}</T> : null}
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T variant="strong">Evening reminder</T>
              <T variant="small" muted>
                8 PM, for your rose, thorn and bud and your photo of the day. Skipped once you&apos;ve checked in.
              </T>
            </View>
            <Switch
              value={evening}
              onValueChange={toggleEvening}
              trackColor={{ true: c.accent, false: c.line }}
              thumbColor={c.surface}
              accessibilityLabel="Evening reminder"
            />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T variant="strong">Private notifications</T>
              <T variant="small" muted>
                Notifications say “New message” instead of showing what {partner.name} wrote in the chat or a letter, so no one else can read it on your lock screen.
              </T>
            </View>
            <Switch
              value={privateOn}
              onValueChange={(on) => {
                setPrivateOn(on);
                saveProfile({ private_notifications: on });
              }}
              trackColor={{ true: c.accent, false: c.line }}
              thumbColor={c.surface}
              accessibilityLabel="Private notifications"
            />
          </Row>
        </Group>

        {Platform.OS !== 'ios' && (
          <Group label="Home-screen widgets">
            <T variant="small" muted>
              See each other from your home screen. Widgets update every half hour and each time you leave the app.
            </T>
            {WIDGET_CHOICES.map((w) => (
              <Row key={w.name}>
                <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22 }}>{w.badge}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="strong">
                    {w.label}{' '}
                    <T variant="small" muted>
                      {w.size}
                    </T>
                  </T>
                  <T variant="small" muted>
                    {w.blurb(partner.name)}
                  </T>
                </View>
                <Button title="Add" variant="outline" onPress={() => addWidget(w.name)} />
              </Row>
            ))}
            {widgetNote ? <T variant="small">{widgetNote}</T> : null}
            {privateOn ? (
              <T variant="small" muted>
                Private notifications are on, so widgets leave out plan names and the word {partner.name} picks for their mood.
              </T>
            ) : null}
          </Group>
        )}

        {lockSupported && (
          <Group label="App lock">
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T variant="strong">Lock Love Birds</T>
                <T variant="small" muted>
                  Ask for a PIN when the app opens, so no one else can read your chats on this phone.
                </T>
              </View>
              <Switch
                value={lock.on}
                onValueChange={(on) => setPinTask(on ? 'on' : 'off')}
                trackColor={{ true: c.accent, false: c.line }}
                thumbColor={c.surface}
                accessibilityLabel="Lock Love Birds"
              />
            </Row>
            {lock.on && canBio && (
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="strong" style={{ flex: 1 }}>
                  Unlock with fingerprint
                </T>
                <Switch
                  value={lock.biometrics}
                  onValueChange={async (on) => {
                    await setBiometrics(on);
                    await reloadLock();
                  }}
                  trackColor={{ true: c.accent, false: c.line }}
                  thumbColor={c.surface}
                  accessibilityLabel="Unlock with fingerprint"
                />
              </Row>
            )}
            {lock.on && (
              <>
                <T variant="small" muted style={{ fontWeight: '700' }}>
                  Lock after leaving the app
                </T>
                <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                  {LOCK_AFTER.map((o) => (
                    <Chip
                      key={o.after}
                      label={o.label}
                      selected={lock.after === o.after}
                      onPress={async () => {
                        await setLockAfter(o.after);
                        await reloadLock();
                      }}
                    />
                  ))}
                </Row>
                <Button title="Change PIN" variant="outline" onPress={() => setPinTask('change')} />
              </>
            )}
          </Group>
        )}

        <Group label="Privacy">
          <T variant="small">
            Only you and {partner.name} can see your calendar, chat, memories and answers. Photos are stored privately and open only inside the app, unless you save one to your phone or save a backup.
          </T>
        </Group>

        {Platform.OS !== 'ios' && (
          <Group label="Backup">
            <BackupControls coupleId={couple.id} userId={profile.id} />
          </Group>
        )}

        <Group label="App">
          <Row style={{ justifyContent: 'space-between' }}>
            <T muted>Version</T>
            <T variant="strong">{versionLabel()}</T>
          </Row>
          {isUpdatePending ? (
            <Button title="Restart to update" onPress={restartIntoUpdate} />
          ) : updatesEnabled ? (
            <Button title="Check for updates" variant="outline" onPress={checkForUpdate} loading={checking} />
          ) : null}
          {updateNote ? <T variant="small" muted>{updateNote}</T> : null}
        </Group>

        <Group label="Account">
          <Pressable onPress={signOut} accessibilityRole="button">
            <T variant="strong">Sign out</T>
          </Pressable>
          <Pressable onPress={confirmUnlink} accessibilityRole="button">
            <T variant="strong" color={c.danger}>
              Unlink from {partner.name}
            </T>
          </Pressable>
          <Pressable onPress={confirmDelete} accessibilityRole="button">
            <T variant="strong" color={c.danger}>
              Delete my account
            </T>
          </Pressable>
        </Group>
      </ScrollView>
      <PinSetup task={pinTask} onClose={() => setPinTask(null)} />
    </SafeAreaView>
  );
}
