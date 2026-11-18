import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Share, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { Button, Card, ErrorText, Row, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';

export default function Link() {
  const c = useColors();
  const { profile, couple, refresh, signOut } = useSession();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const waiting = !!couple?.invite_code;
  const expired = couple?.invite_expires_at ? new Date(couple.invite_expires_at) < new Date() : false;

  // While the invite is out, check every few seconds whether the partner has joined.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [waiting, refresh]);

  async function invite() {
    setError('');
    setBusy(true);
    const { error: err } = await supabase.rpc('create_couple');
    setBusy(false);
    if (err) return setError(friendlyError(err));
    await refresh();
  }

  async function join() {
    setError('');
    if (code.trim().length !== 6) return setError('Enter all 6 characters of the code.');
    setBusy(true);
    const { error: err } = await supabase.rpc('join_couple', { p_code: code.trim().toUpperCase() });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    await refresh();
  }

  const inviteText = couple?.invite_code ? `Join me on Love Birds, our private app for two. Our code is ${couple.invite_code}` : '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.xs, marginTop: space.xl }}>
            <T variant="eyebrow">Hi {profile?.name ?? 'there'}</T>
            <T variant="title">{waiting ? 'Send this code to your partner' : 'Link with your partner'}</T>
          </View>

          {waiting ? (
            <>
              <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
                <T variant="eyebrow">Your invite code</T>
                <T style={{ fontSize: 44, lineHeight: 52, fontWeight: '800', letterSpacing: 8, color: c.accent }} selectable>
                  {couple?.invite_code}
                </T>
                <T variant="fine">{expired ? 'This code has expired. Get a new one below.' : 'Works once and expires in 24 hours'}</T>
              </Card>
              <Row>
                <Button
                  style={{ flex: 1 }}
                  title="Share"
                  onPress={() => Share.share({ message: inviteText })}
                  disabled={expired}
                />
                <Button
                  style={{ flex: 1 }}
                  variant="outline"
                  title={copied ? 'Copied' : 'Copy code'}
                  disabled={expired}
                  onPress={async () => {
                    await Clipboard.setStringAsync(couple?.invite_code ?? '');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                />
              </Row>
              <Row gap={space.sm} style={{ justifyContent: 'center' }}>
                <ActivityIndicator color={c.accent} />
                <T muted variant="small">
                  Waiting for your partner to join…
                </T>
              </Row>
              <T variant="small" muted>
                Your partner installs Love Birds, creates an account, taps &quot;I have a code&quot; and enters this code. Then everything you share is just between the two of you.
              </T>
              <ErrorText>{error}</ErrorText>
              <Button title="Get a new code" variant="ghost" onPress={invite} loading={busy} />
            </>
          ) : joining ? (
            <>
              <T muted>Ask your partner for the 6-character code on their screen.</T>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6))}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                maxLength={6}
                placeholder="LB7Q4K"
                placeholderTextColor={c.line}
                accessibilityLabel="Invite code"
                onSubmitEditing={join}
                style={{
                  fontSize: 36,
                  fontWeight: '800',
                  letterSpacing: 10,
                  textAlign: 'center',
                  color: c.ink,
                  backgroundColor: c.surface,
                  borderColor: c.line,
                  borderWidth: 1.5,
                  borderRadius: radius.md,
                  paddingVertical: space.lg,
                }}
              />
              <ErrorText>{error}</ErrorText>
              <Button title="Link our accounts" onPress={join} loading={busy} />
              <Button title="I'd rather invite them" variant="ghost" onPress={() => { setJoining(false); setError(''); }} />
            </>
          ) : (
            <>
              <T muted>One of you sends an invite code. The other enters it. You only do this once.</T>
              <Card style={{ gap: space.md }}>
                <T variant="strong">Starting things off?</T>
                <T variant="small" muted>Get a code to send to your partner.</T>
                <Button title="Invite my partner" onPress={invite} loading={busy} />
              </Card>
              <Card style={{ gap: space.md }}>
                <T variant="strong">Got a code already?</T>
                <T variant="small" muted>Enter the code your partner sent you.</T>
                <Button title="I have a code" variant="outline" onPress={() => { setJoining(true); setError(''); }} />
              </Card>
              <ErrorText>{error}</ErrorText>
            </>
          )}

          <View style={{ flex: 1 }} />
          <Button title="Sign out" variant="ghost" onPress={signOut} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
