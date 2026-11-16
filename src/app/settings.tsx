import { router } from 'expo-router';
import { useUpdates } from 'expo-updates';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, DateField, ErrorText, Field, Glyph, IconButton, Row, T } from '@/components/ui';
import { today } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import { downloadUpdate, restartIntoUpdate, updatesEnabled, versionLabel } from '@/lib/updates';

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

  if (!ctx) return null;
  const { profile, partner, couple, refresh, signOut } = ctx;

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
            <T variant="strong">{partner.name}</T>
          </Row>
          <Row style={{ alignItems: 'flex-start' }}>
            <DateField label="Together since" value={couple.together_since} onChange={saveSince} maximumDate={today()} />
          </Row>
          {saved ? <T variant="small" accent>{saved}</T> : null}
          <ErrorText>{error}</ErrorText>
        </Group>

        <Group label="Privacy">
          <T variant="small">
            Only you and {partner.name} can see your calendar, chat, memories and answers. Photos are stored privately and open only inside the app.
          </T>
        </Group>

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
    </SafeAreaView>
  );
}
