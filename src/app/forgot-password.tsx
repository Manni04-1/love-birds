import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { Button, Card, ErrorText, Field, Glyph, IconButton, Row, T } from '@/components/ui';
import { newPasswordProblem, PASSWORD_MIN, resetPassword, sendResetCode } from '@/lib/passwords';
import { space, useColors } from '@/lib/theme';

/**
 * Forgot your password: Supabase emails a code, and the code plus a new password signs you
 * back in. Once that works, the app opens by itself.
 */
export default function ForgotPassword() {
  const c = useColors();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  async function send() {
    setError('');
    setNote('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter the email you signed up with.');
    setBusy(true);
    const err = await sendResetCode(email);
    setBusy(false);
    if (err) return setError(err);
    if (sent) setNote('Sent another code. Use the newest one.');
    setSent(true);
  }

  async function reset() {
    setError('');
    setNote('');
    if (!/^\d{6,10}$/.test(code.trim())) return setError('Type the code from the email. It is a row of numbers.');
    const problem = newPasswordProblem(password, again);
    if (problem) return setError(problem);
    setBusy(true);
    const err = await resetPassword(email, code, password);
    setBusy(false);
    // On success you're signed in, and the app moves on by itself.
    if (err) setError(err);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
          <IconButton label="Back" onPress={() => router.back()}>
            <Glyph name="back" color={c.ink} />
          </IconButton>
          <T variant="strong" style={{ fontSize: 18 }}>
            Forgot password
          </T>
        </Row>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          {!sent ? (
            <>
              <T variant="title">Let&apos;s get you back in</T>
              <T muted>Type the email you signed up with, and we&apos;ll email you a code to set a new password.</T>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
                onSubmitEditing={send}
              />
              <ErrorText>{error}</ErrorText>
              <Button title="Email me a code" onPress={send} loading={busy} />
            </>
          ) : (
            <>
              <Card tone="soft">
                <T variant="heading">Check your email</T>
                <T>
                  If {email.trim()} has a Love Birds account, a code is on its way. It can take a minute, and it might land in spam.
                </T>
              </Card>
              <Field
                label="Code from the email"
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={10}
                placeholder="123456"
              />
              <Field
                label="New password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder={`At least ${PASSWORD_MIN} characters`}
              />
              <Field
                label="New password again"
                value={again}
                onChangeText={setAgain}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                onSubmitEditing={reset}
              />
              <ErrorText>{error}</ErrorText>
              {note ? (
                <T variant="small" muted>
                  {note}
                </T>
              ) : null}
              <Button title="Set new password" onPress={reset} loading={busy} />
              <View style={{ alignItems: 'center', gap: space.xs }}>
                <Button variant="ghost" title="Send a new code" onPress={send} disabled={busy} />
                <Button
                  variant="ghost"
                  title="Use a different email"
                  onPress={() => {
                    setSent(false);
                    setCode('');
                    setError('');
                    setNote('');
                  }}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
