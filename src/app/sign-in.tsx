import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { Button, Card, ErrorText, Field, Glyph, IconButton, Row, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';

export default function SignIn() {
  const c = useColors();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signup' | 'signin'>(params.mode === 'signin' ? 'signin' : 'signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);

  const signup = mode === 'signup';

  async function submit() {
    setError('');
    if (signup && !name.trim()) return setError('Add your first name. Your partner sees it.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use a password with at least 8 characters.');
    setBusy(true);
    try {
      if (signup) {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        });
        if (err) throw err;
        // With email confirmation on, there's no session until they click the link.
        if (!data.session) setCheckEmail(true);
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
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
            {signup ? 'Create your account' : 'Welcome back'}
          </T>
        </Row>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          {checkEmail ? (
            <Card tone="soft">
              <T variant="heading">Check your email</T>
              <T>
                We sent a link to {email.trim()}. Open it on this phone, then come back and sign in.
              </T>
              <Button
                title="I've confirmed, sign me in"
                variant="outline"
                onPress={() => {
                  setCheckEmail(false);
                  setMode('signin');
                }}
              />
            </Card>
          ) : (
            <>
              <T variant="title">{signup ? 'First, who are you?' : 'Sign in to your space'}</T>
              {signup && (
                <Field label="Your first name" value={name} onChangeText={setName} autoComplete="given-name" textContentType="givenName" placeholder="e.g. Manni" returnKeyType="next" />
              )}
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={signup ? 'new-password' : 'current-password'}
                textContentType={signup ? 'newPassword' : 'password'}
                placeholder="At least 8 characters"
                onSubmitEditing={submit}
              />
              <ErrorText>{error}</ErrorText>
              <Button title={signup ? 'Create account' : 'Sign in'} onPress={submit} loading={busy} />
              <View style={{ alignItems: 'center' }}>
                {!signup && (
                  <Button
                    variant="ghost"
                    title="Forgot password?"
                    onPress={() => {
                      setError('');
                      router.push({ pathname: '/forgot-password', params: email.trim() ? { email: email.trim() } : {} });
                    }}
                  />
                )}
                <Button
                  variant="ghost"
                  title={signup ? 'I already have an account' : 'I need a new account'}
                  onPress={() => {
                    setError('');
                    setMode(signup ? 'signin' : 'signup');
                  }}
                />
              </View>
              {signup && <T variant="fine" style={{ textAlign: 'center' }}>Your partner sees your name next to everything you share.</T>}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
